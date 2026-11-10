import { getSupabaseClient } from "@/lib/supabase/service";
import { validateLiveSession } from "@/lib/live/validate";
import { validateRuntimeState } from "@/lib/live/storage";
import type { LiveRuntimeState, LiveSessionV1 } from "@/lib/live/types";

type SessionRow = {
  id: string;
  name: string;
  created_at: string;
  event_date: string;
  data: unknown;
  updated_at: string;
  brand_id: string | null;
};

export async function listSessions(): Promise<LiveSessionV1[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("live_sessions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list sessions: ${error.message}`);

  const rows = (data ?? []) as SessionRow[];
  return rows
    .map((row) => {
      const session = validateLiveSession(row.data);
      if (!session) return null;
      // Prefer brand_id from the DB column (authoritative) over JSONB
      if (row.brand_id) session.brandId = row.brand_id;
      return session;
    })
    .filter((s): s is LiveSessionV1 => s !== null);
}

export async function getSession(id: string): Promise<LiveSessionV1 | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("live_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to get session: ${error.message}`);
  if (!data) return null;

  const row = data as SessionRow;
  const session = validateLiveSession(row.data);
  if (!session) return null;

  // Prefer brand_id from the DB column (authoritative) over JSONB
  if (row.brand_id) session.brandId = row.brand_id;

  return session;
}

export async function upsertSession(session: LiveSessionV1): Promise<void> {
  const validated = validateLiveSession(session);
  if (!validated) throw new Error("Invalid live session payload.");

  // Preserve brandId from the input (validateLiveSession doesn't round-trip it yet)
  const dataWithBrand = { ...validated, ...(session.brandId ? { brandId: session.brandId } : {}) };

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("live_sessions").upsert(
    {
      id: validated.id,
      name: validated.name,
      created_at: validated.createdAt,
      event_date: validated.eventDateInput,
      data: dataWithBrand,
      brand_id: session.brandId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) throw new Error(`Failed to upsert session: ${error.message}`);
}

/** Throws SessionNotFoundError when no game had this id, so a delete that removed nothing is not reported as done. */
export async function deleteSession(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("live_sessions").delete().eq("id", id).select("id");
  if (error) throw new Error(`Failed to delete session: ${error.message}`);
  if (!data || data.length === 0) throw new SessionNotFoundError(id);
}

/** A game that does not exist (or has gone): a write to it is an error, never a silent success. */
export class SessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Session ${id} was not found.`);
    this.name = "SessionNotFoundError";
  }
}

type RecordRow = SessionRow & {
  runtime_data: unknown;
  runtime_version: number | string | null;
  link_generation: number | null;
};

/** A game with what the live routes need beside it (spec M-9). */
export interface SessionRecord {
  session: LiveSessionV1;
  /** live_sessions.event_date, the London date the game is for (YYYY-MM-DD). */
  eventDate: string;
  runtime: LiveRuntimeState | null;
  /** Up by one on every runtime change (a database trigger). */
  runtimeVersion: number;
  /** Stamped into every host and TV link; cancelling links adds one. */
  linkGeneration: number;
}

function toVersion(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

/** The game, its runtime, version and link generation in one read, or null. */
export async function getSessionRecord(id: string): Promise<SessionRecord | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("live_sessions")
    .select("id, name, created_at, event_date, data, updated_at, brand_id, runtime_data, runtime_version, link_generation")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to get session: ${error.message}`);
  if (!data) return null;
  const row = data as RecordRow;
  const session = validateLiveSession(row.data);
  if (!session) return null;
  if (row.brand_id) session.brandId = row.brand_id;
  return {
    session,
    eventDate: row.event_date ?? "",
    runtime: validateRuntimeState(row.runtime_data),
    runtimeVersion: toVersion(row.runtime_version),
    linkGeneration: typeof row.link_generation === "number" && row.link_generation >= 1 ? row.link_generation : 1,
  };
}

/** The stored runtime and its version, or null when the game does not exist. */
export async function getRuntimeWithVersion(
  id: string
): Promise<{ runtime: LiveRuntimeState | null; version: number } | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("live_sessions")
    .select("runtime_data, runtime_version")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to get runtime state: ${error.message}`);
  if (!data) return null;
  const row = data as { runtime_data: unknown; runtime_version: unknown };
  return { runtime: validateRuntimeState(row.runtime_data), version: toVersion(row.runtime_version) };
}

/** Why the database refused a live write or a control request. */
export type LiveRefusal = "inactive" | "missing" | "not_controller" | "conflict";

export type LiveWriteResult =
  | { ok: true; version: number }
  | { ok: false; reason: LiveRefusal; version: number | null; secondsSinceSeen: number | null };

function readLiveResult(data: unknown): LiveWriteResult {
  const body = (data ?? {}) as { ok?: unknown; reason?: unknown; runtime_version?: unknown; seen_seconds_ago?: unknown };
  const version = body.runtime_version === undefined || body.runtime_version === null ? null : toVersion(body.runtime_version);
  if (body.ok === true) return { ok: true, version: version ?? 0 };
  const reason = body.reason;
  if (reason === "inactive" || reason === "missing" || reason === "not_controller" || reason === "conflict") {
    return {
      ok: false,
      reason,
      version,
      secondsSinceSeen: typeof body.seen_seconds_ago === "number" ? body.seen_seconds_ago : null,
    };
  }
  throw new Error(`Unexpected live write result: ${JSON.stringify(body)}`);
}

export type ControlAction = "take" | "heartbeat" | "release";

const CONTROL_FUNCTIONS: Record<ControlAction, string> = {
  take: "take_live_control",
  heartbeat: "heartbeat_live_control",
  release: "release_live_control",
};

/**
 * The server-held control lock (migration 20261107120100): take or keep
 * control, send the holder's heartbeat, or let go. The database checks the
 * person is still active staff and holds the 30-second takeover rule.
 */
export async function controlSession(params: {
  action: ControlAction;
  sessionId: string;
  deviceId: string;
  userId: string;
}): Promise<LiveWriteResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc(CONTROL_FUNCTIONS[params.action], {
    p_session_id: params.sessionId,
    p_device: params.deviceId,
    p_user: params.userId,
  });
  if (error) throw new Error(`Failed to ${params.action} control: ${error.message}`);
  return readLiveResult(data);
}

/**
 * The one live write: the runtime, its snapshot row and (when given) the
 * session event, in one transaction, held to the control lock and to the
 * version the host last saw. A missing game, a lost lock or an out-of-date
 * version comes back as a refusal; nothing is written then.
 */
export async function saveLiveRuntime(params: {
  sessionId: string;
  deviceId: string;
  userId: string;
  expectedVersion: number;
  runtime: LiveRuntimeState;
  event?: { type: string; clientEventId?: string | null; payload?: unknown };
}): Promise<LiveWriteResult> {
  const validated = validateRuntimeState(params.runtime);
  if (!validated) throw new Error("Invalid runtime state payload.");
  if (validated.sessionId !== params.sessionId) throw new Error("Runtime session ID mismatch.");

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("save_live_runtime", {
    p_session_id: params.sessionId,
    p_device: params.deviceId,
    p_user: params.userId,
    p_expected_version: params.expectedVersion,
    p_runtime: validated,
    p_event_type: params.event?.type ?? null,
    p_client_event_id: params.event?.clientEventId ?? null,
    p_event_payload: params.event ? (params.event.payload ?? {}) : null,
  });
  if (error) throw new Error(`Failed to save runtime state: ${error.message}`);
  return readLiveResult(data);
}

/** Cancels every host and TV link made so far. Returns the new generation. */
export async function revokeSessionLinks(sessionId: string, userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("revoke_live_links", { p_session_id: sessionId, p_user: userId });
  if (error) throw new Error(`Failed to cancel links: ${error.message}`);
  if (typeof data !== "number") throw new SessionNotFoundError(sessionId);
  return data;
}

/** A game that could be tonight's, for lib/live/tonight.ts. */
export interface TonightCandidate {
  id: string;
  eventDate: string;
  updatedAt: string;
  createdAt: string;
  /** The runtime's mode, or null when the game has never been run. */
  mode: string | null;
}

/** Games whose event_date is one of `dates` (YYYY-MM-DD). Throws on any database error. */
export async function listSessionsOnDates(dates: readonly string[]): Promise<TonightCandidate[]> {
  if (dates.length === 0) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("live_sessions")
    .select("id, event_date, updated_at, created_at, mode:runtime_data->>mode")
    .in("event_date", [...dates]);
  if (error) throw new Error(`Failed to list tonight's sessions: ${error.message}`);
  return ((data ?? []) as { id: string; event_date: string; updated_at: string; created_at: string; mode: string | null }[]).map(
    (row) => ({ id: row.id, eventDate: row.event_date, updatedAt: row.updated_at, createdAt: row.created_at, mode: row.mode ?? null })
  );
}

export async function updateSessionBrand(sessionId: string, brandId: string): Promise<void> {
  const supabase = getSupabaseClient();

  // Also update brandId inside the JSONB data field for consistency
  const session = await getSession(sessionId);
  if (!session) throw new SessionNotFoundError(sessionId);
  session.brandId = brandId;

  const { data, error } = await supabase
    .from("live_sessions")
    .update({
      brand_id: brandId,
      data: session,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .select("id");

  if (error) throw new Error(`Failed to update session brand: ${error.message}`);
  // An update that matched no row (the game was deleted meanwhile) did not land.
  if (!data || data.length === 0) throw new SessionNotFoundError(sessionId);
}
