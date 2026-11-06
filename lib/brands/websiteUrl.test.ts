import { describe, it, expect } from "vitest";

import { normaliseWebUrl, websiteLabel } from "@/lib/brands/websiteUrl";

describe("normaliseWebUrl", () => {
  it("adds https:// to a value stored without a scheme", () => {
    expect(normaliseWebUrl("www.the-anchor.pub")).toBe("https://www.the-anchor.pub/");
    expect(normaliseWebUrl("  www.the-anchor.pub/whats-on ")).toBe("https://www.the-anchor.pub/whats-on");
  });

  it("keeps a value that already has an http(s) scheme", () => {
    expect(normaliseWebUrl("https://www.the-anchor.pub/whats-on")).toBe("https://www.the-anchor.pub/whats-on");
    expect(normaliseWebUrl("HTTP://www.the-anchor.pub")).toBe("http://www.the-anchor.pub/");
  });

  it("returns null for empty or unusable values", () => {
    expect(normaliseWebUrl("")).toBeNull();
    expect(normaliseWebUrl("   ")).toBeNull();
    expect(normaliseWebUrl(null)).toBeNull();
    expect(normaliseWebUrl(undefined)).toBeNull();
    expect(normaliseWebUrl("anchor")).toBeNull();
    expect(normaliseWebUrl("the anchor pub")).toBeNull();
    expect(normaliseWebUrl("mailto:hello@the-anchor.pub")).toBeNull();
    expect(normaliseWebUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("websiteLabel", () => {
  it("shows the address without scheme or trailing slash", () => {
    expect(websiteLabel("https://www.the-anchor.pub/")).toBe("www.the-anchor.pub");
    expect(websiteLabel("www.the-anchor.pub")).toBe("www.the-anchor.pub");
  });

  it("is empty for an unusable value", () => {
    expect(websiteLabel("")).toBe("");
    expect(websiteLabel(null)).toBe("");
  });
});
