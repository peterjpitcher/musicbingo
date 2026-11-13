import { describe, expect, it } from "vitest";

import { computeRevealState } from "@/lib/live/reveal";
import {
  findSongStartMs,
  nextSongStartMs,
  songProgressMs,
  songStartSeekIgnored,
  songStartSeekMs,
  songStartsFromSongs,
  usableSongStartMs,
} from "@/lib/live/songStart";
import { DEFAULT_REVEAL_CONFIG } from "@/lib/live/types";

describe("song start times on the night", () => {
  const starts = songStartsFromSongs([
    { artist: "Mud", title: "Tiger Feet", startMs: 40_000 },
    { artist: "Blur", title: "Song 2" },
  ]);

  it("keeps only songs with a start time", () => {
    expect(starts).toEqual([{ artist: "Mud", title: "Tiger Feet", startMs: 40_000 }]);
  });

  it("finds the start time for the Spotify track, fuzzily", () => {
    expect(findSongStartMs({ artist: "Mud", title: "Tiger Feet - 2006 Remaster" }, starts)).toBe(40_000);
    expect(findSongStartMs({ artist: "Blur", title: "Song 2" }, starts)).toBe(0);
    expect(findSongStartMs(null, starts)).toBe(0);
    expect(findSongStartMs({ artist: "Mud", title: "Tiger Feet" }, undefined)).toBe(0);
  });

  it("ignores a start time too close to the end of the track", () => {
    expect(usableSongStartMs(40_000, 200_000)).toBe(40_000);
    expect(usableSongStartMs(190_000, 200_000)).toBe(0);
    expect(usableSongStartMs(40_000, null)).toBe(40_000);
    expect(usableSongStartMs(0, 200_000)).toBe(0);
  });

  it("counts the song from its start point", () => {
    expect(songProgressMs(55_000, 40_000)).toBe(15_000);
    expect(songProgressMs(3_000, 40_000)).toBe(0);
  });

  it("seeks only when Spotify is well short of the start point", () => {
    expect(songStartSeekMs({ songStartMs: 40_000, progressMs: 1_000 })).toBe(40_000);
    expect(songStartSeekMs({ songStartMs: 40_000, progressMs: 39_000 })).toBeNull();
    expect(songStartSeekMs({ songStartMs: 0, progressMs: 1_000 })).toBeNull();
  });

  it("changes nothing for a night without start times", () => {
    for (const progress of [0, 9_999, 10_000, 30_000, 44_999, 45_000, 60_000]) {
      expect(songProgressMs(progress, 0)).toBe(progress);
      expect(songProgressMs(progress, undefined)).toBe(progress);
      expect(computeRevealState(songProgressMs(progress, undefined), DEFAULT_REVEAL_CONFIG))
        .toEqual(computeRevealState(progress, DEFAULT_REVEAL_CONFIG));
    }
    expect(songStartSeekMs({ songStartMs: 0, progressMs: 0 })).toBeNull();
  });

  it("reveals on the usual schedule after the start point", () => {
    const at = (ms: number) => computeRevealState(songProgressMs(40_000 + ms, 40_000), DEFAULT_REVEAL_CONFIG);
    expect(at(0).showAlbum).toBe(false);
    expect(at(DEFAULT_REVEAL_CONFIG.albumMs).showAlbum).toBe(true);
    expect(at(DEFAULT_REVEAL_CONFIG.nextMs - 1).shouldAdvance).toBe(false);
    expect(at(DEFAULT_REVEAL_CONFIG.nextMs).shouldAdvance).toBe(true);
  });
});

describe("nextSongStartMs", () => {
  const base = {
    trackChanged: true,
    previousStartMs: 0,
    configuredStartMs: 40_000,
    durationMs: 200_000,
    isIntroSong: false,
    freePlay: false,
    canControlPlayback: true,
  };
  it("takes the start time when a new song comes up", () => {
    expect(nextSongStartMs(base)).toBe(40_000);
  });
  it("keeps it through a mid-song loss of control or free-play toggle", () => {
    const midSong = { ...base, trackChanged: false, previousStartMs: 40_000 };
    expect(nextSongStartMs({ ...midSong, canControlPlayback: false })).toBe(40_000);
    expect(nextSongStartMs({ ...midSong, freePlay: true })).toBe(40_000);
  });
  it("uses none for the warm-up, free play or manual control", () => {
    expect(nextSongStartMs({ ...base, isIntroSong: true })).toBe(0);
    expect(nextSongStartMs({ ...base, freePlay: true })).toBe(0);
    expect(nextSongStartMs({ ...base, canControlPlayback: false })).toBe(0);
  });
});

describe("songStartSeekIgnored", () => {
  it("gives up when Spotify stayed near the top after the jump", () => {
    expect(songStartSeekIgnored({ songStartMs: 40_000, progressMs: 8_000, msSinceSeek: 7_000 })).toBe(true);
  });
  it("waits a moment, and leaves a song that did jump", () => {
    expect(songStartSeekIgnored({ songStartMs: 40_000, progressMs: 2_000, msSinceSeek: 1_000 })).toBe(false);
    expect(songStartSeekIgnored({ songStartMs: 40_000, progressMs: 47_000, msSinceSeek: 7_000 })).toBe(false);
    expect(songStartSeekIgnored({ songStartMs: 0, progressMs: 8_000, msSinceSeek: 7_000 })).toBe(false);
  });
});
