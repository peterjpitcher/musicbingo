"use client";

import type { ScreenProps } from "@/components/screens/types";
import { Editable } from "@/components/motifs/Editable";
import { Vinyl } from "@/components/motifs/Vinyl";
import { Chrome } from "@/components/motifs/Chrome";

/**
 * Break / interval screen shown between the two games.
 * Ported faithfully from docs/design/after-hours/screens-b.jsx — BreakScreen.
 */
export function BreakScreen({ brand }: ScreenProps): JSX.Element {
  return (
    <div className="screen grain vignette center-all" style={{ padding: 80 }}>
      {/* Decorative spinning vinyl — positioned bottom-right, partially off-screen */}
      <Vinyl
        size={760}
        spin
        style={{ position: "absolute", right: -260, bottom: -240, opacity: 0.4 }}
      />

      <div className="col center-all" style={{ position: "relative", zIndex: 2, gap: 26 }}>
        <div className="pill an-rise d1">☕ &nbsp; Interval</div>

        <h1 className="display display--gold an-rise d2" style={{ fontSize: 230 }}>
          <Editable as="div" field="breakL1" placeholder="We're On" />
          <Editable as="div" field="breakL2" placeholder="A Break" />
        </h1>

        <p className="lede an-rise d3" style={{ maxWidth: 1000 }}>
          <Editable
            field="breakLede"
            placeholder="Grab a refill, stretch your legs and keep your cards safe."
          />
        </p>

        {/* Back-in countdown */}
        <div
          className="an-rise d4"
          style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 8 }}
        >
          <span
            style={{
              fontSize: 24,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "var(--brand-accent-light)",
              fontWeight: 700,
            }}
          >
            Back In
          </span>
          <span
            style={{
              fontFamily: "var(--brand-display)",
              fontSize: 110,
              color: "var(--cream)",
              lineHeight: 0.8,
            }}
          >
            <Editable field="breakMins" placeholder="10" />
          </span>
          <span
            style={{
              fontSize: 24,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "var(--brand-accent-light)",
              fontWeight: 700,
            }}
          >
            Minutes
          </span>
        </div>
      </div>

      <Chrome
        left="Interval"
        right={<Editable field="venueName" placeholder={brand.name} />}
      />
    </div>
  );
}
