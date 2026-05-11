/**
 * Anchor Management API adapter.
 *
 * Extracts and adapts the event-fetching + normalisation logic originally in
 * lib/managementApi.ts into the EventFeedAdapter interface.
 */

import type { EventFeedAdapter, EventFeedConfig, NormalisedEvent } from "./types";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type ManagementApiEvent = {
  id?: unknown;
  slug?: unknown;
  eventUrl?: unknown;
  event_url?: unknown;
  bookingUrl?: unknown;
  booking_url?: unknown;
  name?: unknown;
  startDate?: unknown;
  start_date?: unknown;
  endDate?: unknown;
  end_date?: unknown;
  offers?: unknown;
  url?: unknown;
  qrUrl?: unknown;
  qr_url?: unknown;
  qrCodeUrl?: unknown;
  qr_code_url?: unknown;
  publicUrl?: unknown;
  public_url?: unknown;
  title?: unknown;
  event_name?: unknown;
  event_status?: unknown;
  description?: unknown;
  short_description?: unknown;
  long_description?: unknown;
};

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

type ApiEventsResponse = {
  events: ManagementApiEvent[];
  meta?: { has_more?: boolean };
};

// ---------------------------------------------------------------------------
// Helpers (ported from managementApi.ts)
// ---------------------------------------------------------------------------

function getString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function resolveHttpUrl(value: string, baseUrl: string): string | null {
  let cleaned = value.trim();
  if (!cleaned) return null;

  // Strip trailing punctuation that commonly sneaks in from copy/paste.
  while (/[)\].,!?;:]+$/.test(cleaned)) cleaned = cleaned.slice(0, -1);

  if (cleaned.startsWith("//")) {
    return resolveHttpUrl(`https:${cleaned}`, baseUrl);
  }

  if (
    /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|$)/i.test(cleaned) &&
    !/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)
  ) {
    return resolveHttpUrl(`https://${cleaned}`, baseUrl);
  }

  try {
    const url = new URL(cleaned, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function getEventStart(event: ManagementApiEvent): Date | null {
  const start = getString(event.startDate) ?? getString(event.start_date);
  if (!start) return null;
  const d = new Date(start);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getEventName(event: ManagementApiEvent): string | null {
  return getString(event.name) ?? getString(event.title) ?? getString(event.event_name);
}

function getCanonicalEventUrlBySlug(
  event: ManagementApiEvent,
  websiteUrl: string,
): string | null {
  const slugRaw = getString(event.slug);
  if (!slugRaw) return null;
  const slug = slugRaw.replace(/^\/+|\/+$/g, "");
  if (!slug) return null;
  return resolveHttpUrl(`/events/${slug}`, websiteUrl);
}

function getEventUrl(
  event: ManagementApiEvent,
  baseUrl: string,
  websiteUrl: string,
): string | null {
  const candidates = [
    getString(event.eventUrl),
    getString(event.event_url),
    getString(event.publicUrl),
    getString(event.public_url),
    getCanonicalEventUrlBySlug(event, websiteUrl),
    getString(event.url),
    getString(event.qrUrl),
    getString(event.qr_url),
    getString(event.qrCodeUrl),
    getString(event.qr_code_url),
  ].filter((v): v is string => !!v);

  for (const url of candidates) {
    const resolved = resolveHttpUrl(url, baseUrl);
    if (resolved) return resolved;
  }

  const offers = event.offers as unknown;
  if (Array.isArray(offers)) {
    for (const offer of offers) {
      if (!offer || typeof offer !== "object") continue;
      const offerUrl =
        getString((offer as Record<string, unknown>).url) ??
        getString((offer as Record<string, unknown>).bookingUrl) ??
        getString((offer as Record<string, unknown>).booking_url);
      if (!offerUrl) continue;
      const resolved = resolveHttpUrl(offerUrl, baseUrl);
      if (resolved) return resolved;
    }
  } else if (offers && typeof offers === "object") {
    const offerUrl =
      getString((offers as Record<string, unknown>).url) ??
      getString((offers as Record<string, unknown>).bookingUrl) ??
      getString((offers as Record<string, unknown>).booking_url);
    if (offerUrl) {
      const resolved = resolveHttpUrl(offerUrl, baseUrl);
      if (resolved) return resolved;
    }
  }

  const bookingCandidates = [
    getString(event.bookingUrl),
    getString(event.booking_url),
  ].filter((v): v is string => !!v);
  for (const url of bookingCandidates) {
    const resolved = resolveHttpUrl(url, baseUrl);
    if (resolved) return resolved;
  }

  return null;
}

function formatTime12h(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/London",
  }).format(date);
}

function formatEventPrice(event: ManagementApiEvent): string {
  const ev = event as Record<string, unknown>;
  if (ev.is_free === true || ev.isFree === true) return "Free entry";

  const price = ev.price;
  if (typeof price === "number" && price > 0) {
    const formatted = Number.isInteger(price) ? `£${price}` : `£${price.toFixed(2)}`;
    return `${formatted} per person`;
  }

  return "Free entry";
}

function getEventDescription(event: ManagementApiEvent): string {
  const ev = event as Record<string, unknown>;

  const desc = getString(ev.description);
  if (desc) return desc;

  const short = getString(ev.short_description);
  if (short) return short;

  const long = getString(ev.long_description);
  if (long) {
    const stripped = (long as string).replace(/<[^>]*>/g, "").trim();
    if (stripped.length > 200) return stripped.slice(0, 200) + "...";
    return stripped;
  }

  return getEventName(event) ?? "Upcoming event";
}

function getEventHighlights(event: ManagementApiEvent): string[] {
  const raw = (event as Record<string, unknown>).highlights;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h: unknown) => (typeof h === "string" ? h.trim() : ""))
    .filter((h: string) => h.length > 0);
}

function isoDateInLondon(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : null;
}

// ---------------------------------------------------------------------------
// Normalise a raw API event into a NormalisedEvent
// ---------------------------------------------------------------------------

function toNormalisedEvent(
  event: ManagementApiEvent,
  baseUrl: string,
  websiteUrl: string,
): NormalisedEvent | null {
  const name = getEventName(event);
  if (!name) return null;

  const start = getEventStart(event);
  if (!start) return null;

  const dayOfWeek = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    timeZone: "Europe/London",
  }).format(start);

  const dayNumber = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    timeZone: "Europe/London",
  }).format(start);

  const monthShort = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "Europe/London",
  }).format(start);

  const dateFormatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  }).format(start);

  return {
    name,
    date: start,
    time: formatTime12h(start),
    dayOfWeek,
    dayNumber,
    monthShort,
    dateFormatted,
    price: formatEventPrice(event),
    description: getEventDescription(event),
    highlights: getEventHighlights(event),
    eventUrl: getEventUrl(event, baseUrl, websiteUrl),
  };
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function fetchEventsFromApi(params: {
  baseUrl: string;
  apiKey: string;
  fromDate: string;
  toDate?: string;
  availableOnly?: boolean;
  limit?: number;
  offset?: number;
  status?: string;
}): Promise<ApiEventsResponse> {
  const url = new URL("/api/events", params.baseUrl);
  url.searchParams.set("from_date", params.fromDate);
  if (params.toDate) url.searchParams.set("to_date", params.toDate);
  if (params.availableOnly) url.searchParams.set("available_only", "true");
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  if (params.offset) url.searchParams.set("offset", String(params.offset));
  if (params.status) url.searchParams.set("status", params.status);

  const apiKeyValue = params.apiKey.replace(/^Bearer\s+/i, "").trim();
  const authHeader = `Bearer ${apiKeyValue}`;

  const res = await fetch(url.toString(), {
    headers: {
      "X-API-Key": apiKeyValue,
      Authorization: authHeader,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} from management API${text ? `: ${text}` : ""}`);
  }

  const json = (await res.json()) as Record<string, unknown>;

  if (!json || typeof json !== "object") {
    throw new Error("Unexpected management API response");
  }

  // Support both enveloped and direct response shapes.
  if (Array.isArray(json.events)) {
    return {
      events: json.events as ManagementApiEvent[],
      meta: json.meta as ApiEventsResponse["meta"],
    };
  }

  const data = json.data;
  if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).events)) {
    return {
      events: (data as Record<string, unknown>).events as ManagementApiEvent[],
      meta: (data as Record<string, unknown>).meta as ApiEventsResponse["meta"],
    };
  }

  const envelope = json as unknown as ApiEnvelope<ApiEventsResponse>;
  if (envelope.success !== true) {
    const msg = envelope.error?.message ? String(envelope.error.message) : "Management API error";
    throw new Error(msg);
  }

  return envelope.data ?? { events: [] };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createAnchorAdapter(config: EventFeedConfig): EventFeedAdapter {
  return {
    async fetchUpcomingEvents(opts) {
      const { afterDate, limit, sessionDate } = opts;
      const effectiveDate = sessionDate ?? afterDate;

      // Calculate day-after date to exclude the current session event.
      const currentDate = new Date(`${effectiveDate}T12:00:00Z`);
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      const dayAfterIso = isoDateInLondon(currentDate);
      if (!dayAfterIso) return [];

      const response = await fetchEventsFromApi({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        fromDate: dayAfterIso,
        availableOnly: true,
        status: "scheduled",
        limit: Math.max(limit, 20),
      });

      let details = (response.events ?? [])
        .map((e) => toNormalisedEvent(e, config.baseUrl, config.websiteUrl))
        .filter((d): d is NormalisedEvent => d !== null)
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      // If no events found with day-after, retry with same-day fromDate.
      if (details.length === 0) {
        const sameDayResponse = await fetchEventsFromApi({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          fromDate: effectiveDate,
          availableOnly: true,
          status: "scheduled",
          limit: Math.max(limit, 20),
        });

        details = (sameDayResponse.events ?? [])
          .map((e) => toNormalisedEvent(e, config.baseUrl, config.websiteUrl))
          .filter((d): d is NormalisedEvent => d !== null)
          .sort((a, b) => a.date.getTime() - b.date.getTime());
      }

      return details.slice(0, limit);
    },
  };
}
