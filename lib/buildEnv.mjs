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
// also needs the service-role URL, Spotify and the cron secret.
import { AUTH_ENV, ERROR_SINK_ENV, SUPABASE_PUBLIC_ENV, checkEnv, defineEnv } from "@anchor-nights/kit/env";

/** The shortest ERROR_SINK_TOKEN accepted: long enough that guessing it is hopeless (Cash Bingo's rule). */
export const ERROR_SINK_TOKEN_MIN_LENGTH = 32;

/** The shortest LIVE_LINK_SECRET accepted (lib/live/access.ts refuses shorter ones too). */
export const LIVE_LINK_SECRET_MIN_LENGTH = 16;

/** The shortest CRON_SECRET accepted. */
export const CRON_SECRET_MIN_LENGTH = 32;

export const MUSIC_BINGO_ENV = defineEnv([
  ...SUPABASE_PUBLIC_ENV,
  // SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL, the Turnstile pair and AUDIT_HMAC_KEY.
  ...AUTH_ENV,
  { name: "SUPABASE_URL", required: "production", kind: "url", why: "for every game and venue read" },
  { name: "SPOTIFY_CLIENT_ID", required: "production", why: "for playlists and live playback" },
  { name: "SPOTIFY_CLIENT_SECRET", required: "production", why: "for playlists and live playback" },
  { name: "SPOTIFY_WEB_REDIRECT_URI", kind: "url" },
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
]);

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
  if (problems.length > 0) {
    throw new Error(`Environment check failed:\n  - ${problems.join("\n  - ")}`);
  }
}
