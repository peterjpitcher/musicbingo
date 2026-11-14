"use client";

import React from "react";
import { buildThankYouPlaylist } from "@anchor-nights/kit/promo";
import { getLondonIsoDate } from "@anchor-nights/kit/dates";

import type { ScreenProps } from "@/components/screens/types";
import { useEdit } from "@/components/motifs/EditContext";
import { PromoSlideOnStage, usePromoClock } from "@/components/promo/PromoLoop";
import { usePromo } from "@/components/promo/PromoProvider";
import { readPromoHides } from "@/lib/promo/promoMode";

/**
 * Screen 13: Thank You (spec M-7, S7.5), the kit's promo ThankYou.
 *
 * "Review us" is Music Bingo's review short link (to the neutral feedback
 * page, never Google, no rating asked for); "What's on next" is the next
 * Music Bingo from the management app's events feed, with its name, its
 * London date and its booking QR. With nothing from the feed it shows "See
 * what's on" instead. Nothing on it is typed by the host: the host can only
 * hide a card for tonight (the switches in the console's Live Content panel).
 *
 * On the TV the whole end-of-night loop (this slide, then the next two
 * events) is drawn by LiveDisplay through PromoLoop; this component is the
 * thank-you slide on its own, for the host console's preview.
 */
export function ThankYou(_props: ScreenProps): React.ReactElement {
  const { get } = useEdit();
  const { feed, reviewUrl } = usePromo();
  const nowMs = usePromoClock();
  const hides = readPromoHides((key) => get(key, ""));
  const [slide] = buildThankYouPlaylist({
    feed,
    nowMs,
    sessionDate: getLondonIsoDate(nowMs),
    reviewUrl,
    hideReview: hides.hideReview,
    hideNext: hides.hideNext,
  });
  return <PromoSlideOnStage slide={slide} nowMs={nowMs} />;
}
