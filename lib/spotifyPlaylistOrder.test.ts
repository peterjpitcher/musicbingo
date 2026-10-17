import { describe, expect, it } from "vitest";

import { sortSongsBySpotifyOrder, stripTrackNoise, type SpotifyTrack } from "@/lib/spotifyPlaylistOrder";
import type { Song } from "@/lib/types";

const ANASTACIA: Song = { artist: "Anastacia", title: "Left Outside Alone" };
const SOFT_CELL: Song = { artist: "Soft Cell", title: "Tainted Love" };
const RONSON: Song = { artist: "Mark Ronson", title: "Valerie" };
const KILLERS: Song = { artist: "The Killers", title: "Mr. Brightside" };

// Spotify names Ronson's Valerie with the featured artist and a version label;
// the route keeps only a track's first artist.
const PLAYLIST: SpotifyTrack[] = [
  { trackId: "track-1", title: "Valerie (feat. Amy Winehouse) - Version Revisited", artist: "Mark Ronson" },
  { trackId: "track-2", title: "Left Outside Alone", artist: "Anastacia" },
];

describe("sortSongsBySpotifyOrder", () => {
  it("follows the playlist and keeps songs it cannot find at the end, in list order", () => {
    expect(sortSongsBySpotifyOrder([ANASTACIA, SOFT_CELL, RONSON, KILLERS], PLAYLIST)).toEqual([
      RONSON,
      ANASTACIA,
      SOFT_CELL,
      KILLERS,
    ]);
  });

  it.each([null, []])("keeps the list order when the playlist has no tracks (%j)", (tracks) => {
    expect(sortSongsBySpotifyOrder([ANASTACIA, SOFT_CELL], tracks)).toEqual([ANASTACIA, SOFT_CELL]);
  });
});

describe("stripTrackNoise", () => {
  it.each(["Song feat. X", "Song ft. X", "Song (feat. X)"])("strips the featured artist from %s", (input) => {
    expect(stripTrackNoise(input)).toBe("Song");
  });
});
