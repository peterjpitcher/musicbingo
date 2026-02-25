type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

type ApiEventsResponse = {
  events: ManagementApiEvent[];
  meta?: { has_more?: boolean };
};

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
};

function envString(name: string): string | null {
  const raw = process.env[name];
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function normalizeHttpOrigin(urlish: string): string | null {
  const trimmed = urlish.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

function getManagementApiConfig(): { baseUrl: string; apiKey: string; publicEventsBaseUrl: string } | null {
  const baseUrlRaw = envString("MANAGEMENT_API_BASE_URL");
  const apiKey = envString("MANAGEMENT_API_TOKEN");
  if (!baseUrlRaw || !apiKey) return null;
  const baseUrl = normalizeHttpOrigin(baseUrlRaw);
  if (!baseUrl) return null;
  const publicEventsBaseUrl =
    normalizeHttpOrigin(
      envString("MANAGEMENT_PUBLIC_EVENTS_BASE_URL") ??
        envString("MANAGEMENT_PUBLIC_SITE_URL") ??
        envString("NEXT_PUBLIC_SITE_URL") ??
        "https://www.the-anchor.pub"
    ) ?? "https://www.the-anchor.pub";
  return { baseUrl, apiKey, publicEventsBaseUrl };
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

function parseDisplayDateToIsoDate(display: string): string | null {
  const raw = display.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const ordinalStripped = raw.replace(/(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
  const ddmmyyyy = ordinalStripped.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (ddmmyyyy) {
    const dd = Number.parseInt(ddmmyyyy[1] ?? "", 10);
    const mm = Number.parseInt(ddmmyyyy[2] ?? "", 10);
    const yyyy = Number.parseInt(ddmmyyyy[3] ?? "", 10);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 1900 && yyyy <= 2100) {
      const dt = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0)); // noon UTC to avoid DST edge cases
      return isoDateInLondon(dt);
    }
  }

  const dt = new Date(ordinalStripped);
  return isoDateInLondon(dt);
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} from management API${text ? `: ${text}` : ""}`);
    }
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

function getString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function resolveHttpUrl(value: string, baseUrl: string): string | null {
  let cleaned = value.trim();
  if (!cleaned) return null;

  // Strip trailing punctuation that commonly sneaks in from copy/paste.
  while (/[)\].,!?;:]+$/.test(cleaned)) cleaned = cleaned.slice(0, -1);

  // Protocol-relative URLs
  if (cleaned.startsWith("//")) {
    return resolveHttpUrl(`https:${cleaned}`, baseUrl);
  }

  // Domain without scheme (e.g. "vip-club.uk/abc123")
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|$)/i.test(cleaned) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)) {
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

function getEventCutoff(event: ManagementApiEvent): Date | null {
  const start = getEventStart(event);
  if (!start) return null;
  const end = getString(event.endDate) ?? getString(event.end_date);
  if (end) {
    const endDt = new Date(end);
    if (!Number.isNaN(endDt.getTime()) && endDt.getTime() >= start.getTime()) {
      return endDt;
    }
  }
  return start;
}

function getEventName(event: ManagementApiEvent): string | null {
  return getString(event.name) ?? getString(event.title) ?? getString(event.event_name);
}

function getCanonicalEventUrlBySlug(event: ManagementApiEvent, publicEventsBaseUrl: string): string | null {
  const slugRaw = getString(event.slug);
  if (!slugRaw) return null;
  const slug = slugRaw.replace(/^\/+|\/+$/g, "");
  if (!slug) return null;
  return resolveHttpUrl(`/events/${slug}`, publicEventsBaseUrl);
}

function getEventUrl(event: ManagementApiEvent, baseUrl: string, publicEventsBaseUrl: string): string | null {
  const candidates = [
    // Prefer canonical event URLs first (customer-facing event pages).
    getString(event.eventUrl),
    getString(event.event_url),
    getString(event.publicUrl),
    getString(event.public_url),
    getCanonicalEventUrlBySlug(event, publicEventsBaseUrl),
    getString(event.url),
    // Legacy and fallback fields.
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
      const offerUrl = getString((offer as any).url) ?? getString((offer as any).bookingUrl) ?? getString((offer as any).booking_url);
      if (!offerUrl) continue;
      const resolved = resolveHttpUrl(offerUrl, baseUrl);
      if (resolved) return resolved;
    }
  } else if (offers && typeof offers === "object") {
    const offerUrl = getString((offers as any).url) ?? getString((offers as any).bookingUrl) ?? getString((offers as any).booking_url);
    if (offerUrl) {
      const resolved = resolveHttpUrl(offerUrl, baseUrl);
      if (resolved) return resolved;
    }
  }

  // Booking URL is treated as a final fallback rather than the primary destination.
  const bookingCandidates = [getString(event.bookingUrl), getString(event.booking_url)].filter((v): v is string => !!v);
  for (const url of bookingCandidates) {
    const resolved = resolveHttpUrl(url, baseUrl);
    if (resolved) return resolved;
  }

  return null;
}

function bingoMatchScore(event: ManagementApiEvent): number {
  const nameRaw = (getEventName(event) ?? "").toLowerCase();
  const slugRaw = (getString(event.slug) ?? "").toLowerCase();

  const name = nameRaw.replace(/[^a-z0-9]+/g, " ").trim();
  const slug = slugRaw.replace(/[^a-z0-9]+/g, " ").trim();

  const nameHasMusicBingo = name.includes("music bingo");
  const slugHasMusicBingo =
    slugRaw.includes("music-bingo") || slugRaw.includes("musicbingo") || slug.includes("music bingo");

  const nameHasMusic = name.includes("music");
  const nameHasBingo = name.includes("bingo");
  const slugHasBingo = slug.includes("bingo") || slugRaw.includes("bingo");

  if (slugHasMusicBingo || nameHasMusicBingo) return 100;
  if (nameHasMusic && nameHasBingo) return 90;
  if (nameHasBingo) return 60;
  if (slugHasBingo) return 50;
  return 0;
}

function pickMusicBingoEvent(events: ManagementApiEvent[]): ManagementApiEvent | null {
  let best: { score: number; startMs: number; event: ManagementApiEvent } | null = null;

  for (const event of events) {
    const score = bingoMatchScore(event);
    if (score <= 0) continue;
    const start = getEventStart(event);
    const startMs = start ? start.getTime() : 0;
    if (!best || score > best.score || (score === best.score && startMs > best.startMs)) {
      best = { score, startMs, event };
    }
  }

  return best?.event ?? null;
}

function formatEventLabel(event: ManagementApiEvent): string | null {
  const name = getEventName(event);
  if (!name) return null;

  const start = getEventStart(event);
  if (!start) return name;

  const datePart = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  }).format(start);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  }).format(start);

  return `${name}\n${datePart} ${timePart}`;
}

async function fetchEvents(params: {
  baseUrl: string;
  apiKey: string;
  fromDate: string;
  toDate?: string;
  availableOnly?: boolean;
  limit?: number;
  offset?: number;
  status?: string;
}): Promise<ApiEventsResponse> {
  // Use an absolute path so callers can set MANAGEMENT_API_BASE_URL with or without a trailing `/api`.
  const url = new URL("/api/events", params.baseUrl);
  url.searchParams.set("from_date", params.fromDate);
  if (params.toDate) url.searchParams.set("to_date", params.toDate);
  if (params.availableOnly) url.searchParams.set("available_only", "true");
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  if (params.offset) url.searchParams.set("offset", String(params.offset));
  if (params.status) url.searchParams.set("status", params.status);

  const apiKeyValue = params.apiKey.replace(/^Bearer\s+/i, "").trim();
  const authHeader = `Bearer ${apiKeyValue}`;
  const json = (await fetchJsonWithTimeout(
    url.toString(),
    {
      headers: {
        "X-API-Key": apiKeyValue,
        Authorization: authHeader,
        Accept: "application/json",
      },
    },
    5000
  )) as any;

  if (!json || typeof json !== "object") {
    throw new Error("Unexpected management API response");
  }

  // Support both enveloped and direct response shapes.
  if (Array.isArray((json as any).events)) {
    return { events: (json as any).events as ManagementApiEvent[], meta: (json as any).meta };
  }

  const data = (json as any).data;
  if (data && typeof data === "object" && Array.isArray((data as any).events)) {
    return { events: (data as any).events as ManagementApiEvent[], meta: (data as any).meta };
  }

  const envelope = json as ApiEnvelope<ApiEventsResponse>;
  if (envelope.success !== true) {
    const msg = envelope.error?.message ? String(envelope.error.message) : "Management API error";
    throw new Error(msg);
  }

  return envelope.data ?? { events: [] };
}

export async function fetchNextUpcomingEventLinks(params: {
  eventDateDisplay: string;
  count?: number;
}): Promise<Array<{ label: string; url: string | null }>> {
  const config = getManagementApiConfig();
  if (!config) return [];

  const isoDate = parseDisplayDateToIsoDate(params.eventDateDisplay);
  if (!isoDate) return [];

  const requestedCount = Math.max(1, Math.min(10, Math.floor(params.count ?? 3)));

  let cutoff: Date | null = null;
  try {
    const sameDay = await fetchEvents({
      ...config,
      fromDate: isoDate,
      toDate: isoDate,
      status: "all",
      limit: 50,
    });

    const events = sameDay.events ?? [];
    const musicBingo = pickMusicBingoEvent(events);
    if (musicBingo) {
      cutoff = getEventCutoff(musicBingo);
    } else if (events.length === 1) {
      const only = events[0];
      cutoff = only ? getEventCutoff(only) : null;
    } else if (events.length > 1) {
      const sortedByStart = events
        .map((e) => ({ e, start: getEventStart(e) }))
        .filter((x): x is { e: ManagementApiEvent; start: Date } => !!x.start)
        .sort((a, b) => a.start.getTime() - b.start.getTime());
      // Best effort: choose the latest event on that date.
      const last = sortedByStart[sortedByStart.length - 1]?.e;
      cutoff = last ? getEventCutoff(last) : null;
    }
  } catch {
    // ignore; we can still attempt "next events after end of day".
  }

  if (!cutoff) {
    const endOfDay = new Date(`${isoDate}T23:59:59+00:00`);
    cutoff = Number.isNaN(endOfDay.getTime()) ? null : endOfDay;
  }

  if (!cutoff) return [];

  const upcoming = await fetchEvents({
    ...config,
    fromDate: isoDate,
    availableOnly: true,
    limit: 50,
  });

  const cutoffMs = cutoff.getTime();
  const candidates = (upcoming.events ?? [])
    .map((e) => ({ e, start: getEventStart(e) }))
    .filter((x): x is { e: ManagementApiEvent; start: Date } => !!x.start)
    .filter((x) => x.start.getTime() > cutoffMs)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map(({ e }) => ({
      label: formatEventLabel(e) ?? "Upcoming event",
      url: getEventUrl(e, config.baseUrl, config.publicEventsBaseUrl),
    }));

  return candidates.slice(0, requestedCount);
}

export async function fetchNextThreeUpcomingEventLinks(params: {
  eventDateDisplay: string;
}): Promise<Array<{ label: string; url: string | null }>> {
  return fetchNextUpcomingEventLinks({ eventDateDisplay: params.eventDateDisplay, count: 3 });
}
