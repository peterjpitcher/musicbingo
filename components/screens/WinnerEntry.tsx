"use client";

import React from "react";
import type { ScreenProps } from "@/components/screens/types";
import { Chrome } from "@/components/motifs/Chrome";
import { Editable } from "@/components/motifs/Editable";
import { Sunburst } from "@/components/motifs/Sunburst";

/**
 * Holding screen shown after Game 2 while the host enters the winner details
 * before revealing the Winners screen.
 */
export function WinnerEntry({ brand }: ScreenProps): React.ReactElement {
  return (
    <div
      className="screen grain vignette"
      style={{ padding: "70px 120px 104px" }}
    >
      <Sunburst
        size={1700}
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          opacity: 0.34,
        }}
      />
      <div
        className="col center-all fill"
        style={{ gap: 26, position: "relative", zIndex: 2 }}
      >
        <div className="kicker an-rise d1">Drum Roll, Please</div>
        <h1
          className="display display--gold an-rise d2"
          style={{
            fontSize: 150,
            lineHeight: 0.9,
            maxWidth: 1400,
            whiteSpace: "normal",
            overflowWrap: "anywhere",
          }}
        >
          And the winners are...
        </h1>
      </div>
      <Chrome
        left={<Editable field="venueName" placeholder={brand.name} />}
        right="Final Scores"
      />
    </div>
  );
}
