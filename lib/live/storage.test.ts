import { test, expect } from "vitest";

import {
  isControlLockStale,
  listLiveSessions,
  validateLiveSession,
} from "@/lib/live/storage";
import {
  DEFAULT_WELCOME_SONG,
  DEFAULT_REVEAL_CONFIG,
  LIVE_SESSION_VERSION,
  makeEmptyRuntimeState,
  type LiveSessionV1,
} from "@/lib/live/types";

function makeValidSession(): LiveSessionV1 {
  return {
    version: LIVE_SESSION_VERSION,
    id: "session-123",
    name: "Music Bingo - March 1st 2026",
    createdAt: "2026-02-22T12:00:00.000Z",
    eventDateInput: "2026-03-01",
    eventDateDisplay: "March 1st 2026",
    revealConfig: DEFAULT_REVEAL_CONFIG,
    breakPlaylistId: "",
    games: [
      {
        gameNumber: 1,
        theme: "General",
        playlistId: "pl-game-1",
        playlistName: "Game 1",
        playlistUrl: "https://open.spotify.com/playlist/pl-game-1",
        totalSongs: 50,
        addedCount: 48,
        challengeSongArtist: "Elvis Presley",
        challengeSongTitle: "Jailhouse Rock",
      },
      {
        gameNumber: 2,
        theme: "General",
        playlistId: "pl-game-2",
        playlistName: "Game 2",
        playlistUrl: "https://open.spotify.com/playlist/pl-game-2",
        totalSongs: 50,
        addedCount: 47,
        challengeSongArtist: "ABBA",
        challengeSongTitle: "Dancing Queen",
      },
    ],
  };
}

test("validateLiveSession accepts valid v1 payload", () => {
  const session = makeValidSession();
  const validated = validateLiveSession(session);
  expect(validated).toBeTruthy();
  expect(validated?.id).toBe(session.id);
  expect(validated?.games.length).toBe(2);
});

test("validateLiveSession rejects wrong schema", () => {
  const bad = {
    version: LIVE_SESSION_VERSION,
    id: "bad-session",
    name: "Bad",
    createdAt: "2026-02-22T12:00:00.000Z",
    eventDateInput: "2026-03-01",
    eventDateDisplay: "March 1st 2026",
    revealConfig: DEFAULT_REVEAL_CONFIG,
    games: [{ gameNumber: 1 }],
  };
  expect(validateLiveSession(bad)).toBeNull();
});

test("storage helpers are safe when localStorage is unavailable", () => {
  expect(listLiveSessions()).toEqual([]);
});

test("empty runtime starts at timestamp zero so fetched host state can win first load", () => {
  const runtime = makeEmptyRuntimeState("session-123");
  expect(runtime.updatedAtMs).toBe(0);
});

test("empty runtime includes the default welcome intro song", () => {
  const runtime = makeEmptyRuntimeState("session-123");
  expect(runtime.welcomeSong).toEqual(DEFAULT_WELCOME_SONG);
});

test("isControlLockStale uses timeout window", () => {
  const now = 1_000_000;
  expect(isControlLockStale({ tabId: "abc", lastSeenMs: now - 31_000 }, now, 30_000)).toBe(true);
  expect(isControlLockStale({ tabId: "abc", lastSeenMs: now - 29_000 }, now, 30_000)).toBe(false);
});
