import React from "react";

export type EqProps = {
  /** Number of equaliser bars to render. Defaults to 9. */
  bars?: number;
  style?: React.CSSProperties;
};

/** Animated equaliser bars — purely presentational. */
export function Eq({ bars = 9, style }: EqProps): React.ReactElement {
  return (
    <div className="eq" style={style} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <i
          key={i}
          style={{
            animationDelay: `${(i % 5) * 120}ms`,
            animationDuration: `${700 + (i % 4) * 160}ms`,
          }}
        />
      ))}
    </div>
  );
}
