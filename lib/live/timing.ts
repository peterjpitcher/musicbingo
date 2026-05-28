import {
  DEFAULT_REVEAL_CONFIG,
  MAX_SONG_PLAY_MS,
  MIN_SONG_PLAY_MS,
  makeRevealConfigForSongPlayMs,
  type RevealConfig,
} from "@/lib/live/types";

export function formatSecondsInput(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0;
  const seconds = Math.round((safeMs / 1000) * 100) / 100;
  return Number.isInteger(seconds)
    ? seconds.toFixed(0)
    : seconds.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
}

export function formatTimingMs(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const seconds = safeMs / 1000;
  const rounded = Math.round(seconds * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}s`;
}

export function parseSecondsInput(input: string): number | null {
  const seconds = Number(input);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1000);
}

export function parseSongPlayMsInput(input: string): number | null {
  const ms = parseSecondsInput(input);
  if (ms === null || ms < MIN_SONG_PLAY_MS || ms > MAX_SONG_PLAY_MS) return null;
  return ms;
}

export function parseRevealConfigInputs(params: {
  albumSeconds: string;
  titleSeconds: string;
  artistSeconds: string;
  songPlaySeconds: string;
}): RevealConfig | null {
  const albumMs = parseSecondsInput(params.albumSeconds);
  const titleMs = parseSecondsInput(params.titleSeconds);
  const artistMs = parseSecondsInput(params.artistSeconds);
  const nextMs = parseSongPlayMsInput(params.songPlaySeconds);

  if (
    albumMs === null ||
    titleMs === null ||
    artistMs === null ||
    nextMs === null ||
    titleMs < albumMs ||
    artistMs < titleMs ||
    nextMs < artistMs
  ) {
    return null;
  }

  return { albumMs, titleMs, artistMs, nextMs };
}

export function revealConfigsEqual(a: RevealConfig, b: RevealConfig): boolean {
  return a.albumMs === b.albumMs &&
    a.titleMs === b.titleMs &&
    a.artistMs === b.artistMs &&
    a.nextMs === b.nextMs;
}

export function getDefaultRevealConfigForSongInput(songPlaySeconds: string, fallback: RevealConfig = DEFAULT_REVEAL_CONFIG): RevealConfig {
  const playMs = parseSongPlayMsInput(songPlaySeconds) ?? fallback.nextMs;
  return makeRevealConfigForSongPlayMs(playMs);
}
