import assert from "node:assert/strict";
import test from "node:test";

import {
  computeRevealState,
  getRevealPhase,
  shouldTriggerNextForTrack,
  updateAdvanceTrackMarker,
} from "@/lib/live/reveal";

test("getRevealPhase follows 10s/20s/25s/30s thresholds", () => {
  assert.equal(getRevealPhase(0), "hidden");
  assert.equal(getRevealPhase(9_999), "hidden");
  assert.equal(getRevealPhase(10_000), "album");
  assert.equal(getRevealPhase(19_999), "album");
  assert.equal(getRevealPhase(20_000), "title");
  assert.equal(getRevealPhase(24_999), "title");
  assert.equal(getRevealPhase(25_000), "artist");
  assert.equal(getRevealPhase(29_999), "artist");
  assert.equal(getRevealPhase(30_000), "advance");
});

test("computeRevealState maps phases to reveal booleans", () => {
  assert.deepEqual(computeRevealState(0), {
    showAlbum: false,
    showTitle: false,
    showArtist: false,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(10_000), {
    showAlbum: true,
    showTitle: false,
    showArtist: false,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(20_000), {
    showAlbum: true,
    showTitle: true,
    showArtist: false,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(25_000), {
    showAlbum: true,
    showTitle: true,
    showArtist: true,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(30_000), {
    showAlbum: true,
    showTitle: true,
    showArtist: true,
    shouldAdvance: true,
  });
});

test("shouldTriggerNextForTrack fires once per track", () => {
  const reveal = computeRevealState(30_000);
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
