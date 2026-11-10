import { beforeEach, describe, expect, test, vi } from "vitest";

// A tiny stand-in for the service-role client: enough of the query builder
// for brandRepo's reads (eq, order, maybeSingle, or awaiting the builder).
type Row = Record<string, unknown>;
let rows: Row[] = [];

function query(): unknown {
  let current = [...rows];
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      current = current.filter((row) => row[column] === value);
      return builder;
    },
    order: () => builder,
    maybeSingle: async () => ({ data: current[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: current, error: null }),
  };
  return builder;
}

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseClient: () => ({ from: () => query() }),
}));

const { resolveScreenBrandConfig, resolveBrandConfig, getDefaultBrand } = await import("@/lib/brands/brandRepo");

const ANCHOR = "91e11e2e-9daf-4f21-b530-b9aacdc51daf";
const BARONS = "d717e865-46a0-4a00-a00b-34198c5d0e06";

function brand(id: string, name: string, extra: Row = {}): Row {
  return {
    id,
    name,
    is_default: false,
    logo_dark_url: "/a.png",
    logo_light_url: "/b.png",
    color_primary: "#003f27",
    color_primary_light: "#0f6846",
    color_accent: "#a57626",
    color_accent_light: "#c4952f",
    font_family: null,
    font_display: null,
    font_body: null,
    event_logo_url: null,
    break_message: null,
    end_message: null,
    website_url: null,
    qr_items: null,
    event_feed_type: "none",
    event_feed_base_url: null,
    event_feed_venue_id: null,
    event_feed_api_key: null,
    created_at: "2026-04-24T12:00:00Z",
    updated_at: "2026-04-24T12:00:00Z",
    ...extra,
  };
}

describe("resolveScreenBrandConfig", () => {
  beforeEach(() => {
    rows = [
      brand(ANCHOR, "The Anchor Pub", { is_default: true }),
      brand(BARONS, "Barons Pubs", { archived_at: "2026-11-14T10:00:00Z" }),
    ];
  });

  test("a game made for an archived venue shows the default venue", async () => {
    expect((await resolveScreenBrandConfig(BARONS))?.id).toBe(ANCHOR);
  });

  test("printed packs still resolve the venue the game was made for", async () => {
    expect((await resolveBrandConfig(BARONS))?.id).toBe(BARONS);
  });

  test("a live venue resolves to itself", async () => {
    expect((await resolveScreenBrandConfig(ANCHOR))?.id).toBe(ANCHOR);
  });

  test("no venue on the game resolves to the default", async () => {
    expect((await resolveScreenBrandConfig(null))?.id).toBe(ANCHOR);
  });

  test("rows read before the column exists count as live", async () => {
    rows = [brand(BARONS, "Barons Pubs")];
    expect((await resolveScreenBrandConfig(BARONS))?.id).toBe(BARONS);
  });
});

describe("getDefaultBrand", () => {
  test("skips an archived venue when there is no flagged default", async () => {
    rows = [
      brand(BARONS, "Barons Pubs", { archived_at: "2026-11-14T10:00:00Z" }),
      brand(ANCHOR, "The Anchor Pub"),
    ];
    expect((await getDefaultBrand())?.id).toBe(ANCHOR);
  });

  test("returns nothing when every venue is archived", async () => {
    rows = [brand(BARONS, "Barons Pubs", { archived_at: "2026-11-14T10:00:00Z" })];
    expect(await getDefaultBrand()).toBeNull();
  });
});
