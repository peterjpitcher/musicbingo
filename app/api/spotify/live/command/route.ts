import { NextRequest, NextResponse } from "next/server";

import {
  getPlaybackState,
  pausePlayback,
  resumePlayback,
  seekToPositionMs,
  skipNext,
  skipPrevious,
  SpotifyLiveError,
  startPlaylistPlayback,
  startTrackInPlaylistPlayback,
  type SpotifyLiveState,
} from "@/lib/spotifyLive";
import {
  SPOTIFY_COOKIE_ACCESS,
  getOrRefreshAccessToken,
  type GetOrRefreshTokenResult,
} from "@/lib/spotifyWeb";

export const runtime = "nodejs";

const COOKIE_REFRESH = "spotify_refresh_token";

type LiveCommandAction = "play_game" | "pause" | "resume" | "next" | "previous" | "seek" | "play_break" | "resume_from_track";

type LiveCommandPayload = {
  action?: unknown;
  playlistId?: unknown;
  trackId?: unknown;
  positionMs?: unknown;
  deviceId?: unknown;
};

function unauthorized(message: string): Response {
  return new Response(message, { status: 401, headers: { "Cache-Control": "no-store" } });
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asAction(value: unknown): LiveCommandAction | null {
  return value === "play_game"
    || value === "pause"
    || value === "resume"
    || value === "next"
    || value === "previous"
    || value === "seek"
    || value === "play_break"
    || value === "resume_from_track"
    ? value
    : null;
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

async function runCommand(params: {
  action: LiveCommandAction;
  payload: LiveCommandPayload;
  accessToken: string;
}): Promise<void> {
  const deviceId = asString(params.payload.deviceId) ?? undefined;

  if (params.action === "play_game") {
    const playlistId = asString(params.payload.playlistId);
    if (!playlistId) {
      throw new SpotifyLiveError("API_ERROR", "`playlistId` is required for play_game.");
    }
    await startPlaylistPlayback({ accessToken: params.accessToken, playlistId, deviceId });
    return;
  }

  if (params.action === "pause") {
    await pausePlayback({ accessToken: params.accessToken, deviceId });
    return;
  }

  if (params.action === "resume") {
    await resumePlayback({ accessToken: params.accessToken, deviceId });
    return;
  }

  if (params.action === "next") {
    await skipNext({ accessToken: params.accessToken, deviceId });
    return;
  }

  if (params.action === "previous") {
    await skipPrevious({ accessToken: params.accessToken, deviceId });
    return;
  }

  if (params.action === "play_break") {
    const playlistId = asString(params.payload.playlistId);
    if (!playlistId) {
      throw new SpotifyLiveError("API_ERROR", "`playlistId` is required for play_break.");
    }
    await startPlaylistPlayback({ accessToken: params.accessToken, playlistId, deviceId });
    return;
  }

  if (params.action === "resume_from_track") {
    const playlistId = asString(params.payload.playlistId);
    const trackId = asString(params.payload.trackId);
    if (playlistId && trackId) {
      await startTrackInPlaylistPlayback({ accessToken: params.accessToken, playlistId, trackId, deviceId });
    } else if (playlistId) {
      await startPlaylistPlayback({ accessToken: params.accessToken, playlistId, deviceId });
    } else {
      await resumePlayback({ accessToken: params.accessToken, deviceId });
    }
    return;
  }

  const positionMs = asNumber(params.payload.positionMs);
  if (positionMs === null) {
    throw new SpotifyLiveError("API_ERROR", "`positionMs` is required for seek.");
  }
  await seekToPositionMs({ accessToken: params.accessToken, positionMs, deviceId });
}

async function safePlaybackState(accessToken: string): Promise<SpotifyLiveState | null> {
  try {
    return await getPlaybackState(accessToken);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
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

  let payload: LiveCommandPayload;
  try {
    payload = (await request.json()) as LiveCommandPayload;
  } catch {
    return new Response("Invalid JSON payload.", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const action = asAction(payload.action);
  if (!action) {
    return new Response("Invalid action. Use one of: play_game, pause, resume, next, previous, seek.", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    await runCommand({ action, payload, accessToken });

    const state = await getPlaybackState(accessToken);
    const response = NextResponse.json(
      {
        ok: true,
        action,
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

      const state = await safePlaybackState(accessToken);
      const response = NextResponse.json(
        {
          ok: false,
          action,
          connected: true,
          canControlPlayback: state?.canControlPlayback ?? false,
          activeDevice: state?.activeDevice ?? null,
          playback: state?.playback ?? null,
          warnings: [...(state?.warnings ?? []), err.message],
          error: {
            code: err.code,
            message: err.message,
          },
        },
        {
          status: err.code === "NO_ACTIVE_DEVICE" || err.code === "PREMIUM_REQUIRED" ? 409 : 400,
          headers: { "Cache-Control": "no-store" },
        }
      );
      applyTokenCookies(response, tokenResult, secure);
      return response;
    }

    const msg = err instanceof Error ? err.message : "Live Spotify command failed.";
    return new Response(msg, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
