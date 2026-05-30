"use client";

import type { ScreenProps } from "@/components/screens/types";
import { Ball } from "@/components/motifs/Ball";
import { Chrome } from "@/components/motifs/Chrome";
import { Editable } from "@/components/motifs/Editable";

/** Static default running-order entries (placeholders). */
const RUN_ORDER = [
  { n: "01", t: "Quiz · Round One",  s: "Grab your phones — KaraFun mobile quiz", k: "ro1" },
  { n: "02", t: "Bingo · Game 1",    s: "Warm up, then 50 songs to dab",          k: "ro2" },
  { n: "03", t: "The Interval",       s: "Refill at the bar — back in 10",         k: "ro3" },
  { n: "04", t: "Quiz · Round Two",  s: "Round two of the mobile quiz",            k: "ro4" },
  { n: "05", t: "Bingo · Game 2",    s: "Sing-along warm up, then Game 2",         k: "ro5" },
  { n: "06", t: "Prizes & Winners",  s: "Top table & wooden-spoon prizes",         k: "ro6" },
] as const;

/**
 * "Tonight's Running Order" screen.
 * Six items stagger-animate in from the left using `an-slideL d1…d6` classes.
 */
export function RunningOrder({ brand }: ScreenProps): JSX.Element {
  return (
    <div
      className="screen grain vignette"
      style={{ padding: "82px 120px 110px" }}
    >
      {/* Header */}
      <div className="col" style={{ alignItems: "center", gap: 14 }}>
        <div className="kicker an-rise d1">Here&apos;s The Plan</div>
        <h1
          className="display display--gold an-rise d2"
          style={{ fontSize: 120, marginTop: 4 }}
        >
          Tonight&apos;s Running Order
        </h1>
      </div>

      {/* Item list */}
      <div
        className="fill"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          marginTop: 30,
        }}
      >
        {RUN_ORDER.map((r, i) => (
          <div
            key={r.k}
            className={`an-slideL d${Math.min(i + 1, 6)}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 30,
              padding: "24px 30px",
              borderRadius: 18,
              background: "rgba(0,0,0,.26)",
              border: "1px solid rgb(var(--brand-accent-rgb) / .4)",
            }}
          >
            <Ball n={r.n} size={88} />
            <div className="col" style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--brand-display)",
                  fontSize: 44,
                  lineHeight: 1,
                  textTransform: "uppercase",
                  color: "var(--cream)",
                  whiteSpace: "nowrap",
                }}
              >
                <Editable field={`${r.k}t`} placeholder={r.t} />
              </div>
              <div className="muted" style={{ fontSize: 23, marginTop: 8 }}>
                <Editable field={`${r.k}s`} placeholder={r.s} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <Chrome
        left={<><Editable field="venueName" placeholder={brand.name} /></>}
        right="Let's Play"
      />
    </div>
  );
}
