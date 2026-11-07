import { describe, expect, test } from "vitest";

import {
  buildPromoPlaylist,
  readPromoHides,
  resolvePromoMode,
  sessionDateFor,
  type PromoMode,
} from "@/lib/promo/promoMode";
import { feedWith, MUSIC_DEC_18, MUSIC_NOV_20, NO_FEED, PARTY_NOV_28, QUIZ_NOV_25 } from "@/lib/test/screenFeedFixtures";

const SHOWN = { hideReview: false, hideNext: false };
const THANK_YOU: PromoMode = { kind: "thank_you", ...SHOWN };
const REVIEW = "https://l.the-anchor.pub/jls0mu";

describe("which screens loop the events (spec M-7, S7.4 and S7.5)", () => {
  test("welcome and the interval loop, led by their own screen, with the right QR channel", () => {
    expect(resolvePromoMode("welcome", SHOWN)).toEqual({ kind: "idle", lead: "welcome", channel: "pre_event_screen" });
    expect(resolvePromoMode("break", SHOWN)).toEqual({ kind: "idle", lead: "break", channel: "in_game_screen" });
  });

  test("the end of the night is the thank-you loop, with the host's switches", () => {
    expect(resolvePromoMode("thanks", { hideReview: true, hideNext: false })).toEqual({ kind: "thank_you", hideReview: true, hideNext: false });
  });

  test("never a game, a claim, the standings or the winners", () => {
    for (const id of ["game1", "game2", "claim", "standings", "winners", "winner-entry", "dance", "sing", "sys-load", "sys-none"] as const) {
      expect(resolvePromoMode(id, SHOWN)).toBeNull();
    }
  });

  test("the switches are on only for exactly \"1\"", () => {
    const content: Record<string, string> = { tyHideReview: "1", tyHideNext: "yes" };
    expect(readPromoHides((key) => content[key] ?? "")).toEqual({ hideReview: true, hideNext: false });
  });
});

describe("the London date of tonight's game", () => {
  test("uses the game's own date when it has one", () => {
    expect(sessionDateFor("2026-11-20", Date.parse("2026-11-07T12:00:00Z"))).toBe("2026-11-20");
  });

  test("falls back to today in London, not in UTC, after midnight in summer", () => {
    // 23:30 UTC on 4 July is 00:30 on 5 July in London (BST).
    expect(sessionDateFor("", Date.parse("2026-07-04T23:30:00Z"))).toBe("2026-07-05");
    expect(sessionDateFor("Fri 27 June", Date.parse("2026-07-04T23:30:00Z"))).toBe("2026-07-05");
  });
});

describe("the next Music Bingo on the thank-you screen", () => {
  const nowMs = Date.parse("2026-11-20T22:30:00Z");

  test("is the next night by London date, never tonight's own", () => {
    const [slide] = buildPromoPlaylist({
      mode: THANK_YOU,
      feed: feedWith([MUSIC_DEC_18, MUSIC_NOV_20]),
      nowMs: Date.parse("2026-11-20T18:00:00Z"),
      reviewUrl: REVIEW,
      sessionDate: "2026-11-20",
    });
    expect(slide.kind).toBe("thank_you");
    expect(slide.kind === "thank_you" && slide.nextNight?.id).toBe("mb2");
    expect(slide.kind === "thank_you" && slide.nextNightQr).toBe("https://l.the-anchor.pub/postmb2");
  });

  test("takes the earliest upcoming night of the format when tonight is another date", () => {
    const [slide] = buildPromoPlaylist({
      mode: THANK_YOU,
      feed: feedWith([MUSIC_DEC_18, MUSIC_NOV_20], [QUIZ_NOV_25]),
      nowMs: Date.parse("2026-11-07T21:00:00Z"),
      reviewUrl: REVIEW,
      sessionDate: "2026-11-07",
    });
    expect(slide.kind === "thank_you" && slide.nextNight?.id).toBe("mb1");
  });

  test("with no feed there is no next night, so the kit shows \"See what's on\", never a typed date", () => {
    for (const feed of [null, NO_FEED, feedWith([])]) {
      const slides = buildPromoPlaylist({ mode: THANK_YOU, feed, nowMs, reviewUrl: REVIEW, sessionDate: "2026-11-20" });
      expect(slides).toHaveLength(1);
      expect(slides[0].kind === "thank_you" && slides[0].nextNight).toBeNull();
      expect(slides[0].kind === "thank_you" && slides[0].reviewUrl).toBe(REVIEW);
    }
  });

  test("a Google review link is never shown, and a hidden card stays hidden", () => {
    const [google] = buildPromoPlaylist({ mode: THANK_YOU, feed: null, nowMs, reviewUrl: "https://g.page/r/abc/review", sessionDate: "2026-11-20" });
    expect(google.kind === "thank_you" && google.reviewUrl).toBeNull();
    const [hidden] = buildPromoPlaylist({
      mode: { kind: "thank_you", hideReview: true, hideNext: true },
      feed: feedWith([MUSIC_DEC_18]),
      nowMs,
      reviewUrl: REVIEW,
      sessionDate: "2026-11-20",
    });
    expect(hidden.kind === "thank_you" && hidden.reviewUrl).toBeNull();
    expect(hidden.kind === "thank_you" && hidden.nextNight).toBeNull();
  });

  test("then the next two upcoming events in turn", () => {
    const slides = buildPromoPlaylist({
      mode: THANK_YOU,
      feed: feedWith([MUSIC_DEC_18], [QUIZ_NOV_25, PARTY_NOV_28]),
      nowMs,
      reviewUrl: REVIEW,
      sessionDate: "2026-11-20",
    });
    expect(slides.map((s) => s.kind)).toEqual(["thank_you", "event", "event"]);
  });
});

describe("the idle and break loops", () => {
  const nowMs = Date.parse("2026-11-07T19:00:00Z");

  test("the interval leads with the break screen and uses the in-game links", () => {
    const slides = buildPromoPlaylist({
      mode: { kind: "idle", lead: "break", channel: "in_game_screen" },
      feed: feedWith([MUSIC_NOV_20], [QUIZ_NOV_25, PARTY_NOV_28]),
      nowMs,
      reviewUrl: REVIEW,
      sessionDate: "2026-11-07",
    });
    expect(slides[0]).toMatchObject({ kind: "app", id: "break" });
    const next = slides.find((s) => s.kind === "next_night");
    expect(next && "qrUrl" in next && next.qrUrl).toBe("https://l.the-anchor.pub/inmb1");
  });

  test("a feed outage shows only Music Bingo's own screen and what's on: nothing invented", () => {
    const slides = buildPromoPlaylist({
      mode: { kind: "idle", lead: "welcome", channel: "pre_event_screen" },
      feed: NO_FEED,
      nowMs,
      reviewUrl: REVIEW,
      sessionDate: "2026-11-07",
    });
    expect(slides.map((s) => s.kind)).toEqual(["app", "whats_on"]);
  });

  test("a TV with no game tonight loops what's on alone when the feed is down", () => {
    const slides = buildPromoPlaylist({
      mode: { kind: "idle", lead: null, channel: "post_event_screen" },
      feed: null,
      nowMs,
      reviewUrl: REVIEW,
      sessionDate: "2026-11-07",
    });
    expect(slides.map((s) => s.kind)).toEqual(["whats_on"]);
  });
});
