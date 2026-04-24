"use client";

import { useEffect, type ReactNode } from "react";
import { hexToRgbChannels } from "@/lib/brands/hexToRgb";
import type { BrandConfig } from "@/lib/brands/types";

type BrandProviderProps = {
  brand: BrandConfig | null;
  children: ReactNode;
};

export function BrandProvider({ brand, children }: BrandProviderProps): ReactNode {
  useEffect(() => {
    if (!brand) return;

    const root = document.documentElement;
    root.style.setProperty("--brand-primary-rgb", hexToRgbChannels(brand.color_primary));
    root.style.setProperty("--brand-primary-light-rgb", hexToRgbChannels(brand.color_primary_light));
    root.style.setProperty("--brand-accent-rgb", hexToRgbChannels(brand.color_accent));
    root.style.setProperty("--brand-accent-light-rgb", hexToRgbChannels(brand.color_accent_light));

    // Update page title
    document.title = `${brand.name} — Music Bingo`;

    // Load Google Font if specified
    if (brand.font_family) {
      const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(brand.font_family)}:wght@400;600;700;900&display=swap`;
      const existingLink = document.querySelector(`link[data-brand-font]`);
      if (existingLink) existingLink.remove();

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = fontUrl;
      link.setAttribute("data-brand-font", "true");
      document.head.appendChild(link);
      root.style.setProperty("--brand-font", `'${brand.font_family}', ui-sans-serif, system-ui, sans-serif`);
    } else {
      root.style.setProperty("--brand-font", "'Inter', ui-sans-serif, system-ui, sans-serif");
      const existingLink = document.querySelector(`link[data-brand-font]`);
      if (existingLink) existingLink.remove();
    }

    return () => {
      // Reset to defaults on unmount
      root.style.removeProperty("--brand-primary-rgb");
      root.style.removeProperty("--brand-primary-light-rgb");
      root.style.removeProperty("--brand-accent-rgb");
      root.style.removeProperty("--brand-accent-light-rgb");
      root.style.removeProperty("--brand-font");
      document.title = "Music Bingo";
      const existingLink = document.querySelector(`link[data-brand-font]`);
      if (existingLink) existingLink.remove();
    };
  }, [brand]);

  return <>{children}</>;
}
