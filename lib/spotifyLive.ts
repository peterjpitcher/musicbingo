import { normalizePlaylistId } from "@/lib/spotifyPlaylistId";
import { spotifyApiRequest } from "@/lib/spotifyWeb";

/**
 * RESTRICTED is Spotify's 403 "Player command failed: Restriction violated":
 * the command does not fit the player's current state (pausing when already
 * paused, skipping with nothing loaded or nothing to skip to, starting a
 * playlist the app may not play). It is not a Premium or permissions problem.
 */
export type SpotifyLiveErrorCode =
  | "NO_ACTIVE_DEVICE"
  | "PREMIUM_REQUIRED"
  | "RESTRICTED"
  | "TOKEN_INVALID"
  | "API_ERROR";

export class SpotifyLiveError extends Error {
  readonly code: SpotifyLiveErrorCode;
  /** HTTP status Spotify returned, when the error came from a Spotify response. */
  readonly httpStatus: number | null;
  /** Spotify's own error text and reason, kept for server logs. */
  readonly spotifyMessage: string | null;
  readonly spotifyReason: string | null;

  constructor(
    code: SpotifyLiveErrorCode,
    message: string,
    details?: { httpStatus?: number; spotifyMessage?: string | null; spotifyReason?: string | null }
  ) {
    super(message);
    this.name = "SpotifyLiveError";
    this.code = code;
    this.httpStatus = details?.httpStatus ?? null;
    this.spotifyMessage = details?.spotifyMessage ?? null;
    this.spotifyReason = details?.spotifyReason ?? null;
  }
}

export type SpotifyLiveDevice = {
  id: string | null;
  name: string;
  type: string;
  isActive: boolean;
  isRestricted: boolean;
};

export type SpotifyLivePlayback = {
  trackId: string | null;
  title: string;
  artist: string;
  albumImageUrl: string | null;
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
};

export type SpotifyLiveState = {
  canControlPlayback: boolean;
  activeDevice: SpotifyLiveDevice | null;
  playback: SpotifyLivePlayback | null;
  warnings: string[];
  /** Extra player detail for server logs only; never sent to the browser. */
  diagnostics?: {
    currentlyPlayingType: string | null;
    contextUri: string | null;
    disallows: string[];
    volumePercent: number | null;
  };
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function ensureHttpError(response: Response, fallbackMessage: string): never {
  throw new SpotifyLiveError("API_ERROR", `${fallbackMessage} (HTTP ${response.status})`);
}

type SpotifyErrorBody = { message: string | null; reason: string | null };

async function parseSpotifyError(response: Response): Promise<SpotifyErrorBody> {
  // Read the body once as text: a failed .json() would leave nothing to fall back on.
  const text = await response.text().catch(() => "");
  try {
    const json = JSON.parse(text) as { error?: { message?: unknown; reason?: unknown } };
    return {
      message: asString(json?.error?.message) ?? asString((json as any)?.error_description),
      reason: asString(json?.error?.reason),
    };
  } catch {
    return { message: asString(text), reason: null };
  }
}

export function mapHttpError(params: {
  status: number;
  message: string | null;
  reason: string | null;
}): SpotifyLiveError {
  const details = {
    httpStatus: params.status,
    spotifyMessage: params.message,
    spotifyReason: params.reason,
  };
  const spotifyText = [params.message, params.reason && params.reason !== "UNKNOWN" ? params.reason : null]
    .filter(Boolean)
    .join(": ");

  if (params.status === 401) {
    return new SpotifyLiveError(
      "TOKEN_INVALID",
      "Spotify session expired. Reconnect Spotify and try again.",
      details
    );
  }
  if (params.status === 403) {
    const premium =
      params.reason === "PREMIUM_REQUIRED" || /premium/i.test(params.message ?? "");
    if (premium) {
      return new SpotifyLiveError(
        "PREMIUM_REQUIRED",
        "Spotify Premium is required to control playback from this screen.",
        details
      );
    }
    return new SpotifyLiveError(
      "RESTRICTED",
      `Spotify refused that command in its current state${spotifyText ? ` (${spotifyText})` : ""}.`,
      details
    );
  }
  if (params.status === 404) {
    return new SpotifyLiveError(
      "NO_ACTIVE_DEVICE",
      "No active Spotify playback device. Open Spotify on your host device and start playback first.",
      details
    );
  }
  return new SpotifyLiveError(
    "API_ERROR",
    params.message || `Spotify API error (HTTP ${params.status})`,
    details
  );
}

function parseDevice(json: unknown): SpotifyLiveDevice | null {
  if (!json || typeof json !== "object") return null;
  const device = (json as any).device;
  if (!device || typeof device !== "object") return null;

  return {
    id: asString(device.id),
    name: asString(device.name) ?? "Spotify Device",
    type: asString(device.type) ?? "Unknown",
    isActive: Boolean(device.is_active),
    isRestricted: Boolean(device.is_restricted),
  };
}

function parsePlayback(json: unknown): SpotifyLivePlayback | null {
  if (!json || typeof json !== "object") return null;

  const item = (json as any).item;
  if (!item || typeof item !== "object") return null;

  const artistsRaw: unknown[] = Array.isArray((item as any).artists) ? (item as any).artists : [];
  const artist = artistsRaw
    .map((entry: unknown) => (entry && typeof entry === "object" ? asString((entry as any).name) : null))
    .filter((value: string | null): value is string => Boolean(value))
    .join(", ");

  const imagesRaw: unknown[] = Array.isArray((item as any).album?.images) ? (item as any).album.images : [];
  const albumImageUrl = imagesRaw
    .map((entry: unknown) => (entry && typeof entry === "object" ? asString((entry as any).url) : null))
    .filter((value: string | null): value is string => Boolean(value))[0] ?? null;

  return {
    trackId: asString((item as any).id),
    title: asString((item as any).name) ?? "",
    artist,
    albumImageUrl,
    progressMs: asNumber((json as any).progress_ms) ?? 0,
    durationMs: asNumber((item as any).duration_ms) ?? 0,
    isPlaying: Boolean((json as any).is_playing),
  };
}

function buildStateFromResponse(json: unknown): SpotifyLiveState {
  const activeDevice = parseDevice(json);
  const playback = parsePlayback(json);
  const warnings: string[] = [];

  if (!activeDevice) {
    warnings.push("No active Spotify device detected.");
  }

  if (activeDevice?.isRestricted) {
    warnings.push("Spotify device is restricted and cannot be controlled from the API.");
  }

  if (!playback) {
    warnings.push("No currently playing track detected.");
  }

  const raw = (json && typeof json === "object" ? json : {}) as any;
  const disallowsRaw = raw.actions?.disallows;
  return {
    canControlPlayback: Boolean(activeDevice && !activeDevice.isRestricted),
    activeDevice,
    playback,
    warnings,
    diagnostics: {
      currentlyPlayingType: asString(raw.currently_playing_type),
      contextUri: asString(raw.context?.uri),
      disallows:
        disallowsRaw && typeof disallowsRaw === "object"
          ? Object.keys(disallowsRaw).filter((key) => disallowsRaw[key] === true)
          : [],
      volumePercent: asNumber(raw.device?.volume_percent),
    },
  };
}

export async function getPlaybackState(accessToken: string): Promise<SpotifyLiveState> {
  const res = await spotifyApiRequest({
    accessToken,
    url: "https://api.spotify.com/v1/me/player",
    init: { method: "GET" },
  });

  if (res.status === 204) {
    return {
      canControlPlayback: false,
      activeDevice: null,
      playback: null,
      warnings: ["No active Spotify playback session detected."],
    };
  }

  if (!res.ok) {
    throw mapHttpError({ status: res.status, ...(await parseSpotifyError(res)) });
  }

  const json = await res.json().catch(() => ({}));
  return buildStateFromResponse(json);
}

/**
 * Spotify apps that are open and signed in, active or not. Needs the
 * user-read-playback-state scope, which the app already requests.
 */
export async function listDevices(accessToken: string): Promise<SpotifyLiveDevice[]> {
  const res = await spotifyApiRequest({
    accessToken,
    url: "https://api.spotify.com/v1/me/player/devices",
    init: { method: "GET" },
  });

  if (!res.ok) {
    throw mapHttpError({ status: res.status, ...(await parseSpotifyError(res)) });
  }

  const json = (await res.json().catch(() => ({}))) as { devices?: unknown };
  const raw: unknown[] = Array.isArray(json.devices) ? json.devices : [];
  return raw
    .map((device) => parseDevice({ device }))
    .filter((device): device is SpotifyLiveDevice => device !== null);
}

/**
 * The device to send playback to when Spotify has no active device: the one
 * Spotify app that is open and controllable. With none, or several, there is
 * no safe guess, so the host is asked to press play on the right one instead.
 */
export function pickFallbackDevice(devices: SpotifyLiveDevice[]): SpotifyLiveDevice | null {
  if (devices.some((device) => device.isActive)) return null;
  const candidates = devices.filter((device) => device.id && !device.isRestricted);
  return candidates.length === 1 ? candidates[0] : null;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Spotify accepts a play command before the device acts on it, and a device
 * that is asleep or stuck can accept one and never play (16 October 2026: the
 * welcome song was "sent" three times and nothing played). Re-read the player
 * a few times so the host is told about silence instead of the screen
 * implying the music started.
 */
export async function confirmPlaybackStarted(params: {
  accessToken: string;
  delaysMs?: number[];
  wait?: (ms: number) => Promise<void>;
}): Promise<{ confirmed: boolean; state: SpotifyLiveState | null }> {
  const wait = params.wait ?? sleep;
  let state: SpotifyLiveState | null = null;
  for (const delayMs of params.delaysMs ?? [400, 700, 900]) {
    await wait(delayMs);
    try {
      state = await getPlaybackState(params.accessToken);
    } catch {
      continue;
    }
    if (state.playback?.isPlaying) return { confirmed: true, state };
  }
  return { confirmed: false, state };
}

async function runPlayerCommand(params: {
  accessToken: string;
  method: "PUT" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
  actionLabel: string;
}): Promise<void> {
  const url = new URL(`https://api.spotify.com/v1${params.path}`);
  if (params.query) {
    for (const [key, value] of Object.entries(params.query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  const res = await spotifyApiRequest({
    accessToken: params.accessToken,
    url: url.toString(),
    init: {
      method: params.method,
      headers: {
        ...(params.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(params.body ? { body: JSON.stringify(params.body) } : {}),
    },
  });

  if (res.status === 204 || res.status === 202) return;

  if (!res.ok) {
    throw mapHttpError({ status: res.status, ...(await parseSpotifyError(res)) });
  }

  if (res.status >= 200 && res.status < 300) return;
  ensureHttpError(res, `${params.actionLabel} failed`);
}

/**
 * Set shuffle, then play. Shuffle goes first so a game really starts at its
 * first track and runs in order. Spotify can refuse the toggle in some states
 * (while a single intro track is loaded, or on an idle device that the play
 * command is about to wake); that must not stop the music starting, so a
 * refusal is retried once the playlist is playing, and a second refusal
 * becomes a warning for the host instead of a failed command. Only an expired
 * login stops it, because the play command would fail the same way.
 */
async function playWithShuffleState(params: {
  accessToken: string;
  deviceId?: string;
  shuffle: boolean;
  play: () => Promise<void>;
}): Promise<{ warnings: string[] }> {
  const isNonFatal = (err: unknown): boolean =>
    err instanceof SpotifyLiveError && err.code !== "TOKEN_INVALID";
  const applyShuffle = () =>
    setShuffleMode({
      accessToken: params.accessToken,
      state: params.shuffle,
      deviceId: params.deviceId,
    });

  let shuffleApplied = true;
  try {
    await applyShuffle();
  } catch (err) {
    if (!isNonFatal(err)) throw err;
    shuffleApplied = false;
  }

  await params.play();
  if (shuffleApplied) return { warnings: [] };

  try {
    await applyShuffle();
    return { warnings: [] };
  } catch (err) {
    if (!isNonFatal(err)) throw err;
    return {
      warnings: [
        params.shuffle
          ? "Spotify would not switch shuffle on for this playlist, so it will play in order."
          : "Spotify would not switch shuffle off. Turn shuffle off in the Spotify app so the songs play in order.",
      ],
    };
  }
}

export async function startPlaylistPlayback(params: {
  accessToken: string;
  playlistId: string;
  deviceId?: string;
  shuffle?: boolean;
}): Promise<{ warnings: string[] }> {
  const normalizedPlaylistId = normalizePlaylistId(params.playlistId);
  if (!normalizedPlaylistId) {
    throw new SpotifyLiveError("API_ERROR", "Invalid playlist id for live playback.");
  }

  const shuffle = params.shuffle ?? false;
  return playWithShuffleState({
    accessToken: params.accessToken,
    deviceId: params.deviceId,
    shuffle,
    play: () =>
      runPlayerCommand({
        accessToken: params.accessToken,
        method: "PUT",
        path: "/me/player/play",
        query: { device_id: params.deviceId },
        body: {
          context_uri: `spotify:playlist:${normalizedPlaylistId}`,
          position_ms: 0,
          ...(shuffle ? {} : { offset: { position: 0 } }),
        },
        actionLabel: "Start playback",
      }),
  });
}

/** Restart a specific track from position 0 within its playlist, shuffle off. */
export async function startTrackInPlaylistPlayback(params: {
  accessToken: string;
  playlistId: string;
  trackId: string;
  deviceId?: string;
}): Promise<{ warnings: string[] }> {
  const normalizedPlaylistId = normalizePlaylistId(params.playlistId);
  if (!normalizedPlaylistId) {
    throw new SpotifyLiveError("API_ERROR", "Invalid playlist id for resume.");
  }

  return playWithShuffleState({
    accessToken: params.accessToken,
    deviceId: params.deviceId,
    shuffle: false,
    play: () =>
      runPlayerCommand({
        accessToken: params.accessToken,
        method: "PUT",
        path: "/me/player/play",
        query: { device_id: params.deviceId },
        body: {
          context_uri: `spotify:playlist:${normalizedPlaylistId}`,
          offset: { uri: `spotify:track:${params.trackId}` },
          position_ms: 0,
        },
        actionLabel: "Resume track from beginning",
      }),
  });
}

export async function setShuffleMode(params: {
  accessToken: string;
  state: boolean;
  deviceId?: string;
}): Promise<void> {
  await runPlayerCommand({
    accessToken: params.accessToken,
    method: "PUT",
    path: "/me/player/shuffle",
    query: {
      state: params.state ? "true" : "false",
      device_id: params.deviceId,
    },
    actionLabel: params.state ? "Enable shuffle" : "Disable shuffle",
  });
}

export type AccountTrack = {
  /** The id this account can play: Spotify swaps in a relinked copy when the original is not available. */
  id: string;
  albumUri: string | null;
  isPlayable: boolean | null;
  restrictionReason: string | null;
  relinkedFrom: string | null;
};

/** Look a track up as the signed-in account sees it, so playback uses a version that account can play. */
export async function resolveTrackForAccount(accessToken: string, trackId: string): Promise<AccountTrack | null> {
  const res = await spotifyApiRequest({
    accessToken,
    url: `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}?market=from_token`,
    init: { method: "GET" },
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as any;
  const id = asString(json?.id);
  if (!id) return null;
  return {
    id,
    albumUri: asString(json?.album?.uri),
    isPlayable: typeof json?.is_playable === "boolean" ? json.is_playable : null,
    restrictionReason: asString(json?.restrictions?.reason),
    relinkedFrom: asString(json?.linked_from?.id),
  };
}

/**
 * Play one song (welcome or intro). On 16 October 2026 the host Mac's Spotify
 * app stopped dead every time it was sent a bare one-track list, while
 * playlist starts worked, so the song is started inside its album instead,
 * the same way playlists are started. The bare track list is only a fallback
 * for when the album cannot be used.
 */
export async function playTrackByUri(params: {
  accessToken: string;
  trackId: string;
  deviceId?: string;
}): Promise<{ track: AccountTrack | null; via: "album" | "uris" }> {
  const track = await resolveTrackForAccount(params.accessToken, params.trackId).catch(() => null);
  if (track && track.isPlayable === false) {
    throw new SpotifyLiveError(
      "RESTRICTED",
      `That song is not available on this Spotify account${track.restrictionReason ? ` (${track.restrictionReason})` : ""}. Choose a different song.`
    );
  }
  const trackUri = `spotify:track:${track?.id ?? params.trackId}`;

  if (track?.albumUri) {
    try {
      await runPlayerCommand({
        accessToken: params.accessToken,
        method: "PUT",
        path: "/me/player/play",
        query: { device_id: params.deviceId },
        body: {
          context_uri: track.albumUri,
          offset: { uri: trackUri },
          position_ms: 0,
        },
        actionLabel: "Play single track",
      });
      return { track, via: "album" };
    } catch (err) {
      // A missing device or expired login fails the same way below; only
      // fall back when Spotify turned down the album itself.
      if (!(err instanceof SpotifyLiveError) || err.code === "NO_ACTIVE_DEVICE" || err.code === "TOKEN_INVALID") {
        throw err;
      }
    }
  }

  await runPlayerCommand({
    accessToken: params.accessToken,
    method: "PUT",
    path: "/me/player/play",
    query: { device_id: params.deviceId },
    body: {
      uris: [trackUri],
      position_ms: 0,
    },
    actionLabel: "Play single track",
  });
  return { track, via: "uris" };
}

export async function pausePlayback(params: { accessToken: string; deviceId?: string }): Promise<void> {
  await runPlayerCommand({
    accessToken: params.accessToken,
    method: "PUT",
    path: "/me/player/pause",
    query: { device_id: params.deviceId },
    actionLabel: "Pause playback",
  });
}

export async function resumePlayback(params: { accessToken: string; deviceId?: string }): Promise<void> {
  await runPlayerCommand({
    accessToken: params.accessToken,
    method: "PUT",
    path: "/me/player/play",
    query: { device_id: params.deviceId },
    actionLabel: "Resume playback",
  });
}

export async function skipNext(params: { accessToken: string; deviceId?: string }): Promise<void> {
  await runPlayerCommand({
    accessToken: params.accessToken,
    method: "POST",
    path: "/me/player/next",
    query: { device_id: params.deviceId },
    actionLabel: "Skip next",
  });
}

export async function skipPrevious(params: { accessToken: string; deviceId?: string }): Promise<void> {
  await runPlayerCommand({
    accessToken: params.accessToken,
    method: "POST",
    path: "/me/player/previous",
    query: { device_id: params.deviceId },
    actionLabel: "Skip previous",
  });
}

export async function seekToPositionMs(params: {
  accessToken: string;
  positionMs: number;
  deviceId?: string;
}): Promise<void> {
  const positionMs = Math.max(0, Math.floor(params.positionMs));

  await runPlayerCommand({
    accessToken: params.accessToken,
    method: "PUT",
    path: "/me/player/seek",
    query: {
      position_ms: positionMs,
      device_id: params.deviceId,
    },
    actionLabel: "Seek playback",
  });
}
