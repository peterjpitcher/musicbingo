"use client";

import React from "react";
import type { ScreenProps } from "@/components/screens/types";
import { Editable } from "@/components/motifs/Editable";
import { Chrome } from "@/components/motifs/Chrome";

/**
 * System screen — No Game Connected.
 * Displayed on the TV when the screen is not linked to any active live session.
 * Instructs the host to open the controller and start a session.
 */
export function SysNotFound({ brand }: ScreenProps): React.ReactElement {
  return (
    <div
      className="screen grain vignette center-all"
      style={{ padding: 80 }}
    >
      <div
        className="col center-all"
        style={{ position: "relative", zIndex: 2, gap: 24, maxWidth: 1200 }}
      >
        <div className="pill an-rise d1">📺 &nbsp; No Game Connected</div>
        <h1
          className="display display--gold an-rise d2"
          style={{ fontSize: 128 }}
        >
          <Editable as="div" field="nfL1" placeholder="Nothing" />
          <Editable as="div" field="nfL2" placeholder="On Yet" />
        </h1>
        <p className="lede an-rise d3" style={{ maxWidth: 980 }}>
          This screen isn&apos;t linked to a live game right now. On the host
          device, open the controller and start a session — it&apos;ll appear
          here automatically.
        </p>
        <div
          className="an-rise d4"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 6,
            padding: "16px 28px",
            borderRadius: 14,
            background: "rgba(0,0,0,.3)",
            border: "2px dashed color-mix(in srgb, var(--anchor-gold-bright) 55%, transparent)",
          }}
        >
          <span
            style={{
              fontSize: 32,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "var(--anchor-gold-bright)",
              fontWeight: 700,
            }}
          >
            Host
          </span>
          <span style={{ fontSize: 32, color: "var(--anchor-cream-text)" }}>
            Open the controller &amp; press{" "}
            <b style={{ color: "var(--anchor-gold-bright)" }}>Start Game</b>
          </span>
        </div>
      </div>
      <Chrome
        left={<Editable field="venueName" placeholder={brand.name} />}
        right="Standing By"
      />
    </div>
  );
}
