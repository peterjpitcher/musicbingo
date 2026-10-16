/**
 * The TV's song clock.
 *
 * The display polls the host's saved state and counts the song's progress up
 * locally between polls. Two things made that clock jump about on
 * 16 October 2026:
 *
 * 1. Saves landing out of order. On a slow network the host's two-second
 *    saves overlap, an older one can finish last and become the stored state,
 *    and the TV jumped back to it (19 of 182 saves in six minutes).
 * 2. Re-anchoring on every save. Each save carries the position Spotify
 *    reported a second or two earlier, so snapping to it pulled the clock
 *    back every couple of seconds.
 */

export type ProgressAnchor = {
  trackId: string | null;
  /** Song position, in milliseconds, at local time `atMs`. */
  progressMs: number;
  /** Local clock time (Date.now) when this position applied. */
  atMs: number;
};

/** How far behind the shown position a save may be and still count as lag rather than a restart. */
export const DISPLAY_LAG_TOLERANCE_MS = 4_000;

/** Position the TV is showing now for an anchor. */
export function progressAt(anchor: ProgressAnchor, isPlaying: boolean, nowMs: number): number {
  return anchor.progressMs + (isPlaying ? Math.max(0, nowMs - anchor.atMs) : 0);
}

/**
 * The next anchor when a save arrives. Same song and only slightly behind
 * what is already showing: that is the save's lag, so keep counting from the
 * shown position. Anything else (new song, a forward jump, a real restart or
 * seek further back than the tolerance, or a paused song) takes the save.
 */
export function nextProgressAnchor(params: {
  previous: ProgressAnchor | null;
  incoming: { trackId: string | null; progressMs: number };
  isPlaying: boolean;
  nowMs: number;
  toleranceMs?: number;
}): ProgressAnchor {
  const { previous, incoming, isPlaying, nowMs } = params;
  const tolerance = params.toleranceMs ?? DISPLAY_LAG_TOLERANCE_MS;
  if (previous && isPlaying && previous.trackId === incoming.trackId) {
    const shown = progressAt(previous, true, nowMs);
    const behindBy = shown - incoming.progressMs;
    if (behindBy > 0 && behindBy <= tolerance) {
      return { trackId: incoming.trackId, progressMs: shown, atMs: nowMs };
    }
  }
  return { trackId: incoming.trackId, progressMs: incoming.progressMs, atMs: nowMs };
}

/**
 * Only move forward through the host's saves: an older one arriving late is
 * ignored. A save far older than the last one is taken anyway, as that means
 * the host's clock or state was reset rather than a late arrival.
 */
export function isNewerRuntime(
  incomingUpdatedAtMs: number,
  lastAppliedUpdatedAtMs: number | null,
  resetAfterMs = 30_000
): boolean {
  if (lastAppliedUpdatedAtMs === null || incomingUpdatedAtMs >= lastAppliedUpdatedAtMs) return true;
  return lastAppliedUpdatedAtMs - incomingUpdatedAtMs > resetAfterMs;
}
