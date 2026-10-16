import { describe, expect, it } from "vitest";

import {
  pickBestCandidate,
  scoreTrackCandidate,
  titleSimilarity,
  type TrackCandidate,
} from "@/lib/spotifyTrackMatch";

// Spotify search results (market GB, October 2026), trimmed to the fields the matcher reads.
const RONSON_VALERIE: TrackCandidate = {
  uri: "spotify:track:6kopmMZiyLmw7h66uXcXR7",
  name: "Valerie (feat. Amy Winehouse) - Version Revisited",
  artists: ["Mark Ronson", "Amy Winehouse"],
};
const WINWOOD_VALERIE: TrackCandidate = {
  uri: "spotify:track:3aAuIvgJGdp4wWd60riWfB",
  name: "Valerie",
  artists: ["Steve Winwood"],
};
const WINWOOD_VALERIE_80S_SUMMER_HITS: TrackCandidate = {
  uri: "spotify:track:6w4TB7GZyLpB7PeSKvxFYr",
  name: "Valerie",
  artists: ["Steve Winwood"],
};
const WINWOOD_VALERIE_MUSIC_FOR_EIGHTIES: TrackCandidate = {
  uri: "spotify:track:4RvVeRFYO7yGIjjHGeGhxI",
  name: "Valerie",
  artists: ["Steve Winwood"],
};

describe("scoreTrackCandidate", () => {
  it("gives an exact artist and title full marks", () => {
    expect(scoreTrackCandidate({ artist: "Steve Winwood", title: "Valerie" }, WINWOOD_VALERIE)).toBe(1);
  });

  it("matches lines typed title first", () => {
    expect(scoreTrackCandidate({ artist: "Valerie", title: "Steve Winwood" }, WINWOOD_VALERIE)).toBe(1);
  });
});

describe("titleSimilarity", () => {
  it("ignores a featured artist in brackets", () => {
    expect(titleSimilarity("Valerie", "Valerie (feat. Amy Winehouse)")).toBe(1);
  });
});

describe("pickBestCandidate", () => {
  it("keeps the best match across both searches", () => {
    const song = { artist: "Steve Winwood", title: "Valerie" };
    const afterFirstSearch = pickBestCandidate(song, [WINWOOD_VALERIE], null);
    const afterSecondSearch = pickBestCandidate(song, [RONSON_VALERIE], afterFirstSearch);
    expect(afterSecondSearch?.uri).toBe(WINWOOD_VALERIE.uri);
  });

  it("keeps the earlier of two equally scored tracks", () => {
    const song = { artist: "Steve Winwood", title: "Valerie" };
    const best = pickBestCandidate(
      song,
      [WINWOOD_VALERIE_80S_SUMMER_HITS, WINWOOD_VALERIE_MUSIC_FOR_EIGHTIES],
      null
    );
    expect(best?.uri).toBe(WINWOOD_VALERIE_80S_SUMMER_HITS.uri);
  });

  it("returns nothing when there are no results", () => {
    expect(pickBestCandidate({ artist: "Steve Winwood", title: "Valerie" }, [], null)).toBeNull();
  });
});
