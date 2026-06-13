import { validateRuntimeState } from "@/lib/live/storage";
import type { LiveRuntimeState } from "@/lib/live/types";

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

export async function pushRuntimeState(
  sessionId: string,
  runtime: LiveRuntimeState
): Promise<boolean> {
  try {
    const commandRes = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      }),
    });
    if (commandRes.ok) return true;

    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/runtime`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(runtime),
    });
    return res.ok;
  } catch {
    return false;
  }
}
