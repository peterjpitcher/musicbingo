import { NextResponse } from "next/server";
import type { ScreenFeed } from "@anchor-nights/kit/events";

import { eventsFeed } from "@/lib/eventsFeed";

export const runtime = "nodejs";
// Dynamic so the build never calls the management app; the CDN caches it
// instead, so a room of screens cannot add load on the management app.
export const dynamic = "force-dynamic";

/**
 * The events projection the TV reads (spec S7.1). Public on purpose: it holds
 * only what the pub's website already shows (names, dates, artwork and
 * booking links), and no game, session, token or key. getFeed() never throws;
 * a management app that is down answers `error` (reported to app_errors by
 * lib/eventsFeed.ts) and the screens fall back to "See what's on".
 */
export async function GET(): Promise<NextResponse<ScreenFeed>> {
  return NextResponse.json(await eventsFeed.getFeed(), {
    // 60 seconds at the CDN (spec S7.1), and a stale answer for 5 minutes
    // more while it refreshes.
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
