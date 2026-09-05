/**
 * Event feed adapter factory and main entry point.
 *
 * Consumers call `fetchEventsForBrand()` with a BrandFeedConfig (from
 * brandRepo.ts) and a session date. The factory selects the right adapter
 * (Anchor Management or BaronsHub) and returns normalised events.
 */

import type { BrandFeedConfig } from "@/lib/brands/types";
import { createAnchorAdapter } from "./anchorAdapter";
import { createBaronsHubAdapter } from "./baronshubAdapter";
import type { EventFeedAdapter, EventFeedConfig, NormalisedEvent } from "./types";

export type { NormalisedEvent } from "./types";
export type { EventFeedConfig } from "./types";

/**
 * Create an adapter for the given event feed configuration.
 */
export function createEventFeedAdapter(config: EventFeedConfig): EventFeedAdapter {
  switch (config.type) {
    case "anchor_management":
      return createAnchorAdapter(config);
    case "baronshub":
      return createBaronsHubAdapter(config);
    default: {
      // Exhaustiveness check
      const _exhaustive: never = config.type;
      throw new Error(`Unknown event feed type: ${_exhaustive}`);
    }
  }
}

export interface EventFeedResult {
  status: "ok" | "disabled" | "missing_config" | "no_events" | "error";
  events: NormalisedEvent[];
}

/** Promotional feeds are optional, but failures must stay visible to the host. */
export async function fetchEventsForBrand(
  feedConfig: BrandFeedConfig | null,
  sessionDate: string,
  limit: number = 12,
): Promise<EventFeedResult> {
  if (feedConfig?.type === "none") return { status: "disabled", events: [] };
  if (!feedConfig?.baseUrl?.trim() || !feedConfig.apiKey?.trim()) {
    return { status: "missing_config", events: [] };
  }

  try {
    const config: EventFeedConfig = {
      type: feedConfig.type,
      baseUrl: feedConfig.baseUrl,
      apiKey: feedConfig.apiKey,
      websiteUrl: feedConfig.websiteUrl ?? "",
      venueId: feedConfig.venueId ?? null,
    };
    const events = await createEventFeedAdapter(config).fetchUpcomingEvents({
      afterDate: sessionDate,
      limit,
      sessionDate,
    });
    return { status: events.length ? "ok" : "no_events", events };
  } catch {
    // Provider response bodies can contain credentials. Keep them out of logs and headers.
    console.warn(`Event feed failed for ${feedConfig.type} adapter.`);
    return { status: "error", events: [] };
  }
}

/** Include configuration failures in the same optional-feed boundary. */
export async function loadEventsForPack(
  loadConfig: () => Promise<BrandFeedConfig | null>,
  sessionDate: string,
): Promise<EventFeedResult> {
  try {
    return await fetchEventsForBrand(await loadConfig(), sessionDate);
  } catch {
    console.warn("Event feed configuration could not be loaded.");
    return { status: "error", events: [] };
  }
}
