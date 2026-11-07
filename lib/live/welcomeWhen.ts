import { formatEventTime, getLondonIsoDate } from "@anchor-nights/kit/dates";
import type { ScreenFeed } from "@anchor-nights/kit/events/shared";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A bare London date as the TV says it: "Tonight", else "Friday 20 November". */
function sayDate(dateIso: string, todayIso: string): string {
  if (dateIso === todayIso) return "Tonight";
  const [year, month, day] = dateIso.split("-").map(Number);
  // A calendar date at UTC midnight, so getUTCDay is its weekday.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]}`;
}

/**
 * The welcome screen's "when" line (spec M-7: the TV never shows invented
 * content). Built only from real data, by London calendar date:
 *
 * - The game's date is the session's event date (`eventDateInput`). With no
 *   valid date it is today's in London, since the TV is running the game now.
 * - The start time comes from the events feed: the Music Bingo night on that
 *   date. With none (no key, feed down, the night already started and dropped
 *   from the feed) there is no time at all.
 * - With a time: "Tonight · 8pm". With a session date but no time: "Tonight"
 *   or "Friday 20 November". With neither: an empty string, and the screen
 *   shows nothing.
 *
 * Until 7 November 2026 the screen showed the design sample "Friday · 8:00 PM"
 * whenever the host had not typed a date.
 */
export function welcomeWhen(options: {
  eventDateInput: string | null | undefined;
  feed: ScreenFeed | null;
  nowMs: number;
}): string {
  const { feed, nowMs } = options;
  const typed = options.eventDateInput?.trim() ?? "";
  const sessionDate = ISO_DATE.test(typed) ? typed : null;
  const todayIso = getLondonIsoDate(nowMs);
  const gameDate = sessionDate ?? todayIso;

  const night =
    feed?.status === "ok"
      ? feed.nights.find((event) => {
          if (!event.startsAt) return false;
          const starts = Date.parse(event.startsAt);
          return Number.isFinite(starts) && getLondonIsoDate(starts) === gameDate;
        }) ?? null
      : null;
  const time = night ? formatEventTime(night.startsAt) : "";

  if (time) return `${sayDate(gameDate, todayIso)} · ${time}`;
  return sessionDate ? sayDate(sessionDate, todayIso) : "";
}
