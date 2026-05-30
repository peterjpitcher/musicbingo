"use client";

import type { ScreenProps } from "@/components/screens/types";
import { Sunburst } from "@/components/motifs/Sunburst";
import { Ball } from "@/components/motifs/Ball";
import { Chrome } from "@/components/motifs/Chrome";
import { Editable } from "@/components/motifs/Editable";

export type QuizSwitchProps = ScreenProps & {
  /**
   * Which quiz round this screen is for.
   * Drives the field-name prefix (`q1` / `q2`) and the Ball number displayed.
   * Defaults to `"One"`.
   */
  round?: "One" | "Two";
};

/**
 * "Switch out to mobile music quiz" screen (used twice: rounds 1 and 2).
 * The `round` prop mirrors the source's `screenKey` parameter: `"One"` → `q1`,
 * `"Two"` → `q2`.
 */
export function QuizSwitch({ brand, round = "One" }: QuizSwitchProps): JSX.Element {
  /* Derive the field-name prefix exactly as the source did with its `screenKey` arg. */
  const screenKey = round === "One" ? "q1" : "q2";

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
          opacity: 0.35,
        }}
      />

      <div
        className="col center-all"
        style={{ position: "relative", zIndex: 2, gap: 30 }}
      >
        <div className="pill an-rise d1">📱 &nbsp; Phones Out</div>

        <h1
          className="display display--gold an-rise d2"
          style={{ fontSize: 210 }}
        >
          <Editable as="div" field={`${screenKey}_l1`} placeholder="Music Quiz" />
        </h1>

        <div
          className="an-pop d3"
          style={{ display: "flex", alignItems: "center", gap: 26 }}
        >
          <span
            style={{
              fontFamily: "var(--brand-display)",
              fontSize: 64,
              color: "var(--brand-accent-light)",
            }}
          >
            ROUND
          </span>
          <Ball n={round === "One" ? "1" : "2"} size={130} />
        </div>

        <p className="lede an-rise d4" style={{ maxWidth: 1100 }}>
          <Editable
            field={`${screenKey}_lede`}
            placeholder="Open the KaraFun app on your phone and get ready — we'll switch the big screen over to the quiz now."
          />
        </p>
      </div>

      <Chrome
        left={`Quiz · Round ${round}`}
        right={<Editable field="venueName" placeholder={brand.name} />}
      />
    </div>
  );
}
