/**
 * Which runtime the TV shows (spec M-9, S4.4): stale state is dropped by the
 * runtime version the database stamps on every save
 * (live_sessions.runtime_version), not by a clock. A save that lands late,
 * or a poll that reads a replica a moment behind, can never step the TV back.
 *
 * The same-device BroadcastChannel (the laptop's own TV window) carries the
 * console's runtime before it is saved, so it has no version yet. Those
 * messages are ordered by the console's own clock (updatedAtMs), which is
 * safe because they all come from the one console, and a poll is not allowed
 * to step back behind one of them. Once broadcasts stop for BROADCAST_HOLD_MS
 * (that console lost control, or closed), polls rule again whatever the
 * clocks say.
 */

/** How long a same-device broadcast holds off older polls. */
export const BROADCAST_HOLD_MS = 5_000;

export interface AppliedMark {
  /** The newest version seen from a poll. */
  version: number | null;
  /** updatedAtMs of the runtime on screen. */
  updatedAtMs: number | null;
  /** Where the runtime on screen came from. */
  source: "poll" | "broadcast" | null;
  /** Local time the last broadcast arrived. */
  broadcastAtMs: number | null;
}

export const NOTHING_APPLIED: AppliedMark = { version: null, updatedAtMs: null, source: null, broadcastAtMs: null };

/** A polled snapshot: apply it, and what the mark becomes either way. */
export function decidePoll(
  mark: AppliedMark,
  version: number,
  updatedAtMs: number,
  nowMs: number
): { apply: boolean; mark: AppliedMark } {
  const newestVersion = mark.version === null ? version : Math.max(mark.version, version);
  // Older than a version already seen: a late or stale read.
  if (mark.version !== null && version < mark.version) return { apply: false, mark };
  // The same version already on screen from a poll: nothing new.
  if (mark.source === "poll" && mark.version === version) return { apply: false, mark };
  // The console's own window already showed something newer than this save.
  const broadcastFresh = mark.broadcastAtMs !== null && nowMs - mark.broadcastAtMs < BROADCAST_HOLD_MS;
  if (mark.source === "broadcast" && broadcastFresh && mark.updatedAtMs !== null && updatedAtMs < mark.updatedAtMs) {
    return { apply: false, mark: { ...mark, version: newestVersion } };
  }
  return { apply: true, mark: { ...mark, version: newestVersion, updatedAtMs, source: "poll" } };
}

/** A same-device broadcast: apply it only when newer than what is on screen. */
export function decideBroadcast(mark: AppliedMark, updatedAtMs: number, nowMs: number): { apply: boolean; mark: AppliedMark } {
  if (mark.updatedAtMs !== null && updatedAtMs <= mark.updatedAtMs) return { apply: false, mark };
  return { apply: true, mark: { ...mark, updatedAtMs, source: "broadcast", broadcastAtMs: nowMs } };
}
