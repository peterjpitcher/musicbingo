// The environment a Music Bingo build needs (spec S6.3), checked when
// next.config.mjs loads, so a production deploy with a missing or malformed
// setting fails at build instead of on the night. Plain JavaScript with no
// app imports, because next.config.mjs loads it before anything is compiled.
//
// Everything Music Bingo reads is server-side. Production builds need the
// service-role Supabase pair, Spotify and the admin secret; previews and
// local builds (and CI, which is given no secrets) build without them.
import { ERROR_SINK_ENV, checkEnv, defineEnv } from "@anchor-nights/kit/env";

/** The shortest ERROR_SINK_TOKEN accepted: long enough that guessing it is hopeless (Cash Bingo's rule). */
export const ERROR_SINK_TOKEN_MIN_LENGTH = 32;

export const MUSIC_BINGO_ENV = defineEnv([
  { name: "SUPABASE_URL", required: "production", kind: "url", why: "for every game and venue read" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", required: "production", why: "for every game and venue read" },
  { name: "SPOTIFY_CLIENT_ID", required: "production", why: "for playlists and live playback" },
  { name: "SPOTIFY_CLIENT_SECRET", required: "production", why: "for playlists and live playback" },
  { name: "SPOTIFY_WEB_REDIRECT_URI", kind: "url" },
  // Retired with the new sign-in (M-8); until then production fails closed without it.
  { name: "APP_ADMIN_SECRET", required: "production", why: "to protect the host and admin pages" },
  ...ERROR_SINK_ENV,
]);

/**
 * Every problem with `env`, as sentences: the kit's checks plus the error
 * sink pairing. ERROR_SINK_URL is optional (reportError only logs without
 * it), but once it is set the sink route needs a long ERROR_SINK_TOKEN and
 * the service role, or every report would be refused.
 */
export function checkMusicBingoEnv(env = process.env) {
  const problems = checkEnv(MUSIC_BINGO_ENV, env);
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
