import { test, expect } from "vitest";

import {
  computeRevealState,
  getRevealPhase,
  shouldTriggerNextForTrack,
  updateAdvanceTrackMarker,
} from "@/lib/live/reveal";
import { getRevealConfigWithExtension, makeRevealConfigForSongPlayMs } from "@/lib/live/types";

test("getRevealPhase follows relative 45s default thresholds", () => {
  expect(getRevealPhase(0)).toBe("hidden");
  expect(getRevealPhase(9_999)).toBe("hidden");
  expect(getRevealPhase(10_000)).toBe("album");
  expect(getRevealPhase(14_999)).toBe("album");
  expect(getRevealPhase(15_000)).toBe("title");
  expect(getRevealPhase(19_999)).toBe("title");
  expect(getRevealPhase(20_000)).toBe("artist");
  expect(getRevealPhase(44_999)).toBe("artist");
  expect(getRevealPhase(45_000)).toBe("advance");
});

test("computeRevealState maps phases to reveal booleans", () => {
  expect(computeRevealState(0)).toEqual({
    showAlbum: false,
    showTitle: false,
    showArtist: false,
    shouldAdvance: false,
  });

  expect(computeRevealState(10_000)).toEqual({
    showAlbum: true,
    showTitle: false,
    showArtist: false,
    shouldAdvance: false,
  });

  expect(computeRevealState(15_000)).toEqual({
    showAlbum: true,
    showTitle: true,
    showArtist: false,
    shouldAdvance: false,
  });

  expect(computeRevealState(20_000)).toEqual({
    showAlbum: true,
    showTitle: true,
    showArtist: true,
    shouldAdvance: false,
  });

  expect(computeRevealState(45_000)).toEqual({
    showAlbum: true,
    showTitle: true,
    showArtist: true,
    shouldAdvance: true,
  });
});

test("makeRevealConfigForSongPlayMs scales milestones with song play time", () => {
  expect(makeRevealConfigForSongPlayMs(60_000)).toEqual({
    albumMs: 13_333,
    titleMs: 20_000,
    artistMs: 26_667,
    nextMs: 60_000,
  });
  expect(makeRevealConfigForSongPlayMs(45_000)).toEqual({
    albumMs: 10_000,
    titleMs: 15_000,
    artistMs: 20_000,
    nextMs: 45_000,
  });
});

test("getRevealConfigWithExtension preserves relative timing after skip or extension", () => {
  const cfg = makeRevealConfigForSongPlayMs(45_000);
  const extended = getRevealConfigWithExtension(cfg, 30_000);
  expect(extended).toEqual({
    albumMs: 16_667,
    titleMs: 25_000,
    artistMs: 33_333,
    nextMs: 75_000,
  });
  expect(getRevealPhase(30_000, extended)).toBe("title");
  expect(getRevealPhase(75_000, extended)).toBe("advance");
});

test("shouldTriggerNextForTrack fires once per track", () => {
  const reveal = computeRevealState(45_000);
  expect(
    shouldTriggerNextForTrack({
      trackId: "abc",
      revealState: reveal,
      advanceTriggeredForTrackId: null,
    })
  ).toBe(true);

  expect(
    shouldTriggerNextForTrack({
      trackId: "abc",
      revealState: reveal,
      advanceTriggeredForTrackId: "abc",
    })
  ).toBe(false);
});

test("updateAdvanceTrackMarker clears marker when track changes", () => {
  expect(updateAdvanceTrackMarker({ trackId: "abc", advanceTriggeredForTrackId: "abc" })).toBe("abc");
  expect(updateAdvanceTrackMarker({ trackId: "xyz", advanceTriggeredForTrackId: "abc" })).toBeNull();
  expect(updateAdvanceTrackMarker({ trackId: null, advanceTriggeredForTrackId: "abc" })).toBeNull();
});
