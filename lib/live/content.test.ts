import { describe, it, expect } from "vitest";
import { CONTENT_KEYS, sanitizeContent, normalizeVariant, getContent, isContentKey } from "@/lib/live/content";
import type { LiveSessionV1, LiveRuntimeState } from "@/lib/live/types";
import type { BrandConfig } from "@/lib/brands/types";

const brand = { name: "The Anchor", website_url: "www.the-anchor.pub", break_message: "Back in 10", end_message: "Night night" } as unknown as BrandConfig;
const session = { eventDateDisplay: "Fri 27 June", games: [{ theme: "Pop Anthems" }, { theme: "Throwbacks" }] } as unknown as LiveSessionV1;

describe("sanitizeContent", () => {
  it("keeps only allowlisted keys, trims, and drops empties", () => {
    const out = sanitizeContent({ hostName: "  Nikki  ", bogusKey: "x", winTeam: "" });
    expect(out).toEqual({ hostName: "Nikki" });
  });
  it("drops legacy winner team-name fields", () => {
    const out = sanitizeContent({ winTeam: "Curls", spoonTeam: "Lagers", winPrize: "Voucher" });
    expect(out).toEqual({ winPrize: "Voucher" });
  });
  it("caps overly long values", () => {
    const out = sanitizeContent({ welcomeLede: "x".repeat(1000) });
    expect((out.welcomeLede ?? "").length).toBeLessThanOrEqual(500);
  });
  it("returns an empty object for non-objects", () => {
    expect(sanitizeContent(null)).toEqual({});
    expect(sanitizeContent("nope")).toEqual({});
  });
});

describe("normalizeVariant", () => {
  it("accepts A/B/C, rejects everything else", () => {
    expect(normalizeVariant("B")).toBe("B");
    expect(normalizeVariant("D")).toBeNull();
    expect(normalizeVariant(undefined)).toBeNull();
  });
});

describe("getContent precedence", () => {
  const runtime = { content: { hostName: "Live Nikki" } } as unknown as LiveRuntimeState;
  it("runtime overrides session overrides derived overrides placeholder", () => {
    expect(getContent("hostName", { runtime, session, brand })).toBe("Live Nikki");
    expect(getContent("hostName", { session: { ...session, content: { hostName: "Saved Nikki" } } as LiveSessionV1, brand })).toBe("Saved Nikki");
  });
  it("derives g1theme/g2theme from the session games", () => {
    expect(getContent("g1theme", { session, brand })).toBe("Pop Anthems");
    expect(getContent("g2theme", { session, brand })).toBe("Throwbacks");
  });
  it("derives running-order Music Bingo rows from the session game themes", () => {
    expect(getContent("ro2t", { session, brand })).toBe("Music Bingo · Game 1");
    expect(getContent("ro2s", { session, brand })).toBe("Pop Anthems — warm up, then 50 songs to dab");
    expect(getContent("ro5t", { session, brand })).toBe("Music Bingo · Game 2");
    expect(getContent("ro5s", { session, brand })).toBe("Throwbacks — sing-along warm up, then Game 2");
  });
  it("derives venue copy from the brand", () => {
    expect(getContent("venueName", { brand })).toBe("The Anchor");
    expect(getContent("venueWeb", { brand })).toBe("www.the-anchor.pub");
    expect(getContent("venueWeb", { brand: { ...brand, website_url: "https://www.the-anchor.pub/" } })).toBe("www.the-anchor.pub");
  });
  it("never invents the host name or prizes", () => {
    for (const key of ["hostName", "winPrize", "spoonPrize"] as const) {
      expect(getContent(key, {})).toBe("");
      expect(getContent(key, { session, brand })).toBe("");
    }
  });
  it("still shows prizes and host name the host typed", () => {
    const typed = { content: { winPrize: "Bar tab", spoonPrize: "Wooden spoon", hostName: "Sam" } } as unknown as LiveRuntimeState;
    expect(getContent("winPrize", { runtime: typed })).toBe("Bar tab");
    expect(getContent("spoonPrize", { runtime: typed })).toBe("Wooden spoon");
    expect(getContent("hostName", { runtime: typed })).toBe("Sam");
  });
  it("falls back to the design placeholder when nothing else is set", () => {
    expect(getContent("welcomeTitle", {})).toBe("Music");
    expect(getContent("welcomeTitle2", {})).toBe("Bingo");
  });
  it("has no typed next date or QR links any more (spec M-7): stored values are dropped", () => {
    for (const key of ["nextDate", "reviewQrUrl", "bookQrUrl", "tyL1", "tyL2", "tyLede"]) {
      expect(isContentKey(key)).toBe(false);
    }
    expect(sanitizeContent({ nextDate: "Fri 4 Dec", reviewQrUrl: "https://g.page/r/x", bookQrUrl: "https://x", tyHideReview: "1" })).toEqual({
      tyHideReview: "1",
    });
  });
  it("the host's hide switches default to off", () => {
    expect(getContent("tyHideReview", {})).toBe("");
    expect(getContent("tyHideNext", {})).toBe("");
  });
  it("has no sample date, songs or themes to fall back to (7 November 2026)", () => {
    for (const key of ["welcomeDate", "introTitle", "introArtist", "danceTitle", "danceArtist", "singTitle", "singArtist", "g1theme", "g1title", "g1artist", "g2theme", "g2title", "g2artist"] as const) {
      expect(getContent(key, {})).toBe("");
    }
  });
  it("still takes the game themes from the session", () => {
    expect(getContent("g1theme", { session })).toBe("Pop Anthems");
    expect(getContent("g2theme", { session })).toBe("Throwbacks");
  });
  it("drops a stored copy of an old design sample, so the real value shows", () => {
    expect(sanitizeContent({ welcomeDate: "Friday · 8:00 PM", g1theme: "Pop Anthems", g2theme: "Throwback Bangers", hostName: "Sam" })).toEqual({ hostName: "Sam" });
    expect(sanitizeContent({ welcomeDate: "Saturday 21 November · 7pm" })).toEqual({ welcomeDate: "Saturday 21 November · 7pm" });
  });
  it("every ContentKey has a placeholder string", () => {
    for (const k of CONTENT_KEYS) expect(typeof getContent(k, {})).toBe("string");
  });
});
