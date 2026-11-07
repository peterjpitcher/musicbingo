"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getLondonIsoDate } from "@anchor-nights/kit/dates";
import { Stage, useWakeLock } from "@anchor-nights/kit/tv";

import { PromoLoop } from "@/components/promo/PromoLoop";
import { DEFAULT_BRAND_CONFIG } from "@/lib/brands/defaultBrand";
import type { PromoMode } from "@/lib/promo/promoMode";

/** With no game tonight, the loop on its own, with the post-event short links (the kit's idle choice). */
const IDLE_MODE: PromoMode = { kind: "idle", lead: null, channel: "post_event_screen" };

export interface TvIdleLoopProps {
  /** How often /tv looks again for tonight's game, without restarting the loop. */
  recheckMs: number;
}

/**
 * A paired TV with no game tonight (spec M-7, S7.4): the management app's
 * upcoming events, the next Music Bingo and the what's-on slide, round and
 * round. With no feed it shows only "What's on at The Anchor": nothing
 * invented. Every `recheckMs` it asks the server again (router.refresh, so
 * the loop keeps its place), and tonight's game replaces it once it is set up.
 */
export function TvIdleLoop({ recheckMs }: TvIdleLoopProps): React.JSX.Element {
  useWakeLock();
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), recheckMs);
    return () => window.clearInterval(timer);
  }, [router, recheckMs]);
  const sessionDate = useCallback((nowMs: number) => getLondonIsoDate(nowMs), []);

  return (
    <Stage>
      <div className="screen-wrap in">
        <PromoLoop mode={IDLE_MODE} brand={DEFAULT_BRAND_CONFIG} sessionDate={sessionDate} />
      </div>
    </Stage>
  );
}
