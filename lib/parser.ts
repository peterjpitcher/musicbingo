import type { ParseResult, Song } from "@/lib/types";

const DECADE_HEADER_RE = /^\s*\d{4}s\s*\(\s*\d+\s*\)\s*$/;
const SPLIT_RE = /\s+[–—-]\s+/;

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
    const line = rawLine.trim();
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

    songs.push({ artist, title });
    artistByKey.set(artist.toLowerCase(), artistByKey.get(artist.toLowerCase()) ?? artist);
    titleByKey.set(title.toLowerCase(), titleByKey.get(title.toLowerCase()) ?? title);
  }

  return {
    songs,
    uniqueArtists: [...artistByKey.values()],
    uniqueTitles: [...titleByKey.values()],
    ignoredLines,
  };
}

