import { isObject } from "@/lib/live/validate";
import type { IntroSong } from "@/lib/live/types";

/**
 * Autosaved draft of the /prep wizard, stored in localStorage so a refresh,
 * crash, or accidental navigation never loses typed prep. The draft is a
 * device-local safety net only: the live session itself is still saved to the
 * server via upsertLiveSession once both Spotify playlists exist. Playlists
 * already made are kept with the draft too, so a reload does not force new ones.
 */

export const PREP_DRAFT_STORAGE_KEY = "music-bingo-prep-draft-v1";

/**
 * Drafts are scoped: the new-game wizard uses the bare key, and editing an
 * existing session uses a per-session key so unsaved edits to one game never
 * bleed into another (or into a new game).
 */
export function prepDraftStorageKey(scope?: string | null): string {
  return scope ? `${PREP_DRAFT_STORAGE_KEY}:${scope}` : PREP_DRAFT_STORAGE_KEY;
}

export const CHALLENGE_ENTRY_COUNT = 5;

export type ChallengeEntry = { value: string; type: "sing-along" | "dance-along" };

/** A song Spotify search could not match, still waiting for a Resolve link. */
export type PrepDraftMissingSong = { artist: string; title: string };

/** A Spotify playlist made for one game, as kept by a draft or a saved game. */
export type PrepDraftPlaylist = {
  gameNumber: 1 | 2;
  theme: string;
  playlistId: string;
  playlistName: string;
  playlistUrl: string | null;
  totalSongs: number;
  addedCount: number;
  /** Empty for saved games, which do not record unmatched songs. */
  notFound: PrepDraftMissingSong[];
};

/**
 * Playlists plus the signature of the inputs they were built from
 * (playlistInputSignature). The wizard only keeps them while it still matches.
 */
export type PrepDraftPlaylists = {
  signature: string;
  games: PrepDraftPlaylist[];
};

/** Everything a game's Spotify playlist is built from. */
export type PlaylistInputs = {
  eventDate: string;
  game1Theme: string;
  game2Theme: string;
  game1SongsText: string;
  game2SongsText: string;
  game1IntroUrl: string;
  game2IntroUrl: string;
  game1IntroSongs: IntroSong[];
  game2IntroSongs: IntroSong[];
};

/** Fixed field and slot order, so the same intro songs always sign the same. */
function canonicalIntroSongs(songs: IntroSong[]): IntroSong[] {
  return songs
    .map(({ type, spotifyUrl, trackId, artist, title }) => ({ type, spotifyUrl, trackId, artist, title }))
    .sort((a, b) => a.type.localeCompare(b.type));
}

/**
 * Fingerprint of the playlist inputs. Playlists made from one fingerprint are
 * discarded once the inputs stop matching it, since they no longer fit the songs.
 */
export function playlistInputSignature(inputs: PlaylistInputs): string {
  return JSON.stringify({
    eventDate: inputs.eventDate.trim(),
    game1Theme: inputs.game1Theme.trim(),
    game2Theme: inputs.game2Theme.trim(),
    game1SongsText: inputs.game1SongsText,
    game2SongsText: inputs.game2SongsText,
    game1IntroUrl: inputs.game1IntroUrl.trim(),
    game2IntroUrl: inputs.game2IntroUrl.trim(),
    game1IntroSongs: canonicalIntroSongs(inputs.game1IntroSongs),
    game2IntroSongs: canonicalIntroSongs(inputs.game2IntroSongs),
  });
}

export type PrepDraftV1 = {
  version: 1;
  savedAt: string;
  currentStep: number;
  eventDate: string;
  countInput: string;
  songPlaySecondsInput: string;
  albumRevealSecondsInput: string;
  titleRevealSecondsInput: string;
  artistRevealSecondsInput: string;
  liveSessionName: string;
  liveSessionNameDirty: boolean;
  breakPlaylistId: string;
  selectedBrandId: string | null;
  game1Theme: string;
  game1SongsText: string;
  game1ChallengeSongs: ChallengeEntry[];
  game1ChallengeBonusPointsInput: string;
  game1IntroUrl: string;
  game1IntroSongs: IntroSong[];
  game2Theme: string;
  game2SongsText: string;
  game2ChallengeSongs: ChallengeEntry[];
  game2ChallengeBonusPointsInput: string;
  game2IntroUrl: string;
  game2IntroSongs: IntroSong[];
  /** Absent from drafts written before playlists were kept. */
  playlists: PrepDraftPlaylists | null;
};

export function makeEmptyChallengeEntries(): ChallengeEntry[] {
  return Array(CHALLENGE_ENTRY_COUNT)
    .fill(null)
    .map(() => ({ value: "", type: "sing-along" as const }));
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Lenient string coercion: drafts legitimately contain empty strings. */
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function sanitizeChallengeEntries(input: unknown): ChallengeEntry[] {
  const entries = makeEmptyChallengeEntries();
  if (!Array.isArray(input)) return entries;
  input.slice(0, CHALLENGE_ENTRY_COUNT).forEach((item, idx) => {
    if (!isObject(item)) return;
    const type = item.type === "dance-along" ? "dance-along" : "sing-along";
    entries[idx] = { value: str(item.value), type };
  });
  return entries;
}

function sanitizeIntroSongs(input: unknown): IntroSong[] {
  if (!Array.isArray(input)) return [];
  const songs: IntroSong[] = [];
  for (const item of input) {
    if (!isObject(item)) continue;
    const type = item.type === "dance-along" || item.type === "sing-along" ? item.type : null;
    const spotifyUrl = str(item.spotifyUrl);
    const trackId = str(item.trackId);
    const artist = str(item.artist);
    const title = str(item.title);
    if (!type || !spotifyUrl || !trackId || !artist || !title) continue;
    songs.push({ type, spotifyUrl, trackId, artist, title });
  }
  return songs;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

function sanitizeMissingSongs(input: unknown): PrepDraftMissingSong[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item) => {
    if (!isObject(item)) return [];
    const artist = str(item.artist);
    const title = str(item.title);
    return artist && title ? [{ artist, title }] : [];
  });
}

/**
 * Validate playlists from a draft or a saved game: one per game number, each
 * with a playlist id. Returns null when there is no signature or no playlist.
 */
export function sanitizePrepDraftPlaylists(input: unknown): PrepDraftPlaylists | null {
  if (!isObject(input) || typeof input.signature !== "string" || !input.signature) return null;
  if (!Array.isArray(input.games)) return null;
  const games: PrepDraftPlaylist[] = [];
  for (const item of input.games) {
    if (!isObject(item)) continue;
    const gameNumber = item.gameNumber === 1 || item.gameNumber === 2 ? item.gameNumber : null;
    const playlistId = str(item.playlistId).trim();
    if (!gameNumber || !playlistId || games.some((game) => game.gameNumber === gameNumber)) continue;
    games.push({
      gameNumber,
      theme: str(item.theme),
      playlistId,
      playlistName: str(item.playlistName),
      playlistUrl: str(item.playlistUrl) || null,
      totalSongs: count(item.totalSongs),
      addedCount: count(item.addedCount),
      notFound: sanitizeMissingSongs(item.notFound),
    });
  }
  return games.length > 0 ? { signature: input.signature, games } : null;
}

export function sanitizePrepDraft(input: unknown): PrepDraftV1 | null {
  if (!isObject(input) || input.version !== 1) return null;
  const currentStepRaw = typeof input.currentStep === "number" ? Math.trunc(input.currentStep) : 0;
  return {
    version: 1,
    savedAt: str(input.savedAt),
    currentStep: Math.min(Math.max(currentStepRaw, 0), 3),
    eventDate: str(input.eventDate),
    countInput: str(input.countInput, "40"),
    songPlaySecondsInput: str(input.songPlaySecondsInput),
    albumRevealSecondsInput: str(input.albumRevealSecondsInput),
    titleRevealSecondsInput: str(input.titleRevealSecondsInput),
    artistRevealSecondsInput: str(input.artistRevealSecondsInput),
    liveSessionName: str(input.liveSessionName),
    liveSessionNameDirty: input.liveSessionNameDirty === true,
    breakPlaylistId: str(input.breakPlaylistId),
    selectedBrandId: typeof input.selectedBrandId === "string" ? input.selectedBrandId : null,
    game1Theme: str(input.game1Theme),
    game1SongsText: str(input.game1SongsText),
    game1ChallengeSongs: sanitizeChallengeEntries(input.game1ChallengeSongs),
    game1ChallengeBonusPointsInput: str(input.game1ChallengeBonusPointsInput),
    game1IntroUrl: str(input.game1IntroUrl),
    game1IntroSongs: sanitizeIntroSongs(input.game1IntroSongs),
    game2Theme: str(input.game2Theme),
    game2SongsText: str(input.game2SongsText),
    game2ChallengeSongs: sanitizeChallengeEntries(input.game2ChallengeSongs),
    game2ChallengeBonusPointsInput: str(input.game2ChallengeBonusPointsInput),
    game2IntroUrl: str(input.game2IntroUrl),
    game2IntroSongs: sanitizeIntroSongs(input.game2IntroSongs),
    playlists: sanitizePrepDraftPlaylists(input.playlists),
  };
}

export function readPrepDraft(scope?: string | null): PrepDraftV1 | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(prepDraftStorageKey(scope));
    if (!raw) return null;
    return sanitizePrepDraft(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writePrepDraft(draft: PrepDraftV1, scope?: string | null): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(prepDraftStorageKey(scope), JSON.stringify(draft));
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      console.warn(
        "[music-bingo] localStorage quota exceeded, the prep draft was not saved. Clear browser storage to resolve.",
        prepDraftStorageKey(scope)
      );
    }
    // Ignore other errors (e.g. SecurityError in private/restricted environments)
  }
}

export function clearPrepDraft(scope?: string | null): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(prepDraftStorageKey(scope));
  } catch {
    // ignore storage delete failures in private/restricted environments
  }
}
