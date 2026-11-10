import { isAllowedReviewUrl } from "@anchor-nights/kit/events/shared";

/**
 * The review short link used until Music Bingo's own one exists (spec X-2).
 * Printed cards already carry it, so it is never deleted; on 7 November 2026
 * it answered 307 to the management app's neutral feedback page
 * (/feedback?short_code=jls0mu), not to Google.
 */
export const REVIEW_FALLBACK_URL = "https://l.the-anchor.pub/jls0mu";

/**
 * Music Bingo's "Review us" link on the end-of-night screen (spec M-7, S7.5).
 *
 * REVIEW_SHORT_URL is Music Bingo's own short link on l.the-anchor.pub, which
 * leads to https://l.the-anchor.pub/feedback with Music Bingo's src and utm
 * tags. Until Peter creates it, or when the value is not an https
 * the-anchor.pub link (a Google review URL is refused on purpose: every
 * review ask goes through the neutral feedback page, website SSOT section
 * 17), the screen uses REVIEW_FALLBACK_URL. The build refuses a bad value
 * too (lib/buildEnv.mjs); this is the same rule at runtime. Read on the
 * server and handed to the screens as a prop, so changing it needs only a
 * redeploy, not a code change.
 */
export function resolveReviewUrl(raw: string | null | undefined = process.env.REVIEW_SHORT_URL): string {
  return isAllowedReviewUrl(raw) ? raw.trim() : REVIEW_FALLBACK_URL;
}
