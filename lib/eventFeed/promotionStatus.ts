import type { EventFeedResult } from "./index";

// One featured event and three upcoming events fit on the cards' promotion page.
const PROMOTIONAL_EVENT_SLOTS = 4;

export function promotionHeaders(result: EventFeedResult): Record<string, string> {
  const displayed = result.events.slice(0, PROMOTIONAL_EVENT_SLOTS);
  return {
    "x-music-bingo-qr-status": result.status,
    "x-music-bingo-events-requested": String(PROMOTIONAL_EVENT_SLOTS),
    "x-music-bingo-events-count": String(displayed.length),
    "x-music-bingo-events-with-url": String(displayed.filter((event) => event.eventUrl).length),
  };
}

export function promotionNotice(headers: Headers): string {
  const status = headers.get("x-music-bingo-qr-status");
  if (status === "disabled") return "";
  if (status === "missing_config") return "Upcoming events: the event feed is not configured. The pack was created without event promotions.";
  if (status === "error") return "Upcoming events could not be loaded. The pack was created without event promotions. Try generating it again.";
  if (status === "no_events") return "No upcoming events were found for this date. The pack was created without event promotions.";
  if (status !== "ok") return "Upcoming event information could not be checked. Review the pack before printing.";

  const requested = Number(headers.get("x-music-bingo-events-requested"));
  const count = Number(headers.get("x-music-bingo-events-count"));
  const withUrl = Number(headers.get("x-music-bingo-events-with-url"));
  if (withUrl < count) return `Upcoming events: only ${withUrl}/${count} event links were available. Review the pack before printing.`;
  if (count < requested) return `Upcoming events: only ${count}/${requested} promotional slots could be filled.`;
  return "";
}
