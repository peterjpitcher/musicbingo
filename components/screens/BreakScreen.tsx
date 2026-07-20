"use client";

import { useEffect, useState } from "react";

import type { ScreenProps } from "@/components/screens/types";
import { Editable } from "@/components/motifs/Editable";
import { useEdit } from "@/components/motifs/EditContext";
import { Vinyl } from "@/components/motifs/Vinyl";
import { Chrome } from "@/components/motifs/Chrome";

const COUNTDOWN_LABEL_STYLE: React.CSSProperties = {
  fontSize: 24,
  letterSpacing: ".2em",
  textTransform: "uppercase",
  color: "var(--brand-accent-light)",
  fontWeight: 700,
};

const COUNTDOWN_VALUE_STYLE: React.CSSProperties = {
  fontFamily: "var(--brand-display)",
  fontSize: 110,
  color: "var(--cream)",
  lineHeight: 0.8,
};

/**
 * Break / interval screen shown between the two games.
 * Ported faithfully from docs/design/after-hours/screens-b.jsx (BreakScreen).
 *
 * The "Back In" figure is a live countdown when the runtime carries
 * breakStartedAtMs (set by the host's Show Break Screen action): it counts down
 * from the editable break minutes and switches to "any minute now" at zero.
 * While editing (host preview) it stays a static editable number.
 */
export function BreakScreen({ brand, runtime }: ScreenProps): JSX.Element {
  const { editing, get } = useEdit();
  const breakStartedAtMs = runtime?.breakStartedAtMs ?? null;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!breakStartedAtMs) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [breakStartedAtMs]);

  const minutesRaw = Number.parseInt(get("breakMins", "10"), 10);
  const breakMinutes = Number.isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : 10;
  const remainingMs =
    breakStartedAtMs != null
      ? Math.max(0, breakStartedAtMs + breakMinutes * 60_000 - nowMs)
      : null;
  const showCountdown = !editing && remainingMs != null;
  const countdownLabel =
    remainingMs != null
      ? `${Math.floor(remainingMs / 60_000)}:${String(
          Math.floor((remainingMs % 60_000) / 1_000)
        ).padStart(2, "0")}`
      : null;

  return (
    <div className="screen grain vignette center-all" style={{ padding: 80 }}>
      {/* Decorative spinning vinyl: positioned bottom-right, partially off-screen */}
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
          {showCountdown ? (
            remainingMs > 0 ? (
              <>
                <span style={COUNTDOWN_LABEL_STYLE}>Back In</span>
                <span style={COUNTDOWN_VALUE_STYLE}>{countdownLabel}</span>
              </>
            ) : (
              <span style={COUNTDOWN_VALUE_STYLE}>Back Any Minute Now</span>
            )
          ) : (
            <>
              <span style={COUNTDOWN_LABEL_STYLE}>Back In</span>
              <span style={COUNTDOWN_VALUE_STYLE}>
                <Editable field="breakMins" placeholder="10" />
              </span>
              <span style={COUNTDOWN_LABEL_STYLE}>Minutes</span>
            </>
          )}
        </div>
      </div>

      <Chrome
        left="Interval"
        right={<Editable field="venueName" placeholder={brand.name} />}
      />
    </div>
  );
}
