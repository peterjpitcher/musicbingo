import { describe, it, expect } from "vitest";
import { CONTENT_KEYS, sanitizeContent, normalizeVariant, getContent } from "@/lib/live/content";
import type { LiveSessionV1, LiveRuntimeState } from "@/lib/live/types";
import type { BrandConfig } from "@/lib/brands/types";

const brand = { name: "The Anchor", website_url: "theanchor.pub", break_message: "Back in 10", end_message: "Night night" } as unknown as BrandConfig;
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
    expect(getContent("venueWeb", { brand })).toBe("theanchor.pub");
  });
  it("keeps winner prize placeholders editable", () => {
    expect(getContent("winPrize", {})).toBe("£25 bar voucher");
    expect(getContent("spoonPrize", {})).toBe("Bottle of house wine");
  });
  it("falls back to the design placeholder when nothing else is set", () => {
    expect(getContent("welcomeTitle", {})).toBe("Music");
    expect(getContent("welcomeTitle2", {})).toBe("Bingo");
  });
  it("defaults the review QR URL", () => {
    expect(getContent("reviewQrUrl", {})).toBe("https://vip-club.uk/jls0mu");
  });
  it("every ContentKey has a placeholder string", () => {
    for (const k of CONTENT_KEYS) expect(typeof getContent(k, {})).toBe("string");
  });
});
