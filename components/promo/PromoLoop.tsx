"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { PromoSlide, SlideLoop, SlidePreload, type PromoSlideData } from "@anchor-nights/kit/promo";

import { VenueLogo } from "@/components/motifs/VenueLogo";
import type { BrandConfig } from "@/lib/brands/types";
import { buildPromoPlaylist, type PromoLead, type PromoMode } from "@/lib/promo/promoMode";
import { usePromo } from "@/components/promo/PromoProvider";

/** How often the loop's clock moves: enough for "Tonight" and for dropping an event once it starts. */
const CLOCK_MS = 30_000;

/** The heading on the next-night slide. */
export const NEXT_NIGHT_LABEL = "Next Music Bingo";

/** Wording on the thank-you slide (the kit's layout; nothing here is typed by the host). */
export const THANK_YOU_TEXT = { kicker: "Music Bingo at The Anchor", headline: "Thanks for playing" } as const;

export function usePromoClock(intervalMs: number = CLOCK_MS): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return nowMs;
}

/**
 * One kit slide on Music Bingo's TV: the night register background every
 * screen uses, the venue logo, and the slide centred below it. Drawn inside
 * the kit Stage: since kit 2.0.1 the slides size themselves from the Stage's
 * --anchor-vh, so they are canvas pixels here like every other screen.
 */
export function PromoSlideOnStage({
  slide,
  nowMs,
  brand,
}: {
  slide: PromoSlideData;
  nowMs: number;
  brand: BrandConfig;
}): React.JSX.Element {
  return (
    <div className="screen grain vignette" data-promo-slide={slide.kind} style={{ padding: "52px 110px 96px", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "center", position: "relative", zIndex: 2 }}>
        <VenueLogo brand={brand} size="sm" />
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          zIndex: 2,
        }}
      >
        <PromoSlide slide={slide} nowMs={nowMs} nextNightLabel={NEXT_NIGHT_LABEL} thankYou={THANK_YOU_TEXT} />
      </div>
      <SlidePreload slide={slide} nowMs={nowMs} />
    </div>
  );
}

export interface PromoLoopProps {
  mode: PromoMode;
  brand: BrandConfig;
  /** The London date of tonight's game at the loop's clock (lib/promo/promoMode.ts sessionDateFor). */
  sessionDate: (nowMs: number) => string;
  /** Draws Music Bingo's own lead screen (welcome or break). */
  renderLead?: (lead: PromoLead) => ReactNode;
}

/**
 * The TV's idle, break and end-of-night loops (spec M-7, S7.4 and S7.5), from
 * the kit. The feed and the review link come from PromoProvider. With no
 * feed the kit shows only the lead and "See what's on": nothing invented.
 */
export function PromoLoop({ mode, brand, sessionDate, renderLead }: PromoLoopProps): React.JSX.Element {
  const { feed, reviewUrl } = usePromo();
  const nowMs = usePromoClock();
  const date = sessionDate(nowMs);
  const slides = useMemo(
    () => buildPromoPlaylist({ mode, feed, nowMs, reviewUrl, sessionDate: date }),
    [mode, feed, nowMs, reviewUrl, date],
  );

  const renderSlide = useCallback(
    (slide: PromoSlideData): ReactNode => {
      if (slide.kind === "app") return renderLead?.(slide.id as PromoLead) ?? null;
      return <PromoSlideOnStage slide={slide} nowMs={nowMs} brand={brand} />;
    },
    [nowMs, renderLead, brand],
  );

  return <SlideLoop slides={slides} renderSlide={renderSlide} />;
}
