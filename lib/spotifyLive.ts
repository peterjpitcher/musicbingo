import { spotifyApiRequest } from "@/lib/spotifyWeb";

export type SpotifyLiveErrorCode = "NO_ACTIVE_DEVICE" | "PREMIUM_REQUIRED" | "TOKEN_INVALID" | "API_ERROR";

export class SpotifyLiveError extends Error {
  readonly code: SpotifyLiveErrorCode;

  constructor(code: SpotifyLiveErrorCode, message: string) {
    super(message);
    this.name = "SpotifyLiveError";
    this.code = code;
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

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { error?: { message?: unknown; reason?: unknown } };
    const message = asString(json?.error?.message) ?? asString((json as any)?.error_description);
    const reason = asString(json?.error?.reason);
    if (message && reason) return `${message} (${reason})`;
    if (message) return message;
    if (reason) return reason;
  } catch {
    const text = await response.text().catch(() => "");
    if (text.trim()) return text.trim();
  }
  return `Spotify API error (HTTP ${response.status})`;
}

function mapHttpError(params: { status: number; message: string }): SpotifyLiveError {
  if (params.status === 401) {
    return new SpotifyLiveError("TOKEN_INVALID", "Spotify session expired. Reconnect Spotify and try again.");
  }
  if (params.status === 403) {
    return new SpotifyLiveError(
      "PREMIUM_REQUIRED",
      `Spotify playback control unavailable: ${params.message || "Premium account or playback permissions required."}`
    );
  }
  if (params.status === 404) {
    return new SpotifyLiveError(
      "NO_ACTIVE_DEVICE",
      "No active Spotify playback device. Open Spotify on your host device and start playback first."
    );
  }
  return new SpotifyLiveError("API_ERROR", params.message || `Spotify API error (HTTP ${params.status})`);
}

function normalizePlaylistId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const uriMatch = trimmed.match(/^spotify:playlist:([a-zA-Z0-9]+)$/);
  if (uriMatch) return uriMatch[1] ?? null;

  const urlMatch = trimmed.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/i);
  if (urlMatch) return urlMatch[1] ?? null;

  if (/^[a-zA-Z0-9]+$/.test(trimmed)) return trimmed;
  return null;
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

  return {
    canControlPlayback: Boolean(activeDevice && !activeDevice.isRestricted),
    activeDevice,
    playback,
    warnings,
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
    const message = await parseErrorMessage(res);
    throw mapHttpError({ status: res.status, message });
  }

  const json = await res.json().catch(() => ({}));
  return buildStateFromResponse(json);
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
    const message = await parseErrorMessage(res);
    throw mapHttpError({ status: res.status, message });
  }

  if (res.status >= 200 && res.status < 300) return;
  ensureHttpError(res, `${params.actionLabel} failed`);
}

export async function startPlaylistPlayback(params: {
  accessToken: string;
  playlistId: string;
  deviceId?: string;
}): Promise<void> {
  const normalizedPlaylistId = normalizePlaylistId(params.playlistId);
  if (!normalizedPlaylistId) {
    throw new SpotifyLiveError("API_ERROR", "Invalid playlist id for live playback.");
  }

  await runPlayerCommand({
    accessToken: params.accessToken,
    method: "PUT",
    path: "/me/player/play",
    query: { device_id: params.deviceId },
    body: {
      context_uri: `spotify:playlist:${normalizedPlaylistId}`,
      offset: { position: 0 },
      position_ms: 0,
    },
    actionLabel: "Start playback",
  });
}

/** Resume a specific track from position 0 within its playlist context. */
export async function startTrackInPlaylistPlayback(params: {
  accessToken: string;
  playlistId: string;
  trackId: string;
  deviceId?: string;
}): Promise<void> {
  const normalizedPlaylistId = normalizePlaylistId(params.playlistId);
  if (!normalizedPlaylistId) {
    throw new SpotifyLiveError("API_ERROR", "Invalid playlist id for resume.");
  }

  await runPlayerCommand({
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
  });
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
