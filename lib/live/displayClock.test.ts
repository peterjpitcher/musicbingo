import { describe, expect, it } from "vitest";

import { isNewerRuntime, nextProgressAnchor, progressAt, type ProgressAnchor } from "@/lib/live/displayClock";

const anchor = (progressMs: number, atMs: number, trackId = "song-a"): ProgressAnchor => ({ trackId, progressMs, atMs });

describe("display song clock", () => {
  it("counts up from the anchor while playing, and holds when paused", () => {
    expect(progressAt(anchor(10_000, 1_000), true, 3_500)).toBe(12_500);
    expect(progressAt(anchor(10_000, 1_000), false, 3_500)).toBe(10_000);
  });

  it("keeps counting when a save is only a little behind (its lag), so the timer never steps back", () => {
    // Showing 12.5s; the save says 11s because Spotify reported it earlier.
    const next = nextProgressAnchor({
      previous: anchor(10_000, 1_000),
      incoming: { trackId: "song-a", progressMs: 11_000 },
      isPlaying: true,
      nowMs: 3_500,
    });
    expect(progressAt(next, true, 3_500)).toBe(12_500);
    expect(progressAt(next, true, 4_500)).toBe(13_500);
  });

  it("jumps forward when a save is ahead", () => {
    const next = nextProgressAnchor({
      previous: anchor(10_000, 1_000),
      incoming: { trackId: "song-a", progressMs: 15_000 },
      isPlaying: true,
      nowMs: 3_500,
    });
    expect(progressAt(next, true, 3_500)).toBe(15_000);
  });

  it("follows a real restart or seek further back than the lag tolerance", () => {
    const next = nextProgressAnchor({
      previous: anchor(30_000, 1_000),
      incoming: { trackId: "song-a", progressMs: 1_000 },
      isPlaying: true,
      nowMs: 2_000,
    });
    expect(progressAt(next, true, 2_000)).toBe(1_000);
  });

  it("starts a new song from its own position", () => {
    const next = nextProgressAnchor({
      previous: anchor(44_000, 1_000),
      incoming: { trackId: "song-b", progressMs: 500 },
      isPlaying: true,
      nowMs: 2_000,
    });
    expect(next).toEqual({ trackId: "song-b", progressMs: 500, atMs: 2_000 });
  });

  it("takes a paused song's position as saved", () => {
    const next = nextProgressAnchor({
      previous: anchor(20_000, 1_000),
      incoming: { trackId: "song-a", progressMs: 19_000 },
      isPlaying: false,
      nowMs: 2_000,
    });
    expect(progressAt(next, false, 9_000)).toBe(19_000);
  });
});

describe("isNewerRuntime", () => {
  it("ignores a save older than the one already shown", () => {
    expect(isNewerRuntime(1_000, null)).toBe(true);
    expect(isNewerRuntime(2_000, 1_000)).toBe(true);
    expect(isNewerRuntime(2_000, 2_000)).toBe(true);
    expect(isNewerRuntime(1_500, 2_000)).toBe(false);
  });

  it("takes a much older save, which means the host was reset rather than a late arrival", () => {
    expect(isNewerRuntime(1_000, 100_000)).toBe(true);
  });
});
