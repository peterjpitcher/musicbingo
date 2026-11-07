import { getLondonIsoDate } from "@anchor-nights/kit/dates";
import type { ScreenChannel, ScreenFeed } from "@anchor-nights/kit/events/shared";
import { buildIdlePlaylist, buildThankYouPlaylist, type PromoSlideData } from "@anchor-nights/kit/promo";

import type { ScreenId } from "@/lib/live/runOfShow";

/** Music Bingo's own screen at the head of an idle loop. */
export type PromoLead = "welcome" | "break";

/**
 * What the TV shows instead of a single run-of-show screen, or null for the
 * screen itself (spec M-7, S7.4 and S7.5).
 *
 * - `idle`: the kit's loop of the next Music Bingo, upcoming events in pairs
 *   and the what's-on slide, led by Music Bingo's own screen where there is
 *   one.
 * - `thank_you`: "Review us" and "What's on next", then the next two
 *   upcoming events in turn.
 */
export type PromoMode =
  | { kind: "idle"; lead: PromoLead | null; channel: ScreenChannel }
  | { kind: "thank_you"; hideReview: boolean; hideNext: boolean };

/** The host's switches for tonight (spec S7.6): hide a card, never type one. */
export interface PromoHides {
  hideReview: boolean;
  hideNext: boolean;
}

/**
 * Where the TV has a holding state, it loops the events instead:
 *
 * - `welcome` (before the show, and an idle runtime): the welcome screen
 *   leads the loop; event QR codes use the pre-event short links.
 * - `break` (the interval): the break screen and its countdown lead, with
 *   the in-game short links.
 * - `thanks` (the end of the night): the kit's thank-you loop, with the
 *   host's switches.
 *
 * Never a game, a claim, the standings or the winners. A paired TV with no
 * game tonight shows the loop on its own (components/display/TvIdleLoop.tsx).
 */
export function resolvePromoMode(screenId: ScreenId, hides: PromoHides): PromoMode | null {
  switch (screenId) {
    case "welcome":
      return { kind: "idle", lead: "welcome", channel: "pre_event_screen" };
    case "break":
      return { kind: "idle", lead: "break", channel: "in_game_screen" };
    case "thanks":
      return { kind: "thank_you", hideReview: hides.hideReview, hideNext: hides.hideNext };
    default:
      return null;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The London date of tonight's game, so "Next Music Bingo" is never tonight's
 * own night: the game's own date when it has one, else today in London.
 */
export function sessionDateFor(eventDateInput: string | null | undefined, nowMs: number): string {
  const typed = eventDateInput?.trim() ?? "";
  return ISO_DATE.test(typed) ? typed : getLondonIsoDate(nowMs);
}

/**
 * The slides for a promo mode at `nowMs` (the kit's builders). With no feed,
 * an error or no key, the kit falls back to the lead and the what's-on slide
 * (idle) or "See what's on" (end of night): never an error on the TV and
 * never a typed or placeholder date.
 */
export function buildPromoPlaylist(options: {
  mode: PromoMode;
  feed: ScreenFeed | null;
  nowMs: number;
  reviewUrl: string | null;
  sessionDate: string;
}): PromoSlideData[] {
  const { mode, feed, nowMs, reviewUrl, sessionDate } = options;
  if (mode.kind === "thank_you") {
    return buildThankYouPlaylist({
      feed,
      nowMs,
      sessionDate,
      reviewUrl,
      hideReview: mode.hideReview,
      hideNext: mode.hideNext,
    });
  }
  return buildIdlePlaylist({
    feed,
    nowMs,
    sessionDate,
    channel: mode.channel,
    lead: mode.lead ? { id: mode.lead } : null,
  });
}

/** The content keys that carry the host's switches ("1" hides the card for tonight). */
export const HIDE_REVIEW_KEY = "tyHideReview";
export const HIDE_NEXT_KEY = "tyHideNext";

/** Reads the host's switches from the content map's getter. */
export function readPromoHides(get: (key: string) => string): PromoHides {
  return { hideReview: get(HIDE_REVIEW_KEY) === "1", hideNext: get(HIDE_NEXT_KEY) === "1" };
}
