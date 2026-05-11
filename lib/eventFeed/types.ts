/**
 * Shared types for the event feed adapter layer.
 *
 * NormalisedEvent intentionally mirrors the existing EventDetail type from
 * lib/managementApi.ts so that consumers (pdf.ts, clipboardDocx.ts) need
 * minimal changes when switching to the adapter abstraction.
 */

export interface NormalisedEvent {
  name: string;
  date: Date;
  /** e.g. "7:00 pm" */
  time: string;
  /** e.g. "Wed" */
  dayOfWeek: string;
  /** e.g. "29" */
  dayNumber: string;
  /** e.g. "Apr" */
  monthShort: string;
  /** e.g. "Wednesday 29 April" */
  dateFormatted: string;
  /** e.g. "£3 per person" or "Free entry" */
  price: string;
  /** Short description text */
  description: string;
  /** Bullet-point highlights from API */
  highlights: string[];
  /** Must be HTTPS or null */
  eventUrl: string | null;
}

export interface EventFeedAdapter {
  fetchUpcomingEvents(opts: {
    /** YYYY-MM-DD in Europe/London */
    afterDate: string;
    limit: number;
    sessionDate?: string;
  }): Promise<NormalisedEvent[]>;
}

export interface EventFeedConfig {
  type: "anchor_management" | "baronshub";
  baseUrl: string;
  apiKey: string;
  websiteUrl: string;
  venueId: string | null;
}
