import { describe, it, expect } from "vitest";
import {
  SUPPORTED_BRAND_FONTS,
  DEFAULT_DISPLAY_FONT,
  DEFAULT_BODY_FONT,
  resolveSupportedFont,
  resolveBrandFonts,
  fontFamilyCss,
  buildGoogleFontHref,
} from "@/lib/brands/fonts";

describe("resolveSupportedFont", () => {
  it("returns the font when supported", () => {
    expect(resolveSupportedFont("Oswald", "Anton")).toBe("Oswald");
  });
  it("falls back when the font is unknown", () => {
    expect(resolveSupportedFont("Comic Sans", "Anton")).toBe("Anton");
  });
  it("falls back when null/empty", () => {
    expect(resolveSupportedFont(null, "Archivo")).toBe("Archivo");
    expect(resolveSupportedFont("", "Archivo")).toBe("Archivo");
  });
});

describe("resolveBrandFonts", () => {
  it("uses defaults when nothing set", () => {
    expect(resolveBrandFonts({ font_display: null, font_body: null, font_family: null }))
      .toEqual({ display: DEFAULT_DISPLAY_FONT, body: DEFAULT_BODY_FONT });
  });
  it("falls back body to legacy font_family", () => {
    expect(resolveBrandFonts({ font_display: null, font_body: null, font_family: "Poppins" }).body)
      .toBe("Poppins");
  });
  it("ignores unsupported values", () => {
    expect(resolveBrandFonts({ font_display: "Wingdings", font_body: "Oswald", font_family: null }))
      .toEqual({ display: DEFAULT_DISPLAY_FONT, body: "Oswald" });
  });
});

describe("fontFamilyCss", () => {
  it("uses the next/font variable for built-in defaults", () => {
    expect(fontFamilyCss("Anton")).toContain("var(--font-anton)");
    expect(fontFamilyCss("Archivo")).toContain("var(--font-archivo)");
  });
  it("quotes other supported families", () => {
    expect(fontFamilyCss("Oswald")).toContain("'Oswald'");
  });
});

describe("buildGoogleFontHref", () => {
  it("returns null for next/font-managed defaults", () => {
    expect(buildGoogleFontHref("Anton")).toBeNull();
    expect(buildGoogleFontHref("Archivo")).toBeNull();
  });
  it("returns null for unsupported families (no arbitrary injection)", () => {
    expect(buildGoogleFontHref("Comic Sans")).toBeNull();
  });
  it("builds a css2 URL for supported web fonts", () => {
    const href = buildGoogleFontHref("Oswald");
    expect(href).toContain("https://fonts.googleapis.com/css2?family=Oswald");
    expect(href).toContain("wght@");
  });
});

describe("SUPPORTED_BRAND_FONTS", () => {
  it("includes the defaults", () => {
    expect(SUPPORTED_BRAND_FONTS).toHaveProperty("Anton");
    expect(SUPPORTED_BRAND_FONTS).toHaveProperty("Archivo");
  });
});
