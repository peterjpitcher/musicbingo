import React from "react";

export type BulbsProps = {
  /** Spacing between bulb centres in pixels. Defaults to 46. */
  gap?: number;
  /** Radius of each bulb circle in pixels. Defaults to 6. */
  r?: number;
};

/**
 * Marquee light-bulb frame rendered as an absolutely-positioned SVG.
 * The parent element must be `position: relative` (or similar) so this
 * fills its bounds correctly.
 */
export function Bulbs({ gap = 46, r = 6 }: BulbsProps): React.ReactElement {
  return (
    <svg
      className="bulbs"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        <pattern
          id="b-h"
          width={gap}
          height={gap}
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx={gap / 2}
            cy={r + 2}
            r={r}
            fill="var(--brand-accent-light)"
            opacity=".9"
          />
        </pattern>
      </defs>
    </svg>
  );
}
