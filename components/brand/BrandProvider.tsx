"use client";

import { useEffect, type ReactNode } from "react";
import { hexToRgbChannels } from "@/lib/brands/hexToRgb";
import { resolveBrandFonts, fontFamilyCss, buildGoogleFontHref } from "@/lib/brands/fonts";
import type { BrandConfig } from "@/lib/brands/types";

type BrandProviderProps = {
  brand: BrandConfig | null;
  children: ReactNode;
};

function setBrandFontLink(attr: string, family: string) {
  const existing = document.querySelector(`link[${attr}]`);
  if (existing) existing.remove();
  const href = buildGoogleFontHref(family);
  if (!href) return; // next/font-managed default or unsupported — nothing to load
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute(attr, "true");
  document.head.appendChild(link);
}

export function BrandProvider({ brand, children }: BrandProviderProps): ReactNode {
  useEffect(() => {
    if (!brand) return;
    const root = document.documentElement;

    // Hex + RGB-channel tokens (the design uses both forms).
    const colours: Array<[string, string]> = [
      ["--brand-primary", brand.color_primary],
      ["--brand-primary-light", brand.color_primary_light],
      ["--brand-accent", brand.color_accent],
      ["--brand-accent-light", brand.color_accent_light],
    ];
    for (const [name, hex] of colours) {
      root.style.setProperty(name, hex);
      root.style.setProperty(`${name}-rgb`, hexToRgbChannels(hex));
    }

    // Fonts — resolved through the allowlist (A9); links only for non-next/font families.
    const { display, body } = resolveBrandFonts(brand);
    root.style.setProperty("--brand-display", fontFamilyCss(display));
    root.style.setProperty("--brand-body", fontFamilyCss(body));
    setBrandFontLink("data-brand-font-display", display);
    setBrandFontLink("data-brand-font-body", body);

    document.title = `${brand.name} — Music Bingo`;

    return () => {
      for (const [name] of colours) {
        root.style.removeProperty(name);
        root.style.removeProperty(`${name}-rgb`);
      }
      root.style.removeProperty("--brand-display");
      root.style.removeProperty("--brand-body");
      document.querySelector("link[data-brand-font-display]")?.remove();
      document.querySelector("link[data-brand-font-body]")?.remove();
      document.title = "Music Bingo";
    };
  }, [brand]);

  return <>{children}</>;
}
