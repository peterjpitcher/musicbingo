import { NextRequest, NextResponse } from "next/server";

import { exchangeSpotifyCodeForTokens, getSpotifyWebConfig } from "@/lib/spotifyWeb";

export const runtime = "nodejs";

const COOKIE_STATE = "spotify_oauth_state";
const COOKIE_REFRESH = "spotify_refresh_token";

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
        try { window.close(); } catch (e) {}
      })();
    </script>
  </body>
</html>`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const secure = process.env.NODE_ENV === "production";

  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (error) {
    const msg = `Spotify auth error: ${error}${errorDescription ? ` (${errorDescription})` : ""}`;
    return new Response(popupHtml({ ok: false, error: msg }), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return new Response(popupHtml({ ok: false, error: "Spotify auth failed: missing code/state." }), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const expectedState = request.cookies.get(COOKIE_STATE)?.value ?? "";
  if (!expectedState || expectedState !== state) {
    return new Response(popupHtml({ ok: false, error: "Spotify auth failed: state mismatch. Please try again." }), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  try {
    const cfg = getSpotifyWebConfig(origin);
    const token = await exchangeSpotifyCodeForTokens(cfg, code);

    const res = new NextResponse(popupHtml({ ok: true }), {
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
    return new Response(popupHtml({ ok: false, error: msg }), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

