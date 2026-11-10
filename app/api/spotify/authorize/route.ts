import { NextRequest, NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/routeGuard";

import {
  buildSpotifyAuthorizeUrl,
  getSpotifyWebConfig,
  makeSpotifyPopupHtml,
  makeSpotifyOAuthState,
} from "@/lib/spotifyWeb";
import { spotifyAddressMismatch } from "@/lib/siteUrl";

export const runtime = "nodejs";

const COOKIE_STATE = "spotify_oauth_state";

export async function GET(request: NextRequest) {
  // Signed-in host or admin only (M-8); the Spotify logic below is unchanged.
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const origin = new URL(request.url).origin;
  const secure = process.env.NODE_ENV === "production";

  // Spotify returns to one registered address per environment. Started on
  // another of the app's addresses, the sign-in could never finish (its state
  // cookie would be on the wrong address), so say where to go instead.
  const canonical = spotifyAddressMismatch(origin);
  if (canonical) {
    return new Response(
      makeSpotifyPopupHtml({
        ok: false,
        error: `Spotify connects only from ${canonical}. Open Music Bingo there, sign in, then press Connect Spotify again.`,
        closeWindow: false,
      }),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }

  try {
    const cfg = getSpotifyWebConfig(origin);
    const state = makeSpotifyOAuthState();
    const authorizeUrl = buildSpotifyAuthorizeUrl(cfg, state);

    const res = NextResponse.redirect(authorizeUrl);
    res.cookies.set({
      name: COOKIE_STATE,
      value: state,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 10 * 60,
    });
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start Spotify auth.";
    return new Response(makeSpotifyPopupHtml({ ok: false, error: msg }), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
