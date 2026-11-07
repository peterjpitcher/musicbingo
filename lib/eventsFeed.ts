import "server-only";

import { createEventsFeed, NIGHT_CATEGORY_SLUGS } from "@anchor-nights/kit/events";

import { deprecationNote, resolveAnchorApiEnv } from "@/lib/anchorApiEnv";
import { reportError } from "@/lib/reportError";

/** utm_source on the website links the TV's event QR codes fall back to. */
export const EVENTS_FEED_APP = "anchor-music-bingo";

const anchorApi = resolveAnchorApiEnv();
const note = deprecationNote(anchorApi.deprecated);
if (note) console.warn(note);

/**
 * Upcoming events from the management app (spec S7.1 and S7.2), for the TV's
 * idle, break and end-of-night loops. "Next Music Bingo" is chosen by the
 * category slug `music-bingo`, never by a display name.
 *
 * One feed per server instance: the kit holds the answer for 5 minutes, keeps
 * serving the last good one for up to 24 hours while the management app is
 * down, and never throws. Without a key it answers `missing_config` and the
 * screens show their "See what's on" loop, never an invented event. Every
 * failure is reported through reportError (app_errors).
 *
 * Server only: the key travels in a header from here and never reaches a
 * browser. The screens read the feed through /api/screen/events.
 */
export const eventsFeed = createEventsFeed({
  app: EVENTS_FEED_APP,
  categorySlug: NIGHT_CATEGORY_SLUGS.musicBingo,
  apiKey: anchorApi.apiKey,
  baseUrl: anchorApi.baseUrl,
  report: (scope, err) => void reportError({ scope }, err),
});
