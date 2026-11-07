import { describe, expect, test } from "vitest";

import { DEFAULT_ANCHOR_API_BASE_URL, DEPRECATED_ANCHOR_API_NAMES, deprecationNote, resolveAnchorApiEnv } from "@/lib/anchorApiEnv";
import { DEPRECATED_ANCHOR_API_NAMES as BUILD_NAMES, deprecatedEnvInUse } from "@/lib/buildEnv.mjs";
import { resolveReviewUrl, REVIEW_FALLBACK_URL } from "@/lib/reviewLink";

const KEY = `anch_${"k".repeat(43)}`;

describe("the events API settings (spec M-7)", () => {
  test("read ANCHOR_API_KEY and ANCHOR_API_BASE_URL", () => {
    expect(resolveAnchorApiEnv({ ANCHOR_API_KEY: KEY, ANCHOR_API_BASE_URL: "https://mgmt.example.com/api/" })).toEqual({
      apiKey: KEY,
      baseUrl: "https://mgmt.example.com/api",
      deprecated: [],
    });
  });

  test("still read the old names for one release, and say so", () => {
    const env = { MANAGEMENT_API_TOKEN: "old-token", MANAGEMENT_API_BASE_URL: "https://old.example.com" };
    const resolved = resolveAnchorApiEnv(env);
    expect(resolved).toEqual({ apiKey: "old-token", baseUrl: "https://old.example.com", deprecated: ["MANAGEMENT_API_TOKEN", "MANAGEMENT_API_BASE_URL"] });
    expect(deprecationNote(resolved.deprecated)).toContain("rename MANAGEMENT_API_TOKEN to ANCHOR_API_KEY and MANAGEMENT_API_BASE_URL to ANCHOR_API_BASE_URL");
    expect(deprecatedEnvInUse(env)).toHaveLength(2);
  });

  test("the new name wins over the old one, and then nothing is deprecated", () => {
    const resolved = resolveAnchorApiEnv({ ANCHOR_API_KEY: KEY, MANAGEMENT_API_TOKEN: "old-token" });
    expect(resolved.apiKey).toBe(KEY);
    expect(resolved.deprecated).toEqual([]);
    expect(deprecationNote(resolved.deprecated)).toBeNull();
  });

  test("no key at all is null (the feed answers missing_config), with the kit's default address", () => {
    expect(resolveAnchorApiEnv({ ANCHOR_API_KEY: "  " })).toEqual({ apiKey: null, baseUrl: DEFAULT_ANCHOR_API_BASE_URL, deprecated: [] });
  });

  test("the build check and the runtime read the same old names", () => {
    expect({ ...BUILD_NAMES }).toEqual({ ...DEPRECATED_ANCHOR_API_NAMES });
  });
});

describe("the review link (spec M-7, S7.5)", () => {
  test("is REVIEW_SHORT_URL when it is an Anchor short link", () => {
    expect(resolveReviewUrl("https://l.the-anchor.pub/mbreview")).toBe("https://l.the-anchor.pub/mbreview");
  });

  test("falls back to the existing short link until Music Bingo's own exists", () => {
    expect(REVIEW_FALLBACK_URL).toBe("https://l.the-anchor.pub/jls0mu");
    expect(resolveReviewUrl(undefined)).toBe(REVIEW_FALLBACK_URL);
    expect(resolveReviewUrl("")).toBe(REVIEW_FALLBACK_URL);
  });

  test("never sends anyone straight to Google", () => {
    expect(resolveReviewUrl("https://g.page/r/the-anchor/review")).toBe(REVIEW_FALLBACK_URL);
    expect(resolveReviewUrl("https://search.google.com/local/writereview?placeid=x")).toBe(REVIEW_FALLBACK_URL);
    expect(resolveReviewUrl("http://l.the-anchor.pub/mbreview")).toBe(REVIEW_FALLBACK_URL);
  });
});
