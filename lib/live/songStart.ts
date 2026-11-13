import { trackMatchesSong } from "@/lib/live/challenge";
import type { Song } from "@/lib/types";

/**
 * Per-song start times (Peter, 13 November 2026). Spotify gives this app no
 * song-structure data, so a slow starter gets a start time typed into the
 * song list ("Artist - Title @0:40"). On the night the console jumps the song
 * there, and the reveals and the song timer count from that point, on the
 * console and on the TV alike.
 */

export type SongStart = { artist: string; title: string; startMs: number };

/** Stop this close to the end of a track: a start time past it is ignored. */
export const SONG_START_END_MARGIN_MS = 15_000;

/** Within this of the start point already, no seek is sent. */
export const SONG_START_TOLERANCE_MS = 2_000;

/** The start times a parsed song list carries, for the saved game. */
export function songStartsFromSongs(songs: Song[]): SongStart[] {
  return songs
    .filter((song) => typeof song.startMs === "number" && song.startMs > 0)
    .map((song) => ({ artist: song.artist, title: song.title, startMs: song.startMs as number }));
}

/** The start time set for this track, or 0. */
export function findSongStartMs(
  track: { title: string; artist: string } | null | undefined,
  songStarts: SongStart[] | null | undefined
): number {
  if (!track || !songStarts?.length) return 0;
  return songStarts.find((song) => trackMatchesSong(track, song))?.startMs ?? 0;
}

/**
 * The start point actually used for a track: 0 when there is none or when it
 * would leave less than the margin before the track ends.
 */
export function usableSongStartMs(startMs: number, durationMs: number | null | undefined): number {
  if (!Number.isFinite(startMs) || startMs <= 0) return 0;
  if (typeof durationMs === "number" && durationMs > 0 && startMs > durationMs - SONG_START_END_MARGIN_MS) {
    return 0;
  }
  return Math.round(startMs);
}

/** How far into the song the room is, counted from its start point. */
export function songProgressMs(progressMs: number, songStartMs: number | null | undefined): number {
  const progress = Number.isFinite(progressMs) ? progressMs : 0;
  const start = typeof songStartMs === "number" && Number.isFinite(songStartMs) ? songStartMs : 0;
  return Math.max(0, progress - start);
}

/**
 * The position to seek to for a track that has just come up, or null. Only
 * when it has a start point and Spotify is still well short of it.
 */
export function songStartSeekMs(params: { songStartMs: number; progressMs: number }): number | null {
  if (params.songStartMs <= 0) return null;
  if (params.progressMs >= params.songStartMs - SONG_START_TOLERANCE_MS) return null;
  return params.songStartMs;
}
