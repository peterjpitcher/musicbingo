import { NextRequest, NextResponse } from "next/server";

import {
  buildSpotifyAuthorizeUrl,
  getSpotifyWebConfig,
  makeSpotifyOAuthState,
} from "@/lib/spotifyWeb";

export const runtime = "nodejs";

const COOKIE_STATE = "spotify_oauth_state";

function popupHtml(params: { ok: boolean; error?: string }): string {
  const message = {
    type: "spotify-auth",
    ok: params.ok,
    error: params.error ?? null,
  };
  const safeJson = JSON.stringify(message).replace(/</g, "\\u003c");
  const safeText = (params.error ?? (params.ok ? "Connected to Spotify. You can close this window." : "Spotify auth failed."))
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Spotify</title>
  </head>
  <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px;">
    <pre style="white-space: pre-wrap; word-break: break-word;">${safeText}</pre>
    <script>
      (function () {
        try {
          if (window.opener && window.location && window.location.origin) {
            window.opener.postMessage(${safeJson}, window.location.origin);
          }
        } catch (e) {}
      })();
    </script>
  </body>
</html>`;
}

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
    return new Response(popupHtml({ ok: false, error: msg }), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

