import React from "react";

export type VinylProps = {
  size?: number;
  /** When false, the spin animation is paused. Defaults to true. */
  spin?: boolean;
  style?: React.CSSProperties;
};

/** Spinning vinyl record decoration — purely presentational. */
export function Vinyl({ size = 360, spin = true, style }: VinylProps): React.ReactElement {
  return (
    <div
      className="vinyl"
      style={{
        width: size,
        height: size,
        animationPlayState: spin ? "running" : "paused",
        ...style,
      }}
      aria-hidden
    >
      <div className="vinyl__label">
        <div className="vinyl__hole" />
      </div>
    </div>
  );
}
