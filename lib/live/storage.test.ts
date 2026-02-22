import assert from "node:assert/strict";
import test from "node:test";

import {
  isControlLockStale,
  listLiveSessions,
  validateLiveSession,
} from "@/lib/live/storage";
import {
  DEFAULT_REVEAL_CONFIG,
  LIVE_SESSION_VERSION,
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
    games: [
      {
        gameNumber: 1,
        theme: "General",
        playlistId: "pl-game-1",
        playlistName: "Game 1",
        playlistUrl: "https://open.spotify.com/playlist/pl-game-1",
        totalSongs: 50,
        addedCount: 48,
      },
      {
        gameNumber: 2,
        theme: "General",
        playlistId: "pl-game-2",
        playlistName: "Game 2",
        playlistUrl: "https://open.spotify.com/playlist/pl-game-2",
        totalSongs: 50,
        addedCount: 47,
      },
    ],
  };
}

test("validateLiveSession accepts valid v1 payload", () => {
  const session = makeValidSession();
  const validated = validateLiveSession(session);
  assert.ok(validated);
  assert.equal(validated?.id, session.id);
  assert.equal(validated?.games.length, 2);
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
  assert.equal(validateLiveSession(bad), null);
});

test("storage helpers are safe when localStorage is unavailable", () => {
  assert.deepEqual(listLiveSessions(), []);
});

test("isControlLockStale uses timeout window", () => {
  const now = 1_000_000;
  assert.equal(isControlLockStale({ tabId: "abc", lastSeenMs: now - 31_000 }, now, 30_000), true);
  assert.equal(isControlLockStale({ tabId: "abc", lastSeenMs: now - 29_000 }, now, 30_000), false);
});
