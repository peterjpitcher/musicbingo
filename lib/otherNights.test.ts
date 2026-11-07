import { describe, expect, test, vi } from "vitest";

import {
  OTHER_NIGHTS_REPORT_SCOPE,
  loadOtherNights,
  readOtherNightUrls,
  selectOtherNights,
  type OtherNightUrls,
} from "./otherNights";
import { MUSIC_NOV_20, NO_FEED, PARTY_NOV_28, QUIZ_NOV_25, feedWith, screenEvent } from "@/lib/test/screenFeedFixtures";

// Invented addresses for tests only.
const URLS: OtherNightUrls = {
  quiz: "https://quiz.example.com",
  cash: "https://bingo.example.com",
  tasting: "https://tasting.example.com",
};
const CASH_NOV_26 = screenEvent("c1", "Test Cash Bingo", "2026-11-26T19:00:00.000Z", "bingo-night");

describe("selectOtherNights (spec M-10)", () => {
  test("only nights the feed says are running, with an address, never Music Bingo itself", () => {
    const feed = feedWith([MUSIC_NOV_20], [QUIZ_NOV_25, PARTY_NOV_28]);
    const { nights, failure } = selectOtherNights(feed, URLS);
    expect(nights).toEqual([{ key: "quiz", name: "Quiz Night", href: "https://quiz.example.com/" }]);
    expect(failure).toBeNull();
  });

  test("a running night with no address, or one that is not https, is left out", () => {
    const feed = feedWith([], [QUIZ_NOV_25, CASH_NOV_26]);
    expect(selectOtherNights(feed, { cash: "http://bingo.example.com" }).nights).toEqual([]);
  });

  test("a down feed hides the row and says so; no events or no key hides it quietly", () => {
    const down = selectOtherNights(NO_FEED, URLS);
    expect(down.nights).toEqual([]);
    expect(down.failure).toBeInstanceOf(Error);
    expect(selectOtherNights(feedWith([]), URLS)).toEqual({ nights: [], failure: null });
    expect(selectOtherNights({ ...NO_FEED, status: "missing_config" }, URLS)).toEqual({ nights: [], failure: null });
  });
});

describe("loadOtherNights", () => {
  test("a feed that throws hides the row and is reported", async () => {
    const report = vi.fn();
    const nights = await loadOtherNights({ getFeed: () => Promise.reject(new Error("boom")), urls: URLS, report });
    expect(nights).toEqual([]);
    expect(report).toHaveBeenCalledWith(OTHER_NIGHTS_REPORT_SCOPE, expect.any(Error));
  });

  test("a down feed is reported, a healthy one is not", async () => {
    const report = vi.fn();
    await loadOtherNights({ getFeed: async () => NO_FEED, urls: URLS, report });
    expect(report).toHaveBeenCalledTimes(1);
    report.mockClear();
    const nights = await loadOtherNights({ getFeed: async () => feedWith([], [CASH_NOV_26]), urls: URLS, report });
    expect(nights.map((n) => n.key)).toEqual(["cash"]);
    expect(report).not.toHaveBeenCalled();
  });
});

describe("readOtherNightUrls", () => {
  test("reads each sister night's address by its env name", () => {
    expect(
      readOtherNightUrls({
        NEXT_PUBLIC_QUIZ_NIGHT_URL: "https://q.example.com",
        NEXT_PUBLIC_CASH_BINGO_URL: "https://c.example.com",
        NEXT_PUBLIC_TASTING_NIGHT_URL: undefined,
      }),
    ).toEqual({ quiz: "https://q.example.com", cash: "https://c.example.com", tasting: undefined });
  });
});
