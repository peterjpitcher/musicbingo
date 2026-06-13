import React from "react";
import type { BrandConfig } from "@/lib/brands/types";

export type VenueLogoProps = {
  brand: BrandConfig;
  /** "sm" renders at a smaller size; "md" (default) renders full-size. */
  size?: "sm" | "md";
};

/**
 * Venue logo — renders the brand's dark-background logo image when available,
 * otherwise falls back to a styled wordmark div.
 *
 * Note: `brand.logo_dark_url` may be a storage object key rather than a full
 * public URL at this stage; Phase 2 will resolve it to a CDN URL before render.
 */
export function VenueLogo({ brand, size = "md" }: VenueLogoProps): React.ReactElement {
  const cls = size === "sm" ? "venue-logo venue-logo--sm" : "venue-logo";

  if (brand.logo_dark_url) {
    return (
      // Brand logos are dynamic Storage URLs/keys, not next/image-friendly —
      // matches the existing display page convention (raw <img>).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.logo_dark_url}
        alt={brand.name}
        className={cls}
      />
    );
  }

  return (
    <div
      className="logo-fallback"
      style={{ fontSize: size === "sm" ? 26 : 40 }}
    >
      {brand.name}
    </div>
  );
}
