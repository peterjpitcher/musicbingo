import { describe, expect, test } from "vitest";

import { feedConfigFromRow } from "@/lib/brands/brandRepo";

const KEY = `anch_${"k".repeat(43)}`;
const ANCHOR_ROW = {
  event_feed_type: "anchor_management",
  event_feed_base_url: null,
  event_feed_venue_id: null,
  website_url: "https://www.the-anchor.pub",
};

describe("the printed pack's feed settings (spec M-7)", () => {
  test("take the key from ANCHOR_API_KEY, never from the venue row", () => {
    const config = feedConfigFromRow(ANCHOR_ROW, { ANCHOR_API_KEY: KEY });
    expect(config).toMatchObject({ type: "anchor_management", apiKey: KEY, baseUrl: "https://management.orangejelly.co.uk/api" });
  });

  test("still read MANAGEMENT_API_TOKEN for one release", () => {
    expect(feedConfigFromRow(ANCHOR_ROW, { MANAGEMENT_API_TOKEN: "old-token" }).apiKey).toBe("old-token");
  });

  test("without an env key there is no key at all (the pack builds without events)", () => {
    expect(feedConfigFromRow(ANCHOR_ROW, {}).apiKey).toBeNull();
  });

  test("never send the env key to a different host a venue names", () => {
    const row = { ...ANCHOR_ROW, event_feed_base_url: "https://somewhere-else.example.com" };
    expect(feedConfigFromRow(row, { ANCHOR_API_KEY: KEY }).apiKey).toBeNull();
    const same = { ...ANCHOR_ROW, event_feed_base_url: "https://management.orangejelly.co.uk" };
    expect(feedConfigFromRow(same, { ANCHOR_API_KEY: KEY }).apiKey).toBe(KEY);
  });

  test("a BaronsHub venue gets no key, and no feed means none", () => {
    const barons = { ...ANCHOR_ROW, event_feed_type: "baronshub", event_feed_base_url: "https://baronshub.example.com" };
    expect(feedConfigFromRow(barons, { ANCHOR_API_KEY: KEY }).apiKey).toBeNull();
    expect(feedConfigFromRow({ ...ANCHOR_ROW, event_feed_type: "none" }, { ANCHOR_API_KEY: KEY })).toEqual({
      type: "none", baseUrl: null, apiKey: null, websiteUrl: null, venueId: null,
    });
  });
});
