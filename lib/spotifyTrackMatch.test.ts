import { describe, expect, it } from "vitest";

import {
  MATCH_ACCEPT_SCORE,
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
const HELP_REMASTERED_2009: TrackCandidate = {
  uri: "spotify:track:7DD7eSuYSC5xk2ArU62esN",
  name: "Help! - Remastered 2009",
  artists: ["The Beatles"],
};
const WITH_A_LITTLE_HELP: TrackCandidate = {
  uri: "spotify:track:2RnPATK99oGOZygnD2GTO6",
  name: "With A Little Help From My Friends - Remastered 2009",
  artists: ["The Beatles"],
};
const WAVES_RADIO_EDIT: TrackCandidate = {
  uri: "spotify:track:1HFfMOxCAT4GAwaPfCdmUs",
  name: "Waves - Robin Schulz Radio Edit",
  artists: ["Mr. Probz", "Robin Schulz"],
};

describe("scoreTrackCandidate", () => {
  it("gives an exact artist and title full marks", () => {
    expect(scoreTrackCandidate({ artist: "Steve Winwood", title: "Valerie" }, WINWOOD_VALERIE)).toBe(1);
  });

  it("matches lines typed title first", () => {
    expect(scoreTrackCandidate({ artist: "Valerie", title: "Steve Winwood" }, WINWOOD_VALERIE)).toBe(1);
  });

  // Each of these scored below MATCH_ACCEPT_SCORE (0.57, 0.57, 0.48) while Spotify's
  // " - <suffix>" counted against the title. Valerie was the one song the 14 August
  // playlist could not load, although the printed cards still carried it.
  it.each([
    ["Mark Ronson, Amy Winehouse", "Valerie", RONSON_VALERIE],
    ["The Beatles", "Help!", HELP_REMASTERED_2009],
    ["Mr. Probz", "Waves", WAVES_RADIO_EDIT],
  ])("accepts %s – %s when Spotify adds a version suffix", (artist, title, track) => {
    expect(scoreTrackCandidate({ artist, title }, track)).toBeGreaterThanOrEqual(MATCH_ACCEPT_SCORE);
  });

  it("accepts a suffixed track for a line typed title first", () => {
    expect(
      scoreTrackCandidate({ artist: "Valerie", title: "Mark Ronson, Amy Winehouse" }, RONSON_VALERIE)
    ).toBeGreaterThanOrEqual(MATCH_ACCEPT_SCORE);
  });

  it("still rejects a different song by the same artist", () => {
    expect(scoreTrackCandidate({ artist: "The Beatles", title: "Help!" }, WITH_A_LITTLE_HELP)).toBeLessThan(
      MATCH_ACCEPT_SCORE
    );
  });
});

describe("titleSimilarity", () => {
  it("ignores a featured artist in brackets", () => {
    expect(titleSimilarity("Valerie", "Valerie (feat. Amy Winehouse)")).toBe(1);
  });

  it.each([
    ["Valerie", "Valerie (feat. Amy Winehouse) - Version Revisited"],
    ["Help!", "Help! - Remastered 2009"],
    ["Waves", "Waves - Robin Schulz Radio Edit"],
    ["You're The One That I Want", "You're The One That I Want - From “Grease”"],
    ["Ob-La-Di, Ob-La-Da", "Ob-La-Di, Ob-La-Da - First Version - Take 5"],
  ])("gives %s full marks against %s", (input, spotifyName) => {
    expect(titleSimilarity(input, spotifyName)).toBe(1);
  });

  it("keeps hyphens inside a title", () => {
    expect(titleSimilarity("Ob-La-Di, Ob-La-Da", "Ob-La-Di, Ob-La-Da - Remastered 2009")).toBe(1);
  });
});

describe("pickBestCandidate", () => {
  // Before suffixes were ignored, Winwood's exact "Valerie" won both lines (0.73 against 0.57).
  it.each(["Mark Ronson", "Amy Winehouse"])(
    "does not let Steve Winwood's Valerie outrank Mark Ronson's for %s",
    (artist) => {
      const song = { artist, title: "Valerie" };
      expect(pickBestCandidate(song, [WINWOOD_VALERIE, RONSON_VALERIE], null)?.uri).toBe(RONSON_VALERIE.uri);
      expect(pickBestCandidate(song, [RONSON_VALERIE, WINWOOD_VALERIE], null)?.uri).toBe(RONSON_VALERIE.uri);
    }
  );

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
