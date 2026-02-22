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

export function updateAdvanceTrackMarker(params: {
  trackId: string | null;
  advanceTriggeredForTrackId: string | null;
}): string | null {
  const { trackId, advanceTriggeredForTrackId } = params;
  if (!trackId) return null;
  if (!advanceTriggeredForTrackId) return null;
  return advanceTriggeredForTrackId === trackId ? advanceTriggeredForTrackId : null;
}
