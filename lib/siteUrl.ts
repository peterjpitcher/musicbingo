import { getSiteOrigin } from "@anchor-nights/kit/qr";

/**
 * This deployment's public address (spec M-10, S2.4): NEXT_PUBLIC_SITE_URL on
 * production and local runs (https://musicbingo.the-anchor.pub once its DNS
 * is live), the branch address on a preview, else the request's own origin.
 * The kit never gives a preview a production address, nor production a
 * loopback one. No hostname is written in the code.
 *
 * Used for every link and code Music Bingo hands out (host and TV links), so
 * they carry the canonical address whichever alias a host happened to open.
 */
export function siteOrigin(requestOrigin: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  return getSiteOrigin({ env, requestOrigin }) ?? requestOrigin;
}

/** The callback path registered in the Spotify developer dashboard, per environment. */
export const SPOTIFY_CALLBACK_PATH = "/api/spotify/callback";

/**
 * Where Spotify sends the host back to: SPOTIFY_WEB_REDIRECT_URI (set per
 * environment and checked at build, lib/buildEnv.mjs), else this request's
 * own callback (local runs and previews).
 */
export function spotifyRedirectUri(requestOrigin: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const explicit = env.SPOTIFY_WEB_REDIRECT_URI?.trim();
  return explicit || `${requestOrigin}${SPOTIFY_CALLBACK_PATH}`;
}

/**
 * When the host started Spotify sign-in on another of the app's addresses
 * than the redirect URI's, the sign-in cannot finish there (its state cookie
 * and the Spotify cookies live on one address only): the address to open
 * instead, or null when this one is right.
 */
export function spotifyAddressMismatch(requestOrigin: string, env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const redirect = spotifyRedirectUri(requestOrigin, env);
  let redirectOrigin: string;
  try {
    redirectOrigin = new URL(redirect).origin;
  } catch {
    return null;
  }
  return redirectOrigin === requestOrigin ? null : redirectOrigin;
}
