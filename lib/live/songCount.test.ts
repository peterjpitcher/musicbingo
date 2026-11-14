import { describe, expect, it } from "vitest";

import { gameSongTotal, songCount } from "@/lib/live/songCount";
import type { LiveGameConfig } from "@/lib/live/types";

function game(gameNumber: 1 | 2, totalSongs: number, addedCount: number): LiveGameConfig {
  return {
    gameNumber,
    theme: "",
    playlistId: `p${gameNumber}`,
    playlistName: `Game ${gameNumber}`,
    playlistUrl: null,
    totalSongs,
    addedCount,
    challengeSongArtist: "",
    challengeSongTitle: "",
  };
}

describe("the game screens' song count", () => {
  const session = { games: [game(1, 50, 49), game(2, 40, 0)] };

  it("counts the tracks on the game's playlist", () => {
    expect(gameSongTotal(session, 1)).toBe(49);
  });

  it("falls back to the typed songs when the playlist count is missing", () => {
    expect(gameSongTotal(session, 2)).toBe(40);
  });

  it("knows no total without a session or an active game", () => {
    expect(gameSongTotal(null, 1)).toBe(0);
    expect(gameSongTotal(session, null)).toBe(0);
    expect(gameSongTotal({ games: [game(1, 50, 50)] }, 2)).toBe(0);
  });

  it("splits the total into played and left", () => {
    expect(songCount(12, 50)).toEqual({ played: 12, left: 38 });
    expect(songCount(0, 50)).toEqual({ played: 0, left: 50 });
    expect(songCount(50, 50)).toEqual({ played: 50, left: 0 });
  });

  it("never shows fewer than none left", () => {
    expect(songCount(53, 50)).toEqual({ played: 53, left: 0 });
  });

  it("shows nothing when the game's size is unknown", () => {
    expect(songCount(12, 0)).toBeNull();
    expect(songCount(12, Number.NaN)).toBeNull();
  });
});
