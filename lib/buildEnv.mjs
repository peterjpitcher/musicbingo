// The environment a Music Bingo build needs (spec S6.3), checked when
// next.config.mjs loads, so a production deploy with a missing or malformed
// setting fails at build instead of on the night. Plain JavaScript with no
// app imports, because next.config.mjs loads it before anything is compiled.
//
// Staff sign-in (M-8) needs the kit's auth variables on EVERY build, local,
// preview, CI and production alike (auth standard section 15): the public
// Supabase pair, the service-role key, the app's own origin, the Turnstile
// pair and the audit HMAC key, and (spec M-9) the signing key for private
// host and TV links, so no build ever ships that cannot make or check one.
// CI and the browser flows give placeholder, non-secret values. Production
// also needs the service-role URL, Spotify and the cron secret, and (spec
// M-7) the management API key for the events feed: ANCHOR_API_KEY, or
// MANAGEMENT_API_TOKEN, the old name, which is still read for one release.
// Spec M-10: production also needs its own public address
// (NEXT_PUBLIC_SITE_URL) and its Spotify callback (SPOTIFY_WEB_REDIRECT_URI),
// each set per environment and agreeing with NEXT_PUBLIC_APP_URL.
import { AUTH_ENV, ERROR_SINK_ENV, SITE_URL_ENV, SUPABASE_PUBLIC_ENV, checkEnv, defineEnv } from "@anchor-nights/kit/env";

/** The shortest ERROR_SINK_TOKEN accepted: long enough that guessing it is hopeless (Cash Bingo's rule). */
export const ERROR_SINK_TOKEN_MIN_LENGTH = 32;

/** The shortest LIVE_LINK_SECRET accepted (lib/live/access.ts refuses shorter ones too). */
export const LIVE_LINK_SECRET_MIN_LENGTH = 16;

/** The shortest CRON_SECRET accepted. */
export const CRON_SECRET_MIN_LENGTH = 32;

/** The sister nights' addresses for the front page, by the kit's night key. */
export const OTHER_NIGHT_URL_ENV = Object.freeze({
  quiz: "NEXT_PUBLIC_QUIZ_NIGHT_URL",
  cash: "NEXT_PUBLIC_CASH_BINGO_URL",
  tasting: "NEXT_PUBLIC_TASTING_NIGHT_URL",
});
const OTHER_NIGHT_URL_NAMES = Object.values(OTHER_NIGHT_URL_ENV);

/** The Spotify callback path every environment registers. */
export const SPOTIFY_CALLBACK_PATH = "/api/spotify/callback";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Why SPOTIFY_WEB_REDIRECT_URI cannot work here, or null when it is fine. */
function spotifyRedirectProblem(value, env) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null; // the kit's URL check names it already
  }
  const isProduction = env.VERCEL_ENV === "production";
  const localHttp = url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname) && !isProduction;
  if (url.protocol !== "https:" && !localHttp) return `must use https (got "${value}")`;
  if (url.pathname !== SPOTIFY_CALLBACK_PATH || url.search || url.hash) {
    return `must be this app's ${SPOTIFY_CALLBACK_PATH}, with no query (got "${value}")`;
  }
  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl && originOf(appUrl) !== url.origin) {
    return `must be on the same address as NEXT_PUBLIC_APP_URL (got "${value}" and "${appUrl}"); set both per environment`;
  }
  return null;
}

export const MUSIC_BINGO_ENV = defineEnv([
  ...SUPABASE_PUBLIC_ENV,
  // SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL, the Turnstile pair and AUDIT_HMAC_KEY.
  ...AUTH_ENV,
  { name: "SUPABASE_URL", required: "production", kind: "url", why: "for every game and venue read" },
  { name: "SPOTIFY_CLIENT_ID", required: "production", why: "for playlists and live playback" },
  { name: "SPOTIFY_CLIENT_SECRET", required: "production", why: "for playlists and live playback" },
  {
    // Per environment (spec M-10): the exact callback registered in the
    // Spotify developer dashboard. checkMusicBingoEnv also checks its shape
    // and that it is on this environment's own address.
    name: "SPOTIFY_WEB_REDIRECT_URI",
    required: "production",
    kind: "url",
    why: "so Spotify returns to this environment's own address",
  },
  // NEXT_PUBLIC_SITE_URL: the public address links are built on (spec M-10,
  // S2.4). Production must set it (https://musicbingo.the-anchor.pub once
  // the DNS is live); a bare https origin.
  ...SITE_URL_ENV.map((rule) => ({ ...rule, required: "production", why: "for the links and codes the app hands out" })),
  // The front page's "Other nights" row: each sister night's own address, a
  // bare https origin, optional (a night with none is left out).
  ...OTHER_NIGHT_URL_NAMES.map((name) => ({ name, kind: "site-origin" })),
  {
    name: "LIVE_LINK_SECRET",
    // Every build (M-9): links have no fallback secret, so a build without
    // one fails here rather than refusing every link on the night.
    required: true,
    why: "to sign the private host and TV links (there is no fallback secret)",
    // Any characters, so the value APP_ADMIN_SECRET had can be reused and the
    // links already handed out keep working (lib/live/access.ts).
    pattern: new RegExp(`^[\\s\\S]{${LIVE_LINK_SECRET_MIN_LENGTH},}$`),
    patternHint: `must be at least ${LIVE_LINK_SECRET_MIN_LENGTH} characters`,
  },
  {
    name: "CRON_SECRET",
    required: "production",
    why: "for the daily sign-in housekeeping (Vercel Cron)",
    pattern: new RegExp(`^\\S{${CRON_SECRET_MIN_LENGTH},}$`),
    patternHint: `must be at least ${CRON_SECRET_MIN_LENGTH} characters with no spaces`,
  },
  ...ERROR_SINK_ENV,
  // The events feed (spec M-7, S7.1). Optional here because the old names are
  // still read for one release; checkMusicBingoEnv insists on one of them on
  // production. A set ANCHOR_API_KEY must look like a key.
  { name: "ANCHOR_API_KEY", kind: "management-api-key" },
  { name: "ANCHOR_API_BASE_URL", kind: "api-base-url" },
  { name: "MANAGEMENT_API_BASE_URL", kind: "api-base-url" },
  {
    // Music Bingo's own review short link (spec M-7, S7.5). Optional: unset,
    // the TV uses the existing https://l.the-anchor.pub/jls0mu. Never a
    // Google URL: every review ask goes through the neutral feedback page.
    name: "REVIEW_SHORT_URL",
    kind: "https-url",
    pattern: /^https:\/\/([a-z0-9-]+\.)*the-anchor\.pub\/\S+$/i,
    patternHint: "must be an https the-anchor.pub link with a path, such as the review short link on l.the-anchor.pub",
  },
]);

/**
 * The old events API names still read for one release (spec M-7), by the
 * standard name each stands in for. lib/anchorApiEnv.ts reads the same pairs.
 */
export const DEPRECATED_ANCHOR_API_NAMES = Object.freeze({
  ANCHOR_API_KEY: "MANAGEMENT_API_TOKEN",
  ANCHOR_API_BASE_URL: "MANAGEMENT_API_BASE_URL",
});

/** The old names `env` still relies on (set, with the standard name unset). */
export function deprecatedEnvInUse(env = process.env) {
  return Object.entries(DEPRECATED_ANCHOR_API_NAMES)
    .filter(([standard, old]) => !env[standard]?.trim() && Boolean(env[old]?.trim()))
    .map(([standard, old]) => `${old} (rename it to ${standard})`);
}

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

/**
 * Every problem with `env`, as sentences: the kit's checks, the two Supabase
 * URLs agreeing, and the error sink pairing. ERROR_SINK_URL is optional (reportError only logs without
 * it), but once it is set the sink route needs a long ERROR_SINK_TOKEN and
 * the service role, or every report would be refused.
 */
export function checkMusicBingoEnv(env = process.env) {
  const problems = checkEnv(MUSIC_BINGO_ENV, env);
  // The service-role client (SUPABASE_URL) and sign-in (NEXT_PUBLIC_SUPABASE_URL)
  // must talk to the same project, or staff would sign in to one and play from another.
  const serviceUrl = env.SUPABASE_URL?.trim();
  const publicUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (serviceUrl && publicUrl && originOf(serviceUrl) !== originOf(publicUrl)) {
    problems.push(`SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL must be the same project (got "${serviceUrl}" and "${publicUrl}").`);
  }
  // The events feed key: ANCHOR_API_KEY, or the old MANAGEMENT_API_TOKEN for
  // one release. Production must have one, or the TV loses its events and the
  // printed pack its listings without any error on the night.
  if (env.VERCEL_ENV === "production" && !env.ANCHOR_API_KEY?.trim() && !env.MANAGEMENT_API_TOKEN?.trim()) {
    problems.push(
      "ANCHOR_API_KEY is not set, and production builds need it for the events feed (the management app key with the read:events scope).",
    );
  }
  const redirect = env.SPOTIFY_WEB_REDIRECT_URI?.trim();
  if (redirect) {
    const problem = spotifyRedirectProblem(redirect, env);
    if (problem) problems.push(`SPOTIFY_WEB_REDIRECT_URI ${problem}.`);
  }
  // Links and sign-in emails must name the same address.
  const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim();
  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim();
  if (siteUrl && appUrl && env.VERCEL_ENV !== "preview" && originOf(siteUrl) !== originOf(appUrl)) {
    problems.push(`NEXT_PUBLIC_SITE_URL and NEXT_PUBLIC_APP_URL must be the same address (got "${siteUrl}" and "${appUrl}").`);
  }
  const sinkUrl = env.ERROR_SINK_URL?.trim();
  if (sinkUrl) {
    const token = env.ERROR_SINK_TOKEN?.trim() ?? "";
    if (token.length < ERROR_SINK_TOKEN_MIN_LENGTH) {
      problems.push(
        `ERROR_SINK_TOKEN must be set to a random value of at least ${ERROR_SINK_TOKEN_MIN_LENGTH} characters when ERROR_SINK_URL is set.`,
      );
    }
  }
  return problems;
}

/** Throws one error naming every problem. Call it at the top of next.config.mjs. */
export function validateMusicBingoEnv(env = process.env) {
  const problems = checkMusicBingoEnv(env);
  const deprecated = deprecatedEnvInUse(env);
  if (deprecated.length > 0) {
    console.warn(`Environment: deprecated names still in use, read for one more release only: ${deprecated.join(", ")}.`);
  }
  if (problems.length > 0) {
    throw new Error(`Environment check failed:\n  - ${problems.join("\n  - ")}`);
  }
}
