import { HOST_DEVICE_HEADER } from "@/lib/live/hostDevice";
import { validateRuntimeState } from "@/lib/live/storage";
import type { LiveRuntimeState } from "@/lib/live/types";

/**
 * The console's saves (spec M-9, S4.3, S4.4). Every save goes to
 * /api/sessions/[id]/commands, which writes the runtime and its session
 * event in one transaction, held to the server's control lock and to the
 * runtime version this console last saw. Only a save that landed counts:
 * every refusal comes back with its reason, and the console shows it.
 *
 * A save that could not reach the server at all (offline, a 5xx) keeps the
 * newest runtime in localStorage and is retried every 5 seconds; a refusal
 * (another console has control, an out-of-date version, a game that no
 * longer exists) is never retried, because retrying could not make it right.
 */

function queueKey(sessionId: string): string {
  return `music-bingo-runtime-sync-queue:${sessionId}`;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readQueuedRuntime(sessionId: string): LiveRuntimeState | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(queueKey(sessionId));
    if (!raw) return null;
    return validateRuntimeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function queueRuntime(sessionId: string, runtime: LiveRuntimeState): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(queueKey(sessionId), JSON.stringify(runtime));
  } catch {
    // Ignore storage failures. The in-memory host state still keeps running.
  }
}

export function clearQueuedRuntime(sessionId: string): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(queueKey(sessionId));
  } catch {
    // ignore
  }
}

/** What happened to one save. */
export type SaveOutcome =
  | { kind: "saved"; version: number }
  /** Another console holds control; seconds since it was last heard from, if the server said. */
  | { kind: "not_controller"; secondsSinceSeen: number | null }
  /** The save was out of date: the stored runtime is at `version`. Nothing was written. */
  | { kind: "conflict"; version: number | null }
  /** The game does not exist any more. */
  | { kind: "missing" }
  /** Signed out, or the account is no longer active staff (401 or 403). */
  | { kind: "signed_out"; status: number }
  /** The server could not be reached or failed: worth retrying. */
  | { kind: "failed"; message: string };

type SaveBody = { ok?: unknown; reason?: unknown; version?: unknown; secondsSinceSeen?: unknown; error?: unknown };

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Reads a save or control answer (lib/live/liveWriteResponse.ts) into an outcome. */
export function readSaveOutcome(status: number, body: SaveBody | null): SaveOutcome {
  if (status === 401 || status === 403) return { kind: "signed_out", status };
  if (status === 200 && body?.ok === true) {
    const version = numberOrNull(body.version);
    if (version !== null) return { kind: "saved", version };
    return { kind: "failed", message: "The server's answer was incomplete." };
  }
  if (status === 404 || body?.reason === "missing") return { kind: "missing" };
  if (body?.reason === "not_controller") return { kind: "not_controller", secondsSinceSeen: numberOrNull(body.secondsSinceSeen) };
  if (body?.reason === "conflict") return { kind: "conflict", version: numberOrNull(body.version) };
  return { kind: "failed", message: typeof body?.error === "string" && body.error ? body.error : `The server answered ${status}.` };
}

export async function pushRuntimeState(
  sessionId: string,
  runtime: LiveRuntimeState,
  options: { deviceId: string; expectedVersion: number }
): Promise<SaveOutcome> {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [HOST_DEVICE_HEADER]: options.deviceId },
      body: JSON.stringify({
        type: "runtime_snapshot",
        clientEventId: `runtime-${runtime.updatedAtMs}`,
        payload: {
          mode: runtime.mode,
          activeGameNumber: runtime.activeGameNumber,
          screenId: runtime.screenId ?? null,
          trackId: runtime.currentTrack?.trackId ?? null,
          updatedAtMs: runtime.updatedAtMs,
        },
        runtime,
        expectedVersion: options.expectedVersion,
      }),
    });
    const body = (await res.json().catch(() => null)) as SaveBody | null;
    return readSaveOutcome(res.status, body);
  } catch (err) {
    return { kind: "failed", message: err instanceof Error ? err.message : "Could not reach the server." };
  }
}

/** What the console shows about its saves. */
export type SyncState =
  | { status: "saved" }
  | { status: "saving" }
  /** Not saved yet, still trying (the connection dropped or the server failed). */
  | { status: "retrying"; message: string }
  /** Not saved, and retrying would not help: the host must act. */
  | { status: "refused"; title: string; message: string };

export const SAVE_MESSAGES = Object.freeze({
  retrying: "That change has not reached the TV yet. The console keeps trying every 5 seconds; the TV shows the last saved screen until then.",
  notControllerTitle: "Not saved: another device has control",
  notController: "Another device is running this game, so that change was not saved. Take over on this device once it has been quiet for 30 seconds.",
  conflictTitle: "Not saved: the game changed elsewhere",
  conflict: "Another device saved a newer version of this game, so that change was dropped. The console now shows the latest saved state.",
  missingTitle: "Not saved: this game no longer exists",
  missing: "The game was deleted, so nothing can be saved to it. Go back to the games list.",
});

/** The console's sync state after a save outcome (never "saved" for a refusal). */
export function syncStateFor(outcome: SaveOutcome): SyncState {
  switch (outcome.kind) {
    case "saved":
      return { status: "saved" };
    case "failed":
      return { status: "retrying", message: SAVE_MESSAGES.retrying };
    case "not_controller":
      return { status: "refused", title: SAVE_MESSAGES.notControllerTitle, message: SAVE_MESSAGES.notController };
    case "conflict":
      return { status: "refused", title: SAVE_MESSAGES.conflictTitle, message: SAVE_MESSAGES.conflict };
    case "missing":
      return { status: "refused", title: SAVE_MESSAGES.missingTitle, message: SAVE_MESSAGES.missing };
    case "signed_out":
      // The browser is on its way to sign in (lib/live/signInGuard.ts).
      return { status: "refused", title: "Not saved: signed out", message: "Your sign-in has ended. Taking you to the sign-in page..." };
  }
}

/** Whether a save with this outcome should stay queued and be tried again. */
export function shouldRetry(outcome: SaveOutcome): boolean {
  return outcome.kind === "failed";
}
