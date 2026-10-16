import { NextRequest, NextResponse } from "next/server";

import {
  confirmPlaybackStarted,
  getPlaybackState,
  listDevices,
  pausePlayback,
  pickFallbackDevice,
  playTrackByUri,
  resumePlayback,
  seekToPositionMs,
  skipNext,
  skipPrevious,
  SpotifyLiveError,
  startPlaylistPlayback,
  startTrackInPlaylistPlayback,
  type SpotifyLiveDevice,
  type SpotifyLiveState,
} from "@/lib/spotifyLive";
import { isSpotifyOwnedPlaylist } from "@/lib/spotifyPlaylistId";
import {
  SPOTIFY_COOKIE_ACCESS,
  getOrRefreshAccessToken,
  type GetOrRefreshTokenResult,
} from "@/lib/spotifyWeb";

export const runtime = "nodejs";

const COOKIE_REFRESH = "spotify_refresh_token";

type LiveCommandAction = "play_game" | "play_track" | "pause" | "resume" | "next" | "previous" | "seek" | "play_break" | "resume_from_track";

type LiveCommandPayload = {
  action?: unknown;
  playlistId?: unknown;
  trackId?: unknown;
  positionMs?: unknown;
  deviceId?: unknown;
};

/** Actions that should leave music playing, so they can wake an idle device and are checked afterwards. */
const PLAY_ACTIONS: ReadonlySet<LiveCommandAction> = new Set([
  "play_game",
  "play_track",
  "resume",
  "play_break",
  "resume_from_track",
]);

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
    || value === "play_track"
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
  deviceId?: string;
}): Promise<{ warnings: string[]; debug?: Record<string, unknown> }> {
  const { accessToken, deviceId } = params;
  const done = { warnings: [] as string[] };

  if (params.action === "play_track") {
    const trackId = asString(params.payload.trackId);
    if (!trackId) {
      throw new SpotifyLiveError("API_ERROR", "`trackId` is required for play_track.");
    }
    const played = await playTrackByUri({ accessToken, trackId, deviceId });
    return {
      warnings: [],
      debug: {
        via: played.via,
        trackFound: Boolean(played.track),
        isPlayable: played.track?.isPlayable ?? null,
        restriction: played.track?.restrictionReason ?? null,
        relinked: Boolean(played.track?.relinkedFrom),
      },
    };
  }

  if (params.action === "play_game") {
    const playlistId = asString(params.payload.playlistId);
    if (!playlistId) {
      throw new SpotifyLiveError("API_ERROR", "`playlistId` is required for play_game.");
    }
    return startPlaylistPlayback({ accessToken, playlistId, deviceId, shuffle: false });
  }

  if (params.action === "pause") {
    await pausePlayback({ accessToken, deviceId });
    return done;
  }

  if (params.action === "resume") {
    await resumePlayback({ accessToken, deviceId });
    return done;
  }

  if (params.action === "next") {
    await skipNext({ accessToken, deviceId });
    return done;
  }

  if (params.action === "previous") {
    await skipPrevious({ accessToken, deviceId });
    return done;
  }

  if (params.action === "play_break") {
    const playlistId = asString(params.payload.playlistId);
    if (!playlistId) {
      throw new SpotifyLiveError("API_ERROR", "`playlistId` is required for play_break.");
    }
    try {
      return await startPlaylistPlayback({ accessToken, playlistId, deviceId, shuffle: true });
    } catch (err) {
      if (!(err instanceof SpotifyLiveError) || err.code === "TOKEN_INVALID" || err.code === "NO_ACTIVE_DEVICE") {
        throw err;
      }
      // The game playlist is still loaded. Left alone it plays on through the
      // break and gives away songs that have not been called yet, so stop it.
      await pausePlayback({ accessToken, deviceId }).catch(() => {});
      const ownedBySpotify = isSpotifyOwnedPlaylist(playlistId);
      throw new SpotifyLiveError(
        err.code,
        ownedBySpotify
          ? "Spotify would not start the break playlist. It is a Spotify-owned playlist, and Spotify blocks apps from using those. Game music is paused: play break music from the Spotify app, and use a playlist you own next time."
          : `Spotify would not start the break playlist (${err.message}). Game music is paused: play break music from the Spotify app.`,
        {
          httpStatus: err.httpStatus ?? undefined,
          spotifyMessage: err.spotifyMessage,
          spotifyReason: err.spotifyReason,
        }
      );
    }
  }

  if (params.action === "resume_from_track") {
    const playlistId = asString(params.payload.playlistId);
    const trackId = asString(params.payload.trackId);
    if (playlistId && trackId) {
      return startTrackInPlaylistPlayback({ accessToken, playlistId, trackId, deviceId });
    }
    if (playlistId) {
      return startPlaylistPlayback({ accessToken, playlistId, deviceId, shuffle: false });
    }
    await resumePlayback({ accessToken, deviceId });
    return done;
  }

  const positionMs = asNumber(params.payload.positionMs);
  if (positionMs === null) {
    throw new SpotifyLiveError("API_ERROR", "`positionMs` is required for seek.");
  }
  await seekToPositionMs({ accessToken, positionMs, deviceId });
  return done;
}

async function safePlaybackState(accessToken: string): Promise<SpotifyLiveState | null> {
  try {
    return await getPlaybackState(accessToken);
  } catch {
    return null;
  }
}

function deviceLabel(device: SpotifyLiveDevice | null | undefined): string {
  return device?.name ? `"${device.name}"` : "the Spotify device";
}

/**
 * Turn a failed command into something the host can act on mid-show. Spotify
 * only says "Restriction violated", so the player state supplies the why.
 */
function describeFailure(params: {
  action: LiveCommandAction;
  err: SpotifyLiveError;
  state: SpotifyLiveState | null;
  devices: SpotifyLiveDevice[] | null;
}): string {
  const { action, err, state, devices } = params;
  const playing = state?.playback ?? null;

  if (err.code === "NO_ACTIVE_DEVICE") {
    if (!PLAY_ACTIONS.has(action)) {
      return "Nothing is playing in Spotify, so there is nothing to control. Start a song first (Play Welcome Intro, an intro song or Start Game).";
    }
    const open = (devices ?? []).filter((device) => !device.isRestricted);
    if (open.length > 1) {
      return `Spotify is open on ${open.map((device) => `"${device.name}"`).join(" and ")}, but none of them is playing. Press play once in the Spotify app on the one connected to the speakers, then try again.`;
    }
    return "Spotify is not open on any device. Open the Spotify app on the host laptop, press play once, then try again.";
  }

  // Our own checks (no Spotify status) already say exactly what is wrong.
  if (err.code !== "RESTRICTED" || action === "play_break" || err.httpStatus === null) return err.message;

  if (!state?.activeDevice) {
    return PLAY_ACTIONS.has(action)
      ? "Spotify would not start playback. Open the Spotify app on the host laptop, press play once, then try again."
      : "Nothing is playing in Spotify, so there is nothing to control. Start a song first (Play Welcome Intro, an intro song or Start Game).";
  }
  if (action === "next" || action === "previous" || action === "seek") {
    if (!playing) {
      return `Nothing is loaded in Spotify on ${deviceLabel(state.activeDevice)}, so there is nothing to skip. Start a song first (Play Welcome Intro, an intro song or Start Game).`;
    }
    if (action === "seek") return "Spotify would not jump ahead in this song. Use Next to move on instead.";
    return `Spotify has no ${action} song to skip to from here. The welcome and intro songs play on their own, outside the game playlists.`;
  }
  if (action === "pause") {
    return `Spotify would not pause on ${deviceLabel(state.activeDevice)}. Pause it in the Spotify app.`;
  }
  return `Spotify would not start playback on ${deviceLabel(state.activeDevice)}. Press play once in the Spotify app on that device, then try again.`;
}

function logCommandFailure(params: {
  action: LiveCommandAction;
  err: SpotifyLiveError;
  state: SpotifyLiveState | null;
  usedFallbackDevice: boolean;
}): void {
  // No device names or ids: they can identify a person.
  console.warn(
    `[spotify-live] command failed ${JSON.stringify({
      action: params.action,
      code: params.err.code,
      httpStatus: params.err.httpStatus,
      spotifyMessage: params.err.spotifyMessage,
      spotifyReason: params.err.spotifyReason,
      deviceType: params.state?.activeDevice?.type ?? null,
      deviceRestricted: params.state?.activeDevice?.isRestricted ?? null,
      trackLoaded: Boolean(params.state?.playback),
      isPlaying: params.state?.playback?.isPlaying ?? null,
      usedFallbackDevice: params.usedFallbackDevice,
    })}`
  );
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
    return new Response("Invalid action. Use one of: play_game, play_track, pause, resume, next, previous, seek, play_break, resume_from_track.", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let deviceId = asString(payload.deviceId) ?? undefined;
  let usedFallbackDevice = false;
  let devices: SpotifyLiveDevice[] | null = null;

  try {
    let result: { warnings: string[]; debug?: Record<string, unknown> };
    try {
      result = await runCommand({ action, payload, accessToken, deviceId });
    } catch (err) {
      if (
        !deviceId &&
        err instanceof SpotifyLiveError &&
        err.code === "NO_ACTIVE_DEVICE" &&
        PLAY_ACTIONS.has(action)
      ) {
        // Spotify only obeys an active device. When the host laptop's app is
        // open but idle there is no active device, so send the music to it
        // directly, provided it is the only one that could be meant.
        devices = await listDevices(accessToken).catch(() => null);
        const fallback = devices ? pickFallbackDevice(devices) : null;
        if (!fallback?.id) throw err;
        deviceId = fallback.id;
        usedFallbackDevice = true;
        console.info(
          `[spotify-live] no active device; sending ${action} to the only open device ${JSON.stringify({ deviceType: fallback.type })}`
        );
        result = await runCommand({ action, payload, accessToken, deviceId });
      } else {
        throw err;
      }
    }

    let state: SpotifyLiveState | null;
    let hostWarning: string | null = result.warnings[0] ?? null;
    if (PLAY_ACTIONS.has(action)) {
      const confirmation = await confirmPlaybackStarted({ accessToken });
      state = confirmation.state ?? (await safePlaybackState(accessToken));
      const logDetail = JSON.stringify({
        action,
        deviceType: state?.activeDevice?.type ?? null,
        trackLoaded: Boolean(state?.playback),
        isPlaying: state?.playback?.isPlaying ?? null,
        usedFallbackDevice,
        ...result.debug,
        ...state?.diagnostics,
      });
      if (!confirmation.confirmed) {
        hostWarning = state?.activeDevice
          ? `Spotify accepted that, but nothing is playing on ${deviceLabel(state.activeDevice)} yet. If there is no music in a few seconds, open the Spotify app on that device and press play.`
          : "Spotify accepted that, but no Spotify device is playing. Open the Spotify app on the host laptop and press play once.";
        console.warn(`[spotify-live] playback not confirmed ${logDetail}`);
      } else {
        console.info(`[spotify-live] playback confirmed ${logDetail}`);
      }
    } else {
      state = await safePlaybackState(accessToken);
    }

    const response = NextResponse.json(
      {
        ok: true,
        action,
        connected: true,
        canControlPlayback: state?.canControlPlayback ?? true,
        activeDevice: state?.activeDevice ?? null,
        playback: state?.playback ?? null,
        warnings: [...result.warnings, ...(state?.warnings ?? [])],
        hostWarning,
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

      // Spotify refuses to pause what is already paused and to resume what is
      // already playing. The host asked for the state the player is in, so
      // that is a success, not an error banner in the middle of a show.
      const alreadyInState =
        (action === "pause" &&
          (err.code === "NO_ACTIVE_DEVICE" || (err.code === "RESTRICTED" && !state?.playback?.isPlaying))) ||
        (action === "resume" && err.code === "RESTRICTED" && Boolean(state?.playback?.isPlaying));
      if (alreadyInState) {
        const response = NextResponse.json(
          {
            ok: true,
            action,
            connected: true,
            canControlPlayback: state?.canControlPlayback ?? false,
            activeDevice: state?.activeDevice ?? null,
            playback: state?.playback ?? null,
            warnings: state?.warnings ?? [],
            hostWarning: null,
          },
          { headers: { "Cache-Control": "no-store" } }
        );
        applyTokenCookies(response, tokenResult, secure);
        return response;
      }

      if (err.code === "NO_ACTIVE_DEVICE" && PLAY_ACTIONS.has(action) && devices === null) {
        devices = await listDevices(accessToken).catch(() => null);
      }
      const message = describeFailure({ action, err, state, devices });
      logCommandFailure({ action, err, state, usedFallbackDevice });

      const response = NextResponse.json(
        {
          ok: false,
          action,
          connected: true,
          canControlPlayback: state?.canControlPlayback ?? false,
          activeDevice: state?.activeDevice ?? null,
          playback: state?.playback ?? null,
          warnings: [...(state?.warnings ?? []), message],
          error: {
            code: err.code,
            message,
          },
        },
        {
          status:
            err.code === "NO_ACTIVE_DEVICE" || err.code === "PREMIUM_REQUIRED" || err.code === "RESTRICTED"
              ? 409
              : 400,
          headers: { "Cache-Control": "no-store" },
        }
      );
      applyTokenCookies(response, tokenResult, secure);
      return response;
    }

    const msg = err instanceof Error ? err.message : "Live Spotify command failed.";
    console.error(`[spotify-live] command crashed ${JSON.stringify({ action, message: msg })}`);
    return new Response(msg, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
