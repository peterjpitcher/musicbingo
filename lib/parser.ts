import type { ParseResult, Song } from "@/lib/types";

const DECADE_HEADER_RE = /^\s*\d{4}s\s*\(\s*\d+\s*\)\s*$/;
const SPLIT_RE = /\s+[–—-]\s+/;

/**
 * A start time at the very end of a song line: " @0:40", "@1:05" or "@45"
 * (seconds). Up to 59:59. Songs that start slowly use it to skip to the
 * good bit on the night (Peter, 13 November 2026).
 */
const START_TIME_RE = /\s*@\s*(?:(\d{1,2}):([0-5]\d)|(\d{1,4}))\s*$/;

/** Longest start time accepted, so a typo cannot skip a whole song. */
export const MAX_SONG_START_MS = 15 * 60 * 1000;

/** Split a trailing start time off a song line. */
export function splitStartTime(line: string): { text: string; startMs: number | null } {
  const match = line.match(START_TIME_RE);
  if (!match || match.index === undefined) return { text: line, startMs: null };
  const seconds = match[3] !== undefined
    ? Number(match[3])
    : Number(match[1]) * 60 + Number(match[2]);
  const startMs = seconds * 1000;
  if (!Number.isFinite(startMs) || startMs > MAX_SONG_START_MS) return { text: line, startMs: null };
  return { text: line.slice(0, match.index), startMs };
}

/**
 * The song list with every start time removed. A line without one comes back
 * unchanged, so a list with no start times is returned byte for byte. Used to
 * sign the playlist inputs: changing a start time must not throw away the
 * playlists already made.
 */
export function songListWithoutStartTimes(text: string): string {
  return text
    .split(/(\r?\n)/)
    .map((part) => (/^\r?\n$/.test(part) ? part : splitStartTime(part).text))
    .join("");
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function parseSongListText(text: string): ParseResult {
  const songs: Song[] = [];
  const ignoredLines: string[] = [];

  const seenSongKeys = new Set<string>();
  const artistByKey = new Map<string, string>();
  const titleByKey = new Map<string, string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const { text: lineText, startMs } = splitStartTime(rawLine.trim());
    const line = lineText.trim();
    if (!line) continue;

    if (DECADE_HEADER_RE.test(line)) {
      ignoredLines.push(line);
      continue;
    }

    const match = line.match(SPLIT_RE);
    if (!match || match.index === undefined) {
      ignoredLines.push(line);
      continue;
    }

    const artistRaw = line.slice(0, match.index);
    const titleRaw = line.slice(match.index + match[0].length);
    const artist = normalizeSpaces(artistRaw);
    const title = normalizeSpaces(titleRaw);
    if (!artist || !title) {
      ignoredLines.push(line);
      continue;
    }

    const songKey = `${artist.toLowerCase()}|||${title.toLowerCase()}`;
    if (seenSongKeys.has(songKey)) continue;
    seenSongKeys.add(songKey);

    songs.push(startMs !== null && startMs > 0 ? { artist, title, startMs } : { artist, title });
    artistByKey.set(artist.toLowerCase(), artistByKey.get(artist.toLowerCase()) ?? artist);
    titleByKey.set(title.toLowerCase(), titleByKey.get(title.toLowerCase()) ?? title);
  }

  const poolSet = new Map<string, string>();
  for (const artist of artistByKey.values()) {
    const key = artist.toLowerCase();
    if (!poolSet.has(key)) poolSet.set(key, artist);
  }
  for (const title of titleByKey.values()) {
    const key = title.toLowerCase();
    if (!poolSet.has(key)) poolSet.set(key, title);
  }

  return {
    songs,
    uniqueArtists: [...artistByKey.values()],
    uniqueTitles: [...titleByKey.values()],
    combinedPool: [...poolSet.values()],
    ignoredLines,
  };
}

