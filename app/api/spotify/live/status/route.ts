import { NextRequest, NextResponse } from "next/server";

import {
  getPlaybackState,
  SpotifyLiveError,
} from "@/lib/spotifyLive";
import {
  SPOTIFY_COOKIE_ACCESS,
  getOrRefreshAccessToken,
  type GetOrRefreshTokenResult,
} from "@/lib/spotifyWeb";

export const runtime = "nodejs";

const COOKIE_REFRESH = "spotify_refresh_token";

function unauthorized(message: string): Response {
  return new Response(message, { status: 401, headers: { "Cache-Control": "no-store" } });
}

function applyTokenCookies(
  response: NextResponse,
  tokenResult: GetOrRefreshTokenResult,
  secure: boolean
): void {
  if (tokenResult.newRefreshToken) {
    response.cookies.set({
      name: COOKIE_REFRESH,
      value: tokenResult.newRefreshToken,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  if (tokenResult.newCacheValue && tokenResult.newCacheMaxAge) {
    response.cookies.set({
      name: SPOTIFY_COOKIE_ACCESS,
      value: tokenResult.newCacheValue,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: tokenResult.newCacheMaxAge,
    });
  }
}

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const secure = process.env.NODE_ENV === "production";

  const refreshToken = request.cookies.get(COOKIE_REFRESH)?.value ?? "";
  if (!refreshToken.trim()) {
    return unauthorized("Spotify is not connected. Click \"Connect Spotify\" and try again.");
  }

  let tokenResult: GetOrRefreshTokenResult;
  try {
    tokenResult = await getOrRefreshAccessToken({
      refreshToken,
      cachedRaw: request.cookies.get(SPOTIFY_COOKIE_ACCESS)?.value ?? null,
      origin,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to refresh Spotify token.";
    return unauthorized(`${msg}\n\nTry clicking "Connect Spotify" again.`);
  }

  const { accessToken } = tokenResult;

  try {
    const state = await getPlaybackState(accessToken);
    const response = NextResponse.json(
      {
        connected: true,
        canControlPlayback: state.canControlPlayback,
        activeDevice: state.activeDevice,
        playback: state.playback,
        warnings: state.warnings,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
    applyTokenCookies(response, tokenResult, secure);
    return response;
  } catch (err) {
    if (err instanceof SpotifyLiveError) {
      if (err.code === "TOKEN_INVALID") {
        return unauthorized(`${err.message}\n\nTry clicking "Connect Spotify" again.`);
      }

      const response = NextResponse.json(
        {
          connected: true,
          canControlPlayback: false,
          activeDevice: null,
          playback: null,
          warnings: [err.message],
          error: { code: err.code, message: err.message },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
      applyTokenCookies(response, tokenResult, secure);
      return response;
    }

    const msg = err instanceof Error ? err.message : "Failed to fetch live Spotify status.";
    return new Response(msg, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
