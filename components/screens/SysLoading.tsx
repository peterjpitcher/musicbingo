"use client";

import React from "react";
import type { ScreenProps } from "@/components/screens/types";
import { Sunburst } from "@/components/motifs/Sunburst";
import { Vinyl } from "@/components/motifs/Vinyl";
import { Editable } from "@/components/motifs/Editable";
import { Chrome } from "@/components/motifs/Chrome";

/**
 * System screen — Loading.
 * Shown whilst the guest view is connecting to a live session.
 * Displays a spinning vinyl record and a pulsing "Loading…" headline.
 */
export function SysLoading({ brand }: ScreenProps): React.ReactElement {
  return (
    <div
      className="screen grain vignette center-all"
      style={{ padding: 80 }}
    >
      <Sunburst
        size={1500}
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          opacity: 0.3,
        }}
      />
      <div
        className="col center-all"
        style={{ position: "relative", zIndex: 2, gap: 30 }}
      >
        <div style={{ position: "relative" }}>
          <Vinyl size={220} />
        </div>
        <div className="kicker an-rise d1" style={{ marginTop: 10 }}>
          One Moment
        </div>
        <h1
          className="display display--gold an-rise d2"
          style={{ fontSize: 150 }}
        >
          Loading…
        </h1>
        <p className="lede an-rise d3">
          Connecting to tonight&apos;s game.
        </p>
      </div>
      <Chrome
        left={<Editable field="venueName" placeholder={brand.name} />}
        right="Please Wait"
      />
    </div>
  );
}
