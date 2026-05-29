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
  expect(getRevealPhase(11_249)).toBe("hidden");
  expect(getRevealPhase(11_250)).toBe("album");
  expect(getRevealPhase(22_499)).toBe("album");
  expect(getRevealPhase(22_500)).toBe("title");
  expect(getRevealPhase(29_999)).toBe("title");
  expect(getRevealPhase(30_000)).toBe("artist");
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

  expect(computeRevealState(11_250)).toEqual({
    showAlbum: true,
    showTitle: false,
    showArtist: false,
    shouldAdvance: false,
  });

  expect(computeRevealState(22_500)).toEqual({
    showAlbum: true,
    showTitle: true,
    showArtist: false,
    shouldAdvance: false,
  });

  expect(computeRevealState(30_000)).toEqual({
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
    albumMs: 15_000,
    titleMs: 30_000,
    artistMs: 40_000,
    nextMs: 60_000,
  });
  expect(makeRevealConfigForSongPlayMs(45_000)).toEqual({
    albumMs: 11_250,
    titleMs: 22_500,
    artistMs: 30_000,
    nextMs: 45_000,
  });
});

test("getRevealConfigWithExtension preserves relative timing after skip or extension", () => {
  const cfg = makeRevealConfigForSongPlayMs(45_000);
  const extended = getRevealConfigWithExtension(cfg, 30_000);
  expect(extended).toEqual({
    albumMs: 18_750,
    titleMs: 37_500,
    artistMs: 50_000,
    nextMs: 75_000,
  });
  expect(getRevealPhase(30_000, extended)).toBe("album");
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
