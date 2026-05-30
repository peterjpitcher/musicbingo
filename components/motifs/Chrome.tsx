import React from "react";

export type ChromeProps = {
  /** Content rendered in the left slot (after the accent dot). */
  left?: React.ReactNode;
  /** Content rendered in the right slot. */
  right?: React.ReactNode;
};

/** Footer chrome strip with an accent dot, left slot, and right slot. */
export function Chrome({ left, right }: ChromeProps): React.ReactElement {
  return (
    <div className="chrome">
      <div>
        <span className="dot" />
        {left}
      </div>
      <div>{right}</div>
    </div>
  );
}
