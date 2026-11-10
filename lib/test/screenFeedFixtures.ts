import type { ScreenChannel, ScreenEvent, ScreenFeed } from "@anchor-nights/kit/events/shared";

// Made-up events for tests only: every name, id, date and code here is invented.

function links(code: string): Record<ScreenChannel, string> {
  return {
    pre_event_screen: `https://l.the-anchor.pub/pre${code}`,
    in_game_screen: `https://l.the-anchor.pub/in${code}`,
    post_event_screen: `https://l.the-anchor.pub/post${code}`,
    venue_screen: `https://l.the-anchor.pub/venue${code}`,
    event_host_slide: `https://l.the-anchor.pub/host${code}`,
  };
}

export function screenEvent(id: string, title: string, startsAt: string, category: string | null): ScreenEvent {
  return { id, slug: `test-${id}`, title, startsAt, category, image: null, links: links(id) };
}

/** Friday 20 November 2026, 20:00 GMT: a Music Bingo night. */
export const MUSIC_NOV_20 = screenEvent("mb1", "Test Music Bingo", "2026-11-20T20:00:00.000Z", "music-bingo");
/** Friday 18 December 2026, 20:00 GMT. */
export const MUSIC_DEC_18 = screenEvent("mb2", "Test Music Bingo Christmas", "2026-12-18T20:00:00.000Z", "music-bingo");
/** Two events of other formats. */
export const QUIZ_NOV_25 = screenEvent("q1", "Test Quiz Night", "2026-11-25T19:00:00.000Z", "quiz-night-stanwell-moor");
export const PARTY_NOV_28 = screenEvent("p1", "Test Party", "2026-11-28T19:30:00.000Z", "parties");

export function feedWith(nights: ScreenEvent[], events: ScreenEvent[] = []): ScreenFeed {
  return {
    status: nights.length || events.length ? "ok" : "no_events",
    fetchedAt: "2026-11-07T09:00:00.000Z",
    categorySlug: "music-bingo",
    events,
    nights,
  };
}

export const NO_FEED: ScreenFeed = { status: "error", fetchedAt: null, categorySlug: "music-bingo", events: [], nights: [] };
