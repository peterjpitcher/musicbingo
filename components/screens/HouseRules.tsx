"use client";

import type { ScreenProps } from "@/components/screens/types";
import { Chrome } from "@/components/motifs/Chrome";
import { Editable } from "@/components/motifs/Editable";

/** Static default rules (placeholders). */
const RULES = [
  {
    n: "01",
    t: "Listen for the song",
    s: "We play a clip of each track. Know it? Find it on your card.",
    k: "hr1",
  },
  {
    n: "02",
    t: "Dab your matches",
    s: "Mark off every song you hear. One card per team, no sneaky extras.",
    k: "hr2",
  },
  {
    n: "03",
    t: "Shout to win",
    s: 'A full line or full house? Yell "BINGO!" loud and proud.',
    k: "hr3",
  },
  {
    n: "04",
    t: "Host has final say",
    s: "Nikki checks every claim. Her word is law — be nice about it!",
    k: "hr4",
  },
] as const;

/**
 * "House Rules" screen — four rules displayed in a 2×2 grid.
 * Each rule card is individually editable via its `hrNt` (title) and `hrNs`
 * (subtitle) field keys, matching the source placeholders exactly.
 */
export function HouseRules({ brand }: ScreenProps): JSX.Element {
  return (
    <div
      className="screen grain vignette"
      style={{ padding: "78px 120px 110px" }}
    >
      {/* Header */}
      <div className="col" style={{ alignItems: "center", gap: 12 }}>
        <div className="kicker an-rise d1">How It Works</div>
        <h1
          className="display display--gold an-rise d2"
          style={{ fontSize: 138 }}
        >
          House Rules
        </h1>
      </div>

      {/* 2-column grid of rule cards */}
      <div
        className="fill"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "30px 60px",
          alignContent: "center",
          marginTop: 26,
        }}
      >
        {RULES.map((r, i) => (
          <div
            key={r.k}
            className={`an-rise d${i + 2}`}
            style={{
              display: "flex",
              gap: 28,
              padding: "30px 34px",
              borderRadius: 20,
              background: "rgba(0,0,0,.26)",
              borderLeft: "6px solid var(--brand-accent)",
            }}
          >
            {/* Large rule number — outlined text */}
            <div
              style={{
                fontFamily: "var(--brand-display)",
                fontSize: 92,
                lineHeight: 0.8,
                color: "transparent",
                WebkitTextStroke: "2px var(--brand-accent-light)",
              }}
            >
              {r.n}
            </div>

            {/* Title + subtitle */}
            <div className="col" style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--brand-display)",
                  fontSize: 48,
                  lineHeight: 1,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                <Editable field={`${r.k}t`} placeholder={r.t} />
              </div>
              <div
                className="muted"
                style={{ fontSize: 25, marginTop: 10, lineHeight: 1.35 }}
              >
                <Editable field={`${r.k}s`} placeholder={r.s} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <Chrome
        left={<Editable field="venueName" placeholder={brand.name} />}
        right="Good Luck!"
      />
    </div>
  );
}
