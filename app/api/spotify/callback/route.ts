import { NextRequest, NextResponse } from "next/server";

import {
  exchangeSpotifyCodeForTokens,
  getSpotifyWebConfig,
  makeSpotifyPopupHtml,
} from "@/lib/spotifyWeb";

export const runtime = "nodejs";

const COOKIE_STATE = "spotify_oauth_state";
const COOKIE_REFRESH = "spotify_refresh_token";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const secure = process.env.NODE_ENV === "production";

  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (error) {
    const msg = `Spotify auth error: ${error}${errorDescription ? ` (${errorDescription})` : ""}`;
    return new Response(makeSpotifyPopupHtml({ ok: false, error: msg, closeWindow: false }), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return new Response(
      makeSpotifyPopupHtml({ ok: false, error: "Spotify auth failed: missing code/state.", closeWindow: false }),
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      }
    );
  }

  const expectedState = request.cookies.get(COOKIE_STATE)?.value ?? "";
  if (!expectedState || expectedState !== state) {
    return new Response(
      makeSpotifyPopupHtml({
        ok: false,
        error: "Spotify auth failed: state mismatch. Please try again.",
        closeWindow: false,
      }),
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      }
    );
  }

  try {
    const cfg = getSpotifyWebConfig(origin);
    const token = await exchangeSpotifyCodeForTokens(cfg, code);

    const res = new NextResponse(makeSpotifyPopupHtml({ ok: true, closeWindow: true }), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });

    res.cookies.set({
      name: COOKIE_STATE,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 0,
    });

    if (token.refreshToken) {
      res.cookies.set({
        name: COOKIE_REFRESH,
        value: token.refreshToken,
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Spotify auth failed.";
    return new Response(makeSpotifyPopupHtml({ ok: false, error: msg, closeWindow: false }), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
