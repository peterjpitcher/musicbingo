import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  CHALLENGE_ENTRY_COUNT,
  PREP_DRAFT_STORAGE_KEY,
  clearPrepDraft,
  makeEmptyChallengeEntries,
  playlistInputSignature,
  readPrepDraft,
  sanitizePrepDraft,
  sanitizePrepDraftPlaylists,
  writePrepDraft,
  type PlaylistInputs,
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
    playlists: {
      signature: "sig-1",
      games: [
        {
          gameNumber: 1,
          theme: "80s",
          playlistId: "pl-1",
          playlistName: "Music Bingo Game 1 - July 18th 2026 (80s)",
          playlistUrl: "https://open.spotify.com/playlist/pl-1",
          totalSongs: 2,
          addedCount: 1,
          notFound: [{ artist: "Queen", title: "Under Pressure" }],
        },
        {
          gameNumber: 2,
          theme: "90s",
          playlistId: "pl-2",
          playlistName: "Music Bingo Game 2 - July 18th 2026 (90s)",
          playlistUrl: "https://open.spotify.com/playlist/pl-2",
          totalSongs: 1,
          addedCount: 1,
          notFound: [],
        },
      ],
    },
  };
}

function makePlaylistInputs(): PlaylistInputs {
  return {
    eventDate: "2026-10-16",
    game1Theme: "Killer Party Anthems",
    game2Theme: "Halloween Howlers",
    game1SongsText: "ABBA - Waterloo",
    game2SongsText: "Oasis - Wonderwall",
    game1IntroUrl: "https://open.spotify.com/track/abc123",
    game2IntroUrl: "",
    game1IntroSongs: [],
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

test("scoped drafts are isolated per session and from the new-game draft", () => {
  const newGameDraft = { ...makeDraft(), game1Theme: "new-game" };
  const editDraft = { ...makeDraft(), game1Theme: "edit-abc" };
  writePrepDraft(newGameDraft);
  writePrepDraft(editDraft, "session-abc");

  expect(readPrepDraft()?.game1Theme).toBe("new-game");
  expect(readPrepDraft("session-abc")?.game1Theme).toBe("edit-abc");
  expect(readPrepDraft("session-other")).toBeNull();

  clearPrepDraft("session-abc");
  expect(readPrepDraft("session-abc")).toBeNull();
  expect(readPrepDraft()?.game1Theme).toBe("new-game");
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

test("drafts written before playlists were kept restore with no playlists", () => {
  const { playlists: _playlists, ...oldDraft } = makeDraft();
  expect(sanitizePrepDraft(oldDraft)?.playlists).toBeNull();
});

test("sanitizePrepDraftPlaylists keeps one playlist per game and needs an id and a signature", () => {
  const saved = sanitizePrepDraftPlaylists({
    signature: "sig-1",
    games: [
      { gameNumber: 1, theme: "80s", playlistId: "pl-1", playlistName: "G1", playlistUrl: "", totalSongs: 26, addedCount: 25 },
      { gameNumber: 1, theme: "80s", playlistId: "pl-1-again", playlistName: "G1", playlistUrl: null, totalSongs: 1, addedCount: 1 },
      { gameNumber: 2, theme: "90s", playlistId: "", playlistName: "G2", playlistUrl: null, totalSongs: 1, addedCount: 1 },
      { gameNumber: 3, theme: "00s", playlistId: "pl-3", playlistName: "G3", playlistUrl: null, totalSongs: 1, addedCount: 1 },
      "junk",
    ],
  });
  expect(saved).toEqual({
    signature: "sig-1",
    games: [
      { gameNumber: 1, theme: "80s", playlistId: "pl-1", playlistName: "G1", playlistUrl: null, totalSongs: 26, addedCount: 25, notFound: [] },
    ],
  });
  expect(sanitizePrepDraftPlaylists({ signature: "", games: makeDraft().playlists!.games })).toBeNull();
  expect(sanitizePrepDraftPlaylists({ signature: "sig-1", games: [] })).toBeNull();
  expect(sanitizePrepDraftPlaylists(null)).toBeNull();
});

test("sanitizePrepDraftPlaylists reads the playlist fields of a saved game and ignores the rest", () => {
  // Saved games record no unmatched songs.
  const { notFound: _notFound, ...playlistFields } = makeDraft().playlists!.games[0];
  const savedGame = {
    ...playlistFields,
    challengeSongs: [{ artist: "ABBA", title: "Waterloo", type: "dance-along" }],
    introSongs: [],
    challengeBonusPoints: 10,
  };
  expect(sanitizePrepDraftPlaylists({ signature: "sig-1", games: [savedGame] })?.games).toEqual([
    { ...playlistFields, notFound: [] },
  ]);
});

test("sanitizePrepDraftPlaylists keeps unmatched songs and drops incomplete ones", () => {
  const saved = sanitizePrepDraftPlaylists({
    signature: "sig-1",
    games: [
      {
        ...makeDraft().playlists!.games[0],
        notFound: [
          { artist: "Queen", title: "Under Pressure" },
          { artist: "", title: "No Artist" },
          { artist: "No Title" },
          "junk",
        ],
      },
    ],
  });
  expect(saved?.games[0].notFound).toEqual([{ artist: "Queen", title: "Under Pressure" }]);
});

test("playlistInputSignature ignores intro song key order and surrounding whitespace", () => {
  const resolved = {
    type: "dance-along" as const,
    spotifyUrl: "https://open.spotify.com/track/abc123",
    trackId: "abc123",
    artist: "ABBA",
    title: "Waterloo",
  };
  // Saved games come back from Postgres JSONB with their keys reordered.
  const reordered = { title: "Waterloo", artist: "ABBA", trackId: "abc123", type: "dance-along" as const, spotifyUrl: "https://open.spotify.com/track/abc123" };
  const base = { ...makePlaylistInputs(), game1IntroSongs: [resolved] };

  expect(playlistInputSignature({ ...base, game1IntroSongs: [reordered] })).toBe(playlistInputSignature(base));
  expect(
    playlistInputSignature({ ...base, eventDate: " 2026-10-16 ", game1Theme: "Killer Party Anthems  " })
  ).toBe(playlistInputSignature(base));
});

test("playlistInputSignature changes when the songs or the intro songs change", () => {
  const base = makePlaylistInputs();
  const signature = playlistInputSignature(base);

  expect(playlistInputSignature({ ...base, game2SongsText: "Oasis - Wonderwall\nBlur - Song 2" })).not.toBe(signature);
  expect(
    playlistInputSignature({
      ...base,
      game1IntroSongs: [
        { type: "dance-along", spotifyUrl: base.game1IntroUrl, trackId: "abc123", artist: "ABBA", title: "Waterloo" },
      ],
    })
  ).not.toBe(signature);
});

test("storage helpers are safe when window is unavailable", () => {
  vi.unstubAllGlobals();
  expect(readPrepDraft()).toBeNull();
  expect(() => writePrepDraft(makeDraft())).not.toThrow();
  expect(() => clearPrepDraft()).not.toThrow();
});
