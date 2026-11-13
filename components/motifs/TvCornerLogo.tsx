import React from "react";
import type { BrandConfig } from "@/lib/brands/types";
import { VenueLogo } from "@/components/motifs/VenueLogo";

/**
 * The Anchor logo in the top-left corner of every TV screen (Peter,
 * 13 November 2026). Drawn once over the screens, outside the screen that
 * fades on each step, so it stays put as the show moves on. Sits where the
 * Welcome screen always had it (90 by 70 canvas pixels, inside a TV's
 * overscan), above the footer and below the points pop-up. Screens no longer
 * draw their own corner logo.
 */
export function TvCornerLogo({ brand }: { brand: BrandConfig }): React.ReactElement {
  return (
    <div className="tv-corner-logo" data-tv-corner-logo>
      <VenueLogo brand={brand} />
    </div>
  );
}
