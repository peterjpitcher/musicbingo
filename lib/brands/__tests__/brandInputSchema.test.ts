import { describe, it, expect } from "vitest";
import { brandInputSchema } from "../types";

const validBrandInput = {
  name: "Test Brand",
  is_default: false,
  logo_dark_url: "/logo-dark.png",
  logo_light_url: "/logo-light.png",
  color_primary: "#003f27",
  color_primary_light: "#0f6846",
  color_accent: "#a57626",
  color_accent_light: "#c4952f",
  font_family: null,
  break_message: null,
  end_message: null,
  website_url: null,
  qr_items: null,
  event_feed_type: "none",
  event_feed_base_url: null,
  event_feed_venue_id: null,
};

describe("brandInputSchema — logo path validation", () => {
  it("accepts a valid brand input", () => {
    expect(brandInputSchema.safeParse(validBrandInput).success).toBe(true);
  });

  it("rejects a logo_dark_url containing '..' (path traversal)", () => {
    const result = brandInputSchema.safeParse({
      ...validBrandInput,
      logo_dark_url: "/../package.json",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a logo_light_url containing '..' (path traversal)", () => {
    const result = brandInputSchema.safeParse({
      ...validBrandInput,
      logo_light_url: "../../secret",
    });
    expect(result.success).toBe(false);
  });
});
