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

/**
 * Fetch upcoming events for a brand using its feed configuration.
 *
 * Returns an empty array on any error (network, parse, missing config).
 * Never logs API keys.
 */
export async function fetchEventsForBrand(
  feedConfig: BrandFeedConfig,
  sessionDate: string,
  limit: number = 12,
): Promise<NormalisedEvent[]> {
  if (feedConfig.type === "none") return [];
  if (!feedConfig.baseUrl && feedConfig.type !== "anchor_management") return [];
  if (!feedConfig.apiKey && feedConfig.type !== "anchor_management") return [];

  try {
    const config: EventFeedConfig = {
      type: feedConfig.type as "anchor_management" | "baronshub",
      baseUrl: feedConfig.baseUrl ?? "",
      apiKey: feedConfig.apiKey ?? "",
      websiteUrl: feedConfig.websiteUrl ?? "",
    };
    const adapter = createEventFeedAdapter(config);
    return await adapter.fetchUpcomingEvents({
      afterDate: sessionDate,
      limit,
      sessionDate,
    });
  } catch (error) {
    const brandType = feedConfig.type;
    console.warn(
      `Event feed failed for ${brandType} adapter:`,
      error instanceof Error ? error.message : "Unknown error",
    );
    return [];
  }
}
