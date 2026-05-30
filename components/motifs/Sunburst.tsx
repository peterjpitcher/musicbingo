import React from "react";

export type SunburstProps = {
  size?: number;
  style?: React.CSSProperties;
};

/** Decorative radiating sunburst disc — purely presentational. */
export function Sunburst({ size = 1400, style }: SunburstProps): React.ReactElement {
  return (
    <div
      className="sunburst"
      style={{ width: size, height: size, ...style }}
      aria-hidden
    />
  );
}
