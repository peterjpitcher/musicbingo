import React from "react";

export type BallProps = {
  /** The number or label displayed inside the ball. */
  n: React.ReactNode;
  size?: number;
  style?: React.CSSProperties;
};

/** Circular bingo-ball motif displaying a number or label. */
export function Ball({ n, size = 120, style }: BallProps): React.ReactElement {
  return (
    <div
      className="ball"
      style={{ width: size, height: size, fontSize: size * 0.42, ...style }}
    >
      {n}
    </div>
  );
}
