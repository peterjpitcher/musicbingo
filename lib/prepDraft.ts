import { isObject } from "@/lib/live/validate";
import type { IntroSong } from "@/lib/live/types";

/**
 * Autosaved draft of the /prep wizard, stored in localStorage so a refresh,
 * crash, or accidental navigation never loses typed prep. The draft is a
 * device-local safety net only: the live session itself is still saved to the
 * server via upsertLiveSession once both Spotify playlists exist.
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
