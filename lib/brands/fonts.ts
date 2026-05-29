/**
 * Allowlist of brand-selectable fonts. Brand `font_display`/`font_body` values
 * MUST resolve through this registry before any dynamic Google Fonts link is
 * created — never interpolate arbitrary DB strings into stylesheet URLs (spec A9/§14).
 *
 * `nextFontVar` marks families already loaded by next/font in app/layout.tsx;
 * those are referenced via their CSS variable and never re-loaded from Google.
 */
export type SupportedFont = {
  weights: string; // css2 `wght@` list
  category: "display" | "body" | "both";
  nextFontVar?: string; // set for next/font-managed defaults
  genericFallback: string;
};

export const SUPPORTED_BRAND_FONTS: Record<string, SupportedFont> = {
  Anton: { weights: "400", category: "display", nextFontVar: "--font-anton", genericFallback: "Impact, sans-serif" },
  Archivo: { weights: "400;500;600;700;800", category: "both", nextFontVar: "--font-archivo", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
  Inter: { weights: "400;600;700;900", category: "body", nextFontVar: "--font-inter", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
  Oswald: { weights: "400;500;600;700", category: "display", genericFallback: "Impact, sans-serif" },
  "Bebas Neue": { weights: "400", category: "display", genericFallback: "Impact, sans-serif" },
  "Playfair Display": { weights: "400;600;700;800", category: "display", genericFallback: "Georgia, serif" },
  Poppins: { weights: "400;500;600;700", category: "body", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
  Montserrat: { weights: "400;500;600;700", category: "body", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
};

export const DEFAULT_DISPLAY_FONT = "Anton";
export const DEFAULT_BODY_FONT = "Archivo";

export function resolveSupportedFont(name: string | null | undefined, fallback: string): string {
  if (name && Object.prototype.hasOwnProperty.call(SUPPORTED_BRAND_FONTS, name)) return name;
  return fallback;
}

export function resolveBrandFonts(input: {
  font_display?: string | null;
  font_body?: string | null;
  font_family?: string | null;
}): { display: string; body: string } {
  return {
    display: resolveSupportedFont(input.font_display, DEFAULT_DISPLAY_FONT),
    body: resolveSupportedFont(input.font_body ?? input.font_family ?? null, DEFAULT_BODY_FONT),
  };
}

/** CSS `font-family` value for a supported family (uses the next/font variable when available). */
export function fontFamilyCss(family: string): string {
  const font = SUPPORTED_BRAND_FONTS[family];
  if (!font) return `var(--font-archivo), ui-sans-serif, system-ui, sans-serif`;
  if (font.nextFontVar) return `var(${font.nextFontVar}), ${font.genericFallback}`;
  return `'${family}', ${font.genericFallback}`;
}

/** Google Fonts css2 URL for families NOT managed by next/font; null otherwise. */
export function buildGoogleFontHref(family: string): string | null {
  const font = SUPPORTED_BRAND_FONTS[family];
  if (!font || font.nextFontVar) return null;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${font.weights}&display=swap`;
}
