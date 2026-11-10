// The front page's "Other nights" row (spec M-10, S2.3): links to the pub's
// other game nights, the same way Cash Bingo builds its row.
//
// Which nights appear comes from the management app's events feed, never from
// a list written here: a night is shown only while the feed has an upcoming
// event in that night's category (NIGHT_CATEGORY_SLUGS, the slugs the TV
// uses). Where each one links is that night's own address from the
// environment (OTHER_NIGHT_URL_ENV, checked at build by lib/buildEnv.mjs); a
// night with no address, or one that is not https, is left out by the kit's
// buildOtherNights. No hostname lives in this file.
//
// Feed down ('error', or the read itself throws): the row is hidden and the
// failure reported (app_errors). An empty feed ('no_events') or no key
// ('missing_config', a preview or local run) hides it without a report.

import type { ScreenFeed } from "@anchor-nights/kit/events/shared";
import { NIGHT_CATEGORY_SLUGS } from "@anchor-nights/kit/events/shared";
import { buildOtherNights, type NightKey, type OtherNight } from "@anchor-nights/kit/front";

/** This app's night, as the kit names it. */
export const CURRENT_NIGHT: NightKey = "music";

/** The sister nights' addresses, by night (the same names as lib/buildEnv.mjs; a test keeps them equal). */
export const OTHER_NIGHT_URL_ENV = Object.freeze({
  quiz: "NEXT_PUBLIC_QUIZ_NIGHT_URL",
  cash: "NEXT_PUBLIC_CASH_BINGO_URL",
  tasting: "NEXT_PUBLIC_TASTING_NIGHT_URL",
} as const);

/** The management category of each night (spec S7.2). */
export const NIGHT_CATEGORY_BY_KEY: Readonly<Record<NightKey, string>> = Object.freeze({
  quiz: NIGHT_CATEGORY_SLUGS.quiz,
  cash: NIGHT_CATEGORY_SLUGS.cashBingo,
  music: NIGHT_CATEGORY_SLUGS.musicBingo,
  tasting: NIGHT_CATEGORY_SLUGS.tasting,
});

/** The error-report scope when the row is hidden because the feed is down. */
export const OTHER_NIGHTS_REPORT_SCOPE = "front:other-nights";

export type OtherNightUrls = Partial<Record<NightKey, string | undefined>>;

/**
 * The sister nights' addresses as set in this environment. Read by name, so
 * Next inlines each NEXT_PUBLIC_ value at build.
 */
export function readOtherNightUrls(
  env: Readonly<Record<string, string | undefined>> = {
    NEXT_PUBLIC_QUIZ_NIGHT_URL: process.env.NEXT_PUBLIC_QUIZ_NIGHT_URL,
    NEXT_PUBLIC_CASH_BINGO_URL: process.env.NEXT_PUBLIC_CASH_BINGO_URL,
    NEXT_PUBLIC_TASTING_NIGHT_URL: process.env.NEXT_PUBLIC_TASTING_NIGHT_URL,
  },
): OtherNightUrls {
  return {
    quiz: env[OTHER_NIGHT_URL_ENV.quiz],
    cash: env[OTHER_NIGHT_URL_ENV.cash],
    tasting: env[OTHER_NIGHT_URL_ENV.tasting],
  };
}

export interface OtherNightsSelection {
  nights: OtherNight[];
  /** Set when the row is hidden because the feed failed; null otherwise. */
  failure: Error | null;
}

/**
 * The row for a given feed. Pure. A night appears only when the feed is
 * 'ok', it has an upcoming event in that night's category, and the night has
 * an address.
 */
export function selectOtherNights(feed: ScreenFeed, urls: OtherNightUrls): OtherNightsSelection {
  if (feed.status === "error") {
    return { nights: [], failure: new Error("The events feed is down, so the front page hides the Other nights row") };
  }
  if (feed.status !== "ok") return { nights: [], failure: null };

  const running = new Set<string>();
  for (const event of [...feed.events, ...feed.nights]) {
    if (event.category) running.add(event.category);
  }
  const nights = buildOtherNights({ current: CURRENT_NIGHT, urls }).filter((night) =>
    running.has(NIGHT_CATEGORY_BY_KEY[night.key]),
  );
  return { nights, failure: null };
}

export interface LoadOtherNightsDeps {
  getFeed: () => Promise<ScreenFeed>;
  urls: OtherNightUrls;
  report: (scope: string, err: unknown) => void;
}

/** Reads the feed and builds the row. Never throws: a failure hides the row and is reported. */
export async function loadOtherNights({ getFeed, urls, report }: LoadOtherNightsDeps): Promise<OtherNight[]> {
  let feed: ScreenFeed;
  try {
    feed = await getFeed();
  } catch (err) {
    report(OTHER_NIGHTS_REPORT_SCOPE, err);
    return [];
  }
  const { nights, failure } = selectOtherNights(feed, urls);
  if (failure) report(OTHER_NIGHTS_REPORT_SCOPE, failure);
  return nights;
}
