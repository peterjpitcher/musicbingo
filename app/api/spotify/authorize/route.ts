import { NextRequest, NextResponse } from "next/server";

import {
  buildSpotifyAuthorizeUrl,
  getSpotifyWebConfig,
  makeSpotifyPopupHtml,
  makeSpotifyOAuthState,
} from "@/lib/spotifyWeb";

export const runtime = "nodejs";

const COOKIE_STATE = "spotify_oauth_state";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const secure = process.env.NODE_ENV === "production";

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
