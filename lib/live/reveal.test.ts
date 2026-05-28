import assert from "node:assert/strict";
import test from "node:test";

import {
  computeRevealState,
  getRevealPhase,
  shouldTriggerNextForTrack,
  updateAdvanceTrackMarker,
} from "@/lib/live/reveal";
import { getRevealConfigWithExtension, makeRevealConfigForSongPlayMs } from "@/lib/live/types";

test("getRevealPhase follows relative 45s default thresholds", () => {
  assert.equal(getRevealPhase(0), "hidden");
  assert.equal(getRevealPhase(11_249), "hidden");
  assert.equal(getRevealPhase(11_250), "album");
  assert.equal(getRevealPhase(22_499), "album");
  assert.equal(getRevealPhase(22_500), "title");
  assert.equal(getRevealPhase(29_999), "title");
  assert.equal(getRevealPhase(30_000), "artist");
  assert.equal(getRevealPhase(44_999), "artist");
  assert.equal(getRevealPhase(45_000), "advance");
});

test("computeRevealState maps phases to reveal booleans", () => {
  assert.deepEqual(computeRevealState(0), {
    showAlbum: false,
    showTitle: false,
    showArtist: false,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(11_250), {
    showAlbum: true,
    showTitle: false,
    showArtist: false,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(22_500), {
    showAlbum: true,
    showTitle: true,
    showArtist: false,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(30_000), {
    showAlbum: true,
    showTitle: true,
    showArtist: true,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(45_000), {
    showAlbum: true,
    showTitle: true,
    showArtist: true,
    shouldAdvance: true,
  });
});

test("makeRevealConfigForSongPlayMs scales milestones with song play time", () => {
  assert.deepEqual(makeRevealConfigForSongPlayMs(60_000), {
    albumMs: 15_000,
    titleMs: 30_000,
    artistMs: 40_000,
    nextMs: 60_000,
  });
  assert.deepEqual(makeRevealConfigForSongPlayMs(45_000), {
    albumMs: 11_250,
    titleMs: 22_500,
    artistMs: 30_000,
    nextMs: 45_000,
  });
});

test("getRevealConfigWithExtension preserves relative timing after skip or extension", () => {
  const cfg = makeRevealConfigForSongPlayMs(45_000);
  const extended = getRevealConfigWithExtension(cfg, 30_000);
  assert.deepEqual(extended, {
    albumMs: 18_750,
    titleMs: 37_500,
    artistMs: 50_000,
    nextMs: 75_000,
  });
  assert.equal(getRevealPhase(30_000, extended), "album");
  assert.equal(getRevealPhase(75_000, extended), "advance");
});

test("shouldTriggerNextForTrack fires once per track", () => {
  const reveal = computeRevealState(45_000);
  assert.equal(
    shouldTriggerNextForTrack({
      trackId: "abc",
      revealState: reveal,
      advanceTriggeredForTrackId: null,
    }),
    true
  );

  assert.equal(
    shouldTriggerNextForTrack({
      trackId: "abc",
      revealState: reveal,
      advanceTriggeredForTrackId: "abc",
    }),
    false
  );
});

test("updateAdvanceTrackMarker clears marker when track changes", () => {
  assert.equal(updateAdvanceTrackMarker({ trackId: "abc", advanceTriggeredForTrackId: "abc" }), "abc");
  assert.equal(updateAdvanceTrackMarker({ trackId: "xyz", advanceTriggeredForTrackId: "abc" }), null);
  assert.equal(updateAdvanceTrackMarker({ trackId: null, advanceTriggeredForTrackId: "abc" }), null);
});
