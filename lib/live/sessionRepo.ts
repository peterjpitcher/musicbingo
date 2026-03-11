import { getSupabaseClient } from "@/lib/supabase";
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
    .map((row) => validateLiveSession(row.data))
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

  return validateLiveSession((data as SessionRow).data);
}

export async function upsertSession(session: LiveSessionV1): Promise<void> {
  const validated = validateLiveSession(session);
  if (!validated) throw new Error("Invalid live session payload.");

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("live_sessions").upsert(
    {
      id: validated.id,
      name: validated.name,
      created_at: validated.createdAt,
      event_date: validated.eventDateInput,
      data: validated,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) throw new Error(`Failed to upsert session: ${error.message}`);
}

export async function deleteSession(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("live_sessions").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete session: ${error.message}`);
}

export async function getRuntimeState(id: string): Promise<LiveRuntimeState | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("live_sessions")
    .select("runtime_data")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to get runtime state: ${error.message}`);
  if (!data) return null;

  return validateRuntimeState((data as { runtime_data: unknown }).runtime_data);
}

export async function upsertRuntimeState(id: string, runtime: LiveRuntimeState): Promise<void> {
  const validated = validateRuntimeState(runtime);
  if (!validated) throw new Error("Invalid runtime state payload.");

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("live_sessions")
    .update({ runtime_data: validated, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to upsert runtime state: ${error.message}`);
}
