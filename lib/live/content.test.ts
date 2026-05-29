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
  it("derives venue copy from the brand", () => {
    expect(getContent("venueName", { brand })).toBe("The Anchor");
    expect(getContent("venueWeb", { brand })).toBe("theanchor.pub");
  });
  it("falls back to the design placeholder when nothing else is set", () => {
    expect(getContent("welcomeTitle", {})).toBe("Music");
    expect(getContent("welcomeTitle2", {})).toBe("Bingo");
  });
  it("every ContentKey has a placeholder string", () => {
    for (const k of CONTENT_KEYS) expect(typeof getContent(k, {})).toBe("string");
  });
});
