import { describe, it, expect } from "vitest";
import { brandSchema, brandInputSchema } from "@/lib/brands/types";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "The Anchor",
  is_default: true,
  logo_dark_url: "anchor/logo-dark.png",
  logo_light_url: "anchor/logo-light.png",
  color_primary: "#003F27",
  color_primary_light: "#0F6846",
  color_accent: "#A57626",
  color_accent_light: "#C4952F",
  font_family: null,
  font_display: "Anton",
  font_body: "Archivo",
  event_logo_url: "anchor/event-logo.png",
  break_message: null,
  end_message: null,
  website_url: null,
  qr_items: null,
  event_feed_type: "none",
  event_feed_base_url: null,
  event_feed_venue_id: null,
  event_feed_has_key: false,
  created_at: "2026-05-29T00:00:00.000Z",
  updated_at: "2026-05-29T00:00:00.000Z",
};

describe("brandSchema with font + event-logo fields", () => {
  it("parses a brand carrying the new fields", () => {
    const parsed = brandSchema.parse(base);
    expect(parsed.font_display).toBe("Anton");
    expect(parsed.font_body).toBe("Archivo");
    expect(parsed.event_logo_url).toBe("anchor/event-logo.png");
  });
  it("accepts null/empty for the new fields", () => {
    const parsed = brandSchema.parse({ ...base, font_display: null, font_body: null, event_logo_url: "" });
    expect(parsed.font_display).toBeNull();
    expect(parsed.event_logo_url).toBe("");
  });
  it("brandInputSchema omits server-managed fields but keeps the new ones", () => {
    const { id, created_at, updated_at, event_feed_has_key, ...input } = base;
    const parsed = brandInputSchema.parse(input);
    expect(parsed.font_display).toBe("Anton");
    expect(parsed.event_logo_url).toBe("anchor/event-logo.png");
  });
});
