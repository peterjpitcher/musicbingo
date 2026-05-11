/**
 * BaronsHub public events API adapter.
 *
 * Maps BaronsHub PublicEvent responses to NormalisedEvent objects that match
 * the shape expected by consumers (pdf.ts, clipboardDocx.ts).
 */

import type { EventFeedAdapter, EventFeedConfig, NormalisedEvent } from "./types";

// ---------------------------------------------------------------------------
// BaronsHub response shape
// ---------------------------------------------------------------------------

type BaronsHubEvent = {
  id: string;
  slug: string;
  title: string;
  teaser: string | null;
  highlights: string[];
  eventType: string;
  status: string;
  startAt: string;
  endAt: string;
  description: string | null;
  bookingType: string | null;
  ticketPrice: number | null;
  bookingUrl: string | null;
  eventImageUrl: string | null;
  venue: {
    id: string;
    name: string;
    address: string | null;
    capacity: number | null;
  };
  updatedAt: string;
};

type BaronsHubResponse = {
  data: BaronsHubEvent[];
  meta: { nextCursor: string | null };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime12h(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/London",
  }).format(date);
}

function formatPrice(ticketPrice: number | null, bookingType: string | null): string {
  if (ticketPrice != null && ticketPrice > 0) {
    const formatted = Number.isInteger(ticketPrice)
      ? `£${ticketPrice}`
      : `£${ticketPrice.toFixed(2)}`;
    return `${formatted} per person`;
  }

  if (bookingType === "free_entry" || ticketPrice === 0) return "Free entry";

  // Null price without explicit free_entry booking type: unknown
  return "Free entry";
}

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function resolveEventUrl(
  bookingUrl: string | null,
  websiteUrl: string,
  slug: string,
): string | null {
  if (bookingUrl && isHttpsUrl(bookingUrl)) return bookingUrl;

  // Construct from websiteUrl + slug.
  if (websiteUrl && slug) {
    const base = websiteUrl.replace(/\/+$/, "");
    const cleanSlug = slug.replace(/^\/+|\/+$/g, "");
    if (cleanSlug) {
      const constructed = `${base}/events/${cleanSlug}`;
      if (isHttpsUrl(constructed)) return constructed;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Map a BaronsHub event to NormalisedEvent
// ---------------------------------------------------------------------------

function toNormalisedEvent(
  event: BaronsHubEvent,
  websiteUrl: string,
): NormalisedEvent | null {
  const name = event.title?.trim();
  if (!name) return null;

  const startDate = new Date(event.startAt);
  if (Number.isNaN(startDate.getTime())) return null;

  const dayOfWeek = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    timeZone: "Europe/London",
  }).format(startDate);

  const dayNumber = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    timeZone: "Europe/London",
  }).format(startDate);

  const monthShort = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "Europe/London",
  }).format(startDate);

  const dateFormatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  }).format(startDate);

  return {
    name,
    date: startDate,
    time: formatTime12h(startDate),
    dayOfWeek,
    dayNumber,
    monthShort,
    dateFormatted,
    price: formatPrice(event.ticketPrice, event.bookingType),
    description: event.description?.trim() ?? name,
    highlights: Array.isArray(event.highlights)
      ? event.highlights
          .map((h) => (typeof h === "string" ? h.trim() : ""))
          .filter((h) => h.length > 0)
      : [],
    eventUrl: resolveEventUrl(event.bookingUrl, websiteUrl, event.slug),
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createBaronsHubAdapter(config: EventFeedConfig): EventFeedAdapter {
  return {
    async fetchUpcomingEvents(opts) {
      const { afterDate, limit } = opts;

      // Convert afterDate (YYYY-MM-DD) to midnight London time ISO.
      // We use noon UTC as a safe approximation that avoids DST edge cases,
      // then format back to the date boundary in London timezone.
      const fromDate = new Date(`${afterDate}T00:00:00Z`);
      if (Number.isNaN(fromDate.getTime())) return [];
      const fromIso = fromDate.toISOString();

      const url = new URL("/api/v1/events", config.baseUrl);
      url.searchParams.set("from", fromIso);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("endsAfter", fromIso);
      if (config.venueId) {
        url.searchParams.set("venueId", config.venueId);
      }

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} from BaronsHub API${text ? `: ${text}` : ""}`);
      }

      const json = (await res.json()) as BaronsHubResponse;
      const events = json?.data ?? [];

      return events
        .map((e) => toNormalisedEvent(e, config.websiteUrl))
        .filter((d): d is NormalisedEvent => d !== null)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, limit);
    },
  };
}
