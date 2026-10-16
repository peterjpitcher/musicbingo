"use client";

import type { ScreenProps } from "@/components/screens/types";
import { Ball } from "@/components/motifs/Ball";
import { Chrome } from "@/components/motifs/Chrome";
import { Editable } from "@/components/motifs/Editable";

/**
 * Running-order rows, top level only: guests just need to know what is coming,
 * so each row is a title with no detail line.
 *
 * The content keys are deliberately out of display order: rows added after the
 * rest of the show (half-time standings `ro7`, the interactive game `ro8`) took
 * the next free key rather than renumbering, so wording a host had already
 * customised for Quiz Two, Game 2 and Prizes stays attached to its row.
 */
const RUN_ORDER = [
  { n: "01", t: "Quiz · Round One", k: "ro1" },
  { n: "02", t: "Music Bingo · Game 1", k: "ro2" },
  { n: "03", t: "The Interval", k: "ro3" },
  { n: "04", t: "Half-Time Standings", k: "ro7" },
  { n: "05", t: "Interactive Game", k: "ro8" },
  { n: "06", t: "Quiz · Round Two", k: "ro4" },
  { n: "07", t: "Music Bingo · Game 2", k: "ro5" },
  { n: "08", t: "Prizes & Winners", k: "ro6" },
] as const;

/**
 * "Tonight's Running Order" screen.
 * Rows share the space under the heading evenly (capped at a comfortable
 * height), so adding a row shrinks them instead of pushing the last ones off
 * the bottom of the TV, which is what happened with seven rows on
 * 16 October 2026. Items stagger-animate in from the left using
 * `an-slideL d1…d6`; rows past the sixth reuse the last delay.
 */
export function RunningOrder({ brand }: ScreenProps): JSX.Element {
  return (
    <div
      className="screen grain vignette"
      style={{ padding: "68px 120px 82px" }}
    >
      {/* Header */}
      <div className="col" style={{ alignItems: "center", gap: 12 }}>
        <div className="kicker an-rise d1">Here&apos;s The Plan</div>
        <h1
          className="display display--gold an-rise d2"
          style={{ fontSize: 104, marginTop: 4 }}
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
          justifyContent: "center",
          gap: 12,
          marginTop: 24,
        }}
      >
        {RUN_ORDER.map((r, i) => (
          <div
            key={r.k}
            className={`an-slideL d${Math.min(i + 1, 6)}`}
            style={{
              flex: "1 1 0",
              minHeight: 0,
              maxHeight: 112,
              display: "flex",
              alignItems: "center",
              gap: 24,
              padding: "0 26px",
              borderRadius: 18,
              background: "rgba(0,0,0,.26)",
              border: "1px solid rgb(var(--brand-accent-rgb) / .4)",
            }}
          >
            <Ball n={r.n} size={62} />
            <div
              style={{
                fontFamily: "var(--brand-display)",
                fontSize: 46,
                lineHeight: 1,
                textTransform: "uppercase",
                color: "var(--cream)",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              <Editable field={`${r.k}t`} placeholder={r.t} />
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
