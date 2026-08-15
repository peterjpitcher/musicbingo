import { DEFAULT_REVEAL_CONFIG, type LiveRevealState, type RevealConfig } from "@/lib/live/types";

export type RevealPhase = "hidden" | "album" | "title" | "artist" | "advance";

function sanitizeProgressMs(progressMs: number): number {
  if (!Number.isFinite(progressMs)) return 0;
  return Math.max(0, Math.floor(progressMs));
}

export function getRevealPhase(progressMs: number, cfg: RevealConfig = DEFAULT_REVEAL_CONFIG): RevealPhase {
  const ms = sanitizeProgressMs(progressMs);
  if (ms >= cfg.nextMs) return "advance";
  if (ms >= cfg.artistMs) return "artist";
  if (ms >= cfg.titleMs) return "title";
  if (ms >= cfg.albumMs) return "album";
  return "hidden";
}

export function computeRevealState(progressMs: number, cfg: RevealConfig = DEFAULT_REVEAL_CONFIG): LiveRevealState {
  const phase = getRevealPhase(progressMs, cfg);
  return {
    showAlbum: phase === "album" || phase === "title" || phase === "artist" || phase === "advance",
    showTitle: phase === "title" || phase === "artist" || phase === "advance",
    showArtist: phase === "artist" || phase === "advance",
    shouldAdvance: phase === "advance",
  };
}

export function shouldTriggerNextForTrack(params: {
  trackId: string | null;
  revealState: LiveRevealState;
  advanceTriggeredForTrackId: string | null;
}): boolean {
  const { trackId, revealState, advanceTriggeredForTrackId } = params;
  if (!trackId || !revealState.shouldAdvance) return false;
  return advanceTriggeredForTrackId !== trackId;
}

/**
 * Number of consecutive polls that must report real playback while the runtime
 * still says "paused" before the mode is recovered. At the 2-second poll rate
 * that is roughly 4 seconds, comfortably past the window where Spotify's
 * eventually-consistent status still reports the old isPlaying after a
 * deliberate pause, and far short of losing a song.
 */
export const PAUSED_BUT_PLAYING_POLLS_BEFORE_RECOVERY = 3;

/**
 * Decides whether a runtime stuck on "paused" should be put back to "running".
 *
 * The auto-advance engine only runs in "running" mode, but the host can leave
 * the runtime on "paused" while Spotify is genuinely playing again: pressing
 * Resume in the Spotify app rather than in the host console, or a resume
 * command that quietly failed. That combination silently stops songs advancing
 * for the rest of the game (14 Aug 2026: game 2 ran 17 songs on manual skips).
 * Sustained real playback on a bingo screen is the source of truth.
 *
 * Only the game screens qualify. The Bingo Claim overlay also pauses, and there
 * the host wants playback to stay stopped even if the pause command misfired.
 */
export function shouldRecoverRunningMode(params: {
  mode: string;
  screenId: string;
  isPlaying: boolean;
  consecutivePlayingPolls: number;
}): boolean {
  const { mode, screenId, isPlaying, consecutivePlayingPolls } = params;
  if (mode !== "paused" || !isPlaying) return false;
  if (screenId !== "game1" && screenId !== "game2") return false;
  return consecutivePlayingPolls >= PAUSED_BUT_PLAYING_POLLS_BEFORE_RECOVERY;
}

export function updateAdvanceTrackMarker(params: {
  trackId: string | null;
  advanceTriggeredForTrackId: string | null;
}): string | null {
  const { trackId, advanceTriggeredForTrackId } = params;
  if (!advanceTriggeredForTrackId) return null;
  // Hold the marker through transient "nothing playing" gaps: clearing it there
  // would re-arm the trigger while a stale report of the old track can still
  // arrive, causing a double skip.
  if (!trackId) return advanceTriggeredForTrackId;
  return advanceTriggeredForTrackId === trackId ? advanceTriggeredForTrackId : null;
}
