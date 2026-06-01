import { describe, expect, it } from "vitest";

import { matchChallengeSong } from "@/lib/live/challenge";
import type { LiveGameConfig } from "@/lib/live/types";

const game: LiveGameConfig = {
  gameNumber: 1,
  theme: "Eclectic mix",
  playlistId: "playlist",
  playlistName: "Game 1",
  playlistUrl: null,
  totalSongs: 50,
  addedCount: 50,
  challengeSongArtist: "",
  challengeSongTitle: "",
  challengeSongs: [
    {
      type: "dance-along",
      artist: "John Travolta & Olivia Newton-John",
      title: "You're the One That I Want",
    },
  ],
};

describe("matchChallengeSong", () => {
  it("matches Spotify title versions and reordered artists", () => {
    expect(
      matchChallengeSong(
        {
          title: "You're The One That I Want (Remastered 2022)",
          artist: "Olivia Newton-John, John Travolta",
        },
        game
      )
    ).toBe("dance-along");
  });

  it("does not match unrelated songs", () => {
    expect(
      matchChallengeSong(
        {
          title: "Grease",
          artist: "Frankie Valli",
        },
        game
      )
    ).toBeNull();
  });
});
