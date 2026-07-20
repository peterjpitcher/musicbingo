import { expect, test } from "vitest";

import { makeIntroTracking, trackIntroPlayback } from "@/lib/live/introState";

test("makeIntroTracking ignores the pre-intro track and has no anchor yet", () => {
  const tracking = makeIntroTracking({ expectedTrackId: "intro", currentTrackId: "old" });
  expect(tracking).toEqual({ expectedTrackId: "intro", ignoreTrackId: "old", anchorTrackId: null });
});

test("makeIntroTracking anchors immediately when the intro is already current", () => {
  const tracking = makeIntroTracking({ expectedTrackId: "intro", currentTrackId: "intro" });
  expect(tracking.anchorTrackId).toBe("intro");
  expect(tracking.ignoreTrackId).toBeNull();
});

test("stale reports of the pre-intro track hold the intro flag", () => {
  const tracking = makeIntroTracking({ expectedTrackId: "intro", currentTrackId: "old" });
  const result = trackIntroPlayback(tracking, "old");
  expect(result.isIntroSong).toBe(true);
  expect(result.introFinished).toBe(false);
  expect(result.tracking.anchorTrackId).toBeNull();
});

test("observing the expected track anchors it and stays intro", () => {
  const tracking = makeIntroTracking({ expectedTrackId: "intro", currentTrackId: "old" });
  const result = trackIntroPlayback(tracking, "intro");
  expect(result.isIntroSong).toBe(true);
  expect(result.tracking.anchorTrackId).toBe("intro");
});

test("an unknown track before anchoring is adopted as a relinked intro", () => {
  const tracking = makeIntroTracking({ expectedTrackId: "intro", currentTrackId: "old" });
  const result = trackIntroPlayback(tracking, "relinked-intro");
  expect(result.isIntroSong).toBe(true);
  expect(result.tracking.anchorTrackId).toBe("relinked-intro");
});

test("null playback holds the intro flag before and after anchoring", () => {
  const before = trackIntroPlayback(
    makeIntroTracking({ expectedTrackId: "intro", currentTrackId: "old" }),
    null
  );
  expect(before.isIntroSong).toBe(true);

  const anchored = trackIntroPlayback(
    { expectedTrackId: "intro", ignoreTrackId: "old", anchorTrackId: "intro" },
    null
  );
  expect(anchored.isIntroSong).toBe(true);
  expect(anchored.introFinished).toBe(false);
});

test("moving away from the anchored track finishes the intro", () => {
  const tracking = { expectedTrackId: "intro", ignoreTrackId: "old", anchorTrackId: "intro" };
  const result = trackIntroPlayback(tracking, "next-song");
  expect(result.isIntroSong).toBe(false);
  expect(result.introFinished).toBe(true);
});

test("full sequence: stale, anchor, hold, finish", () => {
  let tracking = makeIntroTracking({ expectedTrackId: "intro", currentTrackId: "old" });

  let step = trackIntroPlayback(tracking, "old");
  expect(step.isIntroSong).toBe(true);
  tracking = step.tracking;

  step = trackIntroPlayback(tracking, "intro");
  expect(step.isIntroSong).toBe(true);
  tracking = step.tracking;

  step = trackIntroPlayback(tracking, "intro");
  expect(step.isIntroSong).toBe(true);
  tracking = step.tracking;

  step = trackIntroPlayback(tracking, "next-song");
  expect(step.isIntroSong).toBe(false);
  expect(step.introFinished).toBe(true);
});
