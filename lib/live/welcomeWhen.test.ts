import { describe, expect, it } from "vitest";

import { welcomeWhen } from "@/lib/live/welcomeWhen";
import { MUSIC_NOV_20, NO_FEED, QUIZ_NOV_25, feedWith, screenEvent } from "@/lib/test/screenFeedFixtures";

// Friday 20 November 2026, 18:00 GMT: the evening of MUSIC_NOV_20 (20:00 GMT).
const NOV_20_EVENING = Date.parse("2026-11-20T18:00:00.000Z");

describe("welcomeWhen (spec M-7: no invented time on the welcome screen)", () => {
  it("shows tonight's start from the feed for the session's date", () => {
    expect(welcomeWhen({ eventDateInput: "2026-11-20", feed: feedWith([MUSIC_NOV_20]), nowMs: NOV_20_EVENING })).toBe("Tonight · 8pm");
  });

  it("names the day when the game is not tonight (a host preview days ahead)", () => {
    const nowMs = Date.parse("2026-11-18T12:00:00.000Z");
    expect(welcomeWhen({ eventDateInput: "2026-11-20", feed: feedWith([MUSIC_NOV_20]), nowMs })).toBe("Friday 20 November · 8pm");
  });

  it("with no session date, uses tonight's Music Bingo from the feed", () => {
    expect(welcomeWhen({ eventDateInput: "", feed: feedWith([MUSIC_NOV_20]), nowMs: NOV_20_EVENING })).toBe("Tonight · 8pm");
  });

  it("shows no time at all when the feed has no night on the game's date", () => {
    const otherDay = welcomeWhen({ eventDateInput: "2026-11-21", feed: feedWith([MUSIC_NOV_20]), nowMs: NOV_20_EVENING });
    expect(otherDay).toBe("Saturday 21 November");
    expect(otherDay).not.toMatch(/\d(am|pm)|:\d\d/);
  });

  it("shows no time at all when the feed is down, unset or has no key", () => {
    for (const feed of [null, NO_FEED, { ...NO_FEED, status: "missing_config" as const }, feedWith([])]) {
      expect(welcomeWhen({ eventDateInput: "2026-11-20", feed, nowMs: NOV_20_EVENING })).toBe("Tonight");
    }
  });

  it("shows nothing at all with no session date and no night in the feed", () => {
    for (const feed of [null, NO_FEED, feedWith([], [QUIZ_NOV_25])]) {
      expect(welcomeWhen({ eventDateInput: null, feed, nowMs: NOV_20_EVENING })).toBe("");
      expect(welcomeWhen({ eventDateInput: "not a date", feed, nowMs: NOV_20_EVENING })).toBe("");
    }
  });

  it("never takes the time from another format's event that night", () => {
    const quizTonight = screenEvent("q2", "Test Quiz", "2026-11-20T19:00:00.000Z", "quiz-night-stanwell-moor");
    // feed.events holds other formats; only feed.nights (Music Bingo) counts.
    expect(welcomeWhen({ eventDateInput: "2026-11-20", feed: feedWith([], [quizTonight]), nowMs: NOV_20_EVENING })).toBe("Tonight");
  });

  it("judges the night by London date, and gives the London time in summer", () => {
    // Saturday 1 August 2026, 19:30 BST is 18:30 UTC.
    const summer = screenEvent("mb3", "Test Summer Music Bingo", "2026-08-01T18:30:00.000Z", "music-bingo");
    const nowMs = Date.parse("2026-08-01T12:00:00.000Z");
    expect(welcomeWhen({ eventDateInput: "2026-08-01", feed: feedWith([summer]), nowMs })).toBe("Tonight · 7:30pm");
    // 23:30 UTC on 1 August is 00:30 BST on 2 August: not the 1 August game.
    const lateUtc = screenEvent("mb4", "Test Late Music Bingo", "2026-08-01T23:30:00.000Z", "music-bingo");
    expect(welcomeWhen({ eventDateInput: "2026-08-01", feed: feedWith([lateUtc]), nowMs })).toBe("Tonight");
  });
});
