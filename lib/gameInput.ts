import { parseSongListText } from "@/lib/parser";
import type { ParseResult, Song } from "@/lib/types";

export const MAX_SONGS_PER_GAME = 50;
export const DEFAULT_GAME_THEME = "General 70's to 2010's";

function normalizeForLookup(value: string): string {
  return value.trim().toLowerCase();
}

export function makeSongSelectionValue(song: Song): string {
  return `${song.artist}|||${song.title}`;
}

export function normalizeGameTheme(rawTheme: string): string {
  const trimmed = rawTheme.trim();
  return trimmed || DEFAULT_GAME_THEME;
}

export function parseGameSongsText(rawText: string, gameLabel: string): ParseResult {
  const text = rawText.trim();
  if (!text) {
    throw new Error(`${gameLabel}: provide a song list.`);
  }

  const parsed = parseSongListText(text);
  if (!parsed.songs.length) {
    throw new Error(`${gameLabel}: no valid songs found. Use lines in the format "Artist - Title".`);
  }
  if (parsed.songs.length > MAX_SONGS_PER_GAME) {
    throw new Error(`${gameLabel}: max ${MAX_SONGS_PER_GAME} songs allowed (got ${parsed.songs.length}).`);
  }
  return parsed;
}

export function resolveChallengeSong(
  rawSelection: string,
  songs: Song[],
  challengeLabel: string
): Song {
  const selection = rawSelection.trim();
  if (!selection) {
    throw new Error(`${challengeLabel}: pick a song before generating output.`);
  }

  const delim = selection.indexOf("|||");
  if (delim <= 0 || delim >= selection.length - 3) {
    throw new Error(`${challengeLabel}: invalid song selection.`);
  }

  const selectedArtist = normalizeForLookup(selection.slice(0, delim));
  const selectedTitle = normalizeForLookup(selection.slice(delim + 3));

  const song = songs.find(
    (item) =>
      normalizeForLookup(item.artist) === selectedArtist
      && normalizeForLookup(item.title) === selectedTitle
  );

  if (!song) {
    throw new Error(`${challengeLabel}: selected song was not found in this game list.`);
  }

  return song;
}
