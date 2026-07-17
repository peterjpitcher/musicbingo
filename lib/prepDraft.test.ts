import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  CHALLENGE_ENTRY_COUNT,
  PREP_DRAFT_STORAGE_KEY,
  clearPrepDraft,
  makeEmptyChallengeEntries,
  readPrepDraft,
  sanitizePrepDraft,
  writePrepDraft,
  type PrepDraftV1,
} from "@/lib/prepDraft";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeDraft(): PrepDraftV1 {
  const challengeSongs = makeEmptyChallengeEntries();
  challengeSongs[0] = { value: "ABBA|||Waterloo", type: "dance-along" };
  return {
    version: 1,
    savedAt: "2026-07-17T08:00:00.000Z",
    currentStep: 2,
    eventDate: "2026-07-18",
    countInput: "40",
    songPlaySecondsInput: "45",
    albumRevealSecondsInput: "15",
    titleRevealSecondsInput: "25",
    artistRevealSecondsInput: "35",
    liveSessionName: "Music Bingo - July 18th 2026",
    liveSessionNameDirty: true,
    breakPlaylistId: "",
    selectedBrandId: null,
    game1Theme: "80s",
    game1SongsText: "ABBA - Waterloo\nQueen - Under Pressure",
    game1ChallengeSongs: challengeSongs,
    game1ChallengeBonusPointsInput: "10",
    game1IntroUrl: "",
    game1IntroSongs: [
      {
        type: "dance-along",
        spotifyUrl: "https://open.spotify.com/track/abc123",
        trackId: "abc123",
        artist: "ABBA",
        title: "Waterloo",
      },
    ],
    game2Theme: "90s",
    game2SongsText: "Oasis - Wonderwall",
    game2ChallengeSongs: makeEmptyChallengeEntries(),
    game2ChallengeBonusPointsInput: "10",
    game2IntroUrl: "",
    game2IntroSongs: [],
  };
}

test("writePrepDraft and readPrepDraft round-trip a full draft", () => {
  const draft = makeDraft();
  writePrepDraft(draft);
  expect(readPrepDraft()).toEqual(draft);
});

test("clearPrepDraft removes the stored draft", () => {
  writePrepDraft(makeDraft());
  clearPrepDraft();
  expect(readPrepDraft()).toBeNull();
  expect(store.has(PREP_DRAFT_STORAGE_KEY)).toBe(false);
});

test("readPrepDraft returns null for corrupt JSON", () => {
  store.set(PREP_DRAFT_STORAGE_KEY, "{not json");
  expect(readPrepDraft()).toBeNull();
});

test("sanitizePrepDraft rejects unknown versions and non-objects", () => {
  expect(sanitizePrepDraft(null)).toBeNull();
  expect(sanitizePrepDraft("draft")).toBeNull();
  expect(sanitizePrepDraft({ ...makeDraft(), version: 2 })).toBeNull();
});

test("sanitizePrepDraft normalises challenge entries to a fixed-length array", () => {
  const draft = sanitizePrepDraft({
    ...makeDraft(),
    game1ChallengeSongs: [
      { value: "ABBA|||Waterloo", type: "dance-along" },
      { value: 42, type: "bogus" },
      "junk",
    ],
    game2ChallengeSongs: "not-an-array",
  });
  expect(draft).not.toBeNull();
  expect(draft!.game1ChallengeSongs).toHaveLength(CHALLENGE_ENTRY_COUNT);
  expect(draft!.game1ChallengeSongs[0]).toEqual({ value: "ABBA|||Waterloo", type: "dance-along" });
  expect(draft!.game1ChallengeSongs[1]).toEqual({ value: "", type: "sing-along" });
  expect(draft!.game2ChallengeSongs).toEqual(makeEmptyChallengeEntries());
});

test("sanitizePrepDraft drops malformed intro songs and clamps the step", () => {
  const draft = sanitizePrepDraft({
    ...makeDraft(),
    currentStep: 99,
    game1IntroSongs: [
      { type: "dance-along", spotifyUrl: "url", trackId: "id", artist: "A", title: "T" },
      { type: "invalid", spotifyUrl: "url", trackId: "id", artist: "A", title: "T" },
      { type: "sing-along", spotifyUrl: "", trackId: "id", artist: "A", title: "T" },
    ],
  });
  expect(draft).not.toBeNull();
  expect(draft!.currentStep).toBe(3);
  expect(draft!.game1IntroSongs).toEqual([
    { type: "dance-along", spotifyUrl: "url", trackId: "id", artist: "A", title: "T" },
  ]);
});

test("storage helpers are safe when window is unavailable", () => {
  vi.unstubAllGlobals();
  expect(readPrepDraft()).toBeNull();
  expect(() => writePrepDraft(makeDraft())).not.toThrow();
  expect(() => clearPrepDraft()).not.toThrow();
});
