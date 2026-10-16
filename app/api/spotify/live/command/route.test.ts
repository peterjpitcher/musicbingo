import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { spotifyApiRequest } from "@/lib/spotifyWeb";

import { POST } from "./route";

vi.mock("@/lib/spotifyWeb", () => ({
  SPOTIFY_COOKIE_ACCESS: "spotify_access_cache",
  getOrRefreshAccessToken: vi.fn(async () => ({
    accessToken: "token",
    newRefreshToken: null,
    newCacheValue: null,
    newCacheMaxAge: null,
  })),
  spotifyApiRequest: vi.fn(),
}));

const mockedSpotifyApiRequest = vi.mocked(spotifyApiRequest);

type FakeDevice = { id: string; name: string; type: string; is_active: boolean; is_restricted: boolean };

/**
 * A small stand-in for Spotify's player API with the behaviour that matters
 * here: it answers 403 "Restriction violated" when a command does not fit the
 * current state, and 404 when no device is active.
 */
class FakeSpotify {
  devices: FakeDevice[] = [];
  trackId: string | null = null;
  isPlaying = false;
  /** A device that accepts commands but never actually plays (asleep or stuck). */
  stuck = false;
  /** Tracks this account cannot play. */
  unavailableTracks = new Set<string>();
  /** Albums Spotify refuses to start, to exercise the bare-track fallback. */
  refusedAlbums = false;
  calls: Array<{ method: string; path: string; deviceId: string | null; body: any }> = [];

  get active(): FakeDevice | null {
    return this.devices.find((device) => device.is_active) ?? null;
  }

  handle(url: string, init?: RequestInit): Response {
    const parsed = new URL(url);
    const method = init?.method ?? "GET";
    const path = parsed.pathname.replace("/v1", "");
    const deviceId = parsed.searchParams.get("device_id");
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    this.calls.push({ method, path, deviceId, body });

    if (method === "GET" && path === "/me/player/devices") {
      return Response.json({ devices: this.devices });
    }
    if (method === "GET" && path.startsWith("/tracks/")) {
      const id = path.replace("/tracks/", "");
      return Response.json({
        id,
        album: { uri: `spotify:album:album-of-${id}` },
        is_playable: !this.unavailableTracks.has(id),
        ...(this.unavailableTracks.has(id) ? { restrictions: { reason: "market" } } : {}),
      });
    }
    if (method === "GET" && path === "/me/player") {
      if (!this.active) return new Response(null, { status: 204 });
      return Response.json({
        device: this.active,
        is_playing: this.isPlaying,
        progress_ms: 0,
        item: this.trackId
          ? { id: this.trackId, name: "Song", duration_ms: 200_000, artists: [], album: { images: [] } }
          : null,
      });
    }

    const noActiveDevice = () =>
      Response.json(
        { error: { status: 404, message: "Player command failed: No active device found", reason: "NO_ACTIVE_DEVICE" } },
        { status: 404 }
      );
    const target = deviceId ? this.devices.find((device) => device.id === deviceId) : this.active;
    if (!target) return noActiveDevice();
    // Worst case for an idle app: only a play command wakes it; anything
    // else sent to it before then is turned away.
    if (!target.is_active && path !== "/me/player/play") return noActiveDevice();
    for (const device of this.devices) device.is_active = device === target;

    const refuse = () =>
      Response.json(
        { error: { status: 403, message: "Player command failed: Restriction violated", reason: "UNKNOWN" } },
        { status: 403 }
      );
    const ok = () => new Response(null, { status: 204 });

    if (path === "/me/player/pause") {
      if (!this.isPlaying) return refuse();
      this.isPlaying = false;
      return ok();
    }
    if (path === "/me/player/play") {
      if (!body) {
        if (this.isPlaying || !this.trackId) return refuse();
        this.isPlaying = !this.stuck;
        return ok();
      }
      if (typeof body.context_uri === "string" && body.context_uri.startsWith("spotify:playlist:37i9dQZF1")) {
        return refuse();
      }
      if (typeof body.context_uri === "string" && body.context_uri.startsWith("spotify:album:")) {
        if (this.refusedAlbums) return refuse();
        if (this.stuck) {
          this.trackId = null;
          this.isPlaying = false;
          return ok();
        }
        this.trackId = String(body.offset?.uri ?? "").replace("spotify:track:", "");
        this.isPlaying = true;
        return ok();
      }
      if (this.stuck) {
        this.trackId = null;
        this.isPlaying = false;
        return ok();
      }
      this.trackId = body.uris?.[0]?.replace("spotify:track:", "") ?? "playlist-track-1";
      this.isPlaying = true;
      return ok();
    }
    if (path === "/me/player/next" || path === "/me/player/previous" || path === "/me/player/seek") {
      return this.trackId ? ok() : refuse();
    }
    if (path === "/me/player/shuffle") return ok();
    throw new Error(`Unexpected Spotify call ${method} ${path}`);
  }
}

function command(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://musicbingo.test/api/spotify/live/command", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", cookie: "spotify_refresh_token=refresh" },
  });
}

function laptop(overrides: Partial<FakeDevice> = {}): FakeDevice {
  return { id: "laptop", name: "Host laptop", type: "Computer", is_active: true, is_restricted: false, ...overrides };
}

describe("POST /api/spotify/live/command", () => {
  let spotify: FakeSpotify;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spotify = new FakeSpotify();
    mockedSpotifyApiRequest.mockReset();
    mockedSpotifyApiRequest.mockImplementation(async (params) => spotify.handle(params.url, params.init));
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("explains a refused skip when nothing is loaded (16 October 2026) and logs it", async () => {
    spotify.devices = [laptop()];

    const res = await POST(command({ action: "next" }));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe("RESTRICTED");
    expect(data.error.message).toMatch(/nothing is loaded/i);
    expect(data.error.message).not.toMatch(/unavailable|premium/i);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[spotify-live] command failed"));
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("Host laptop");
  });

  it("treats pausing something already paused as done", async () => {
    spotify.devices = [laptop()];
    spotify.trackId = "song";
    spotify.isPlaying = false;

    const res = await POST(command({ action: "pause" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.error).toBeUndefined();
  });

  it("treats pausing with no active device as done", async () => {
    const res = await POST(command({ action: "pause" }));

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("treats resuming something already playing as done", async () => {
    spotify.devices = [laptop()];
    spotify.trackId = "song";
    spotify.isPlaying = true;

    const res = await POST(command({ action: "resume" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.hostWarning).toBeNull();
  });

  it("sends music to the only open Spotify app when none is active", async () => {
    spotify.devices = [laptop({ is_active: false })];

    const res = await POST(command({ action: "play_track", trackId: "welcome" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.playback.trackId).toBe("welcome");
    const plays = spotify.calls.filter((call) => call.path === "/me/player/play");
    expect(plays.map((call) => call.deviceId)).toEqual([null, "laptop"]);
  });

  it("starts a game on the only open Spotify app even though it was idle", async () => {
    spotify.devices = [laptop({ is_active: false })];

    const res = await POST(command({ action: "play_game", playlistId: "game1playlist" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.playback.isPlaying).toBe(true);
    expect(data.hostWarning).toBeNull();
    const plays = spotify.calls.filter((call) => call.path === "/me/player/play");
    expect(plays.at(-1)?.deviceId).toBe("laptop");
    expect(plays.at(-1)?.body.offset).toEqual({ position: 0 });
    // Shuffle was refused while the app was idle, so it is set again once
    // the game is playing.
    const shuffles = spotify.calls.filter((call) => call.path === "/me/player/shuffle");
    expect(shuffles.at(-1)?.deviceId).toBe("laptop");
    expect(spotify.calls.indexOf(shuffles.at(-1)!)).toBeGreaterThan(spotify.calls.indexOf(plays.at(-1)!));
  });

  it("names the open apps instead of guessing between them", async () => {
    spotify.devices = [
      laptop({ is_active: false }),
      { id: "phone", name: "Phone", type: "Smartphone", is_active: false, is_restricted: false },
    ];

    const res = await POST(command({ action: "play_game", playlistId: "game1playlist" }));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error.code).toBe("NO_ACTIVE_DEVICE");
    expect(data.error.message).toContain('"Host laptop"');
    expect(data.error.message).toContain('"Phone"');
    expect(spotify.calls.some((call) => call.path === "/me/player/play" && call.deviceId)).toBe(false);
  });

  it("says Spotify is not open when there is no device at all", async () => {
    const res = await POST(command({ action: "play_track", trackId: "welcome" }));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error.message).toMatch(/not open on any device/i);
  });

  it("warns the host when Spotify accepts a play command but nothing plays", async () => {
    spotify.devices = [laptop()];
    spotify.stuck = true;

    const res = await POST(command({ action: "play_track", trackId: "welcome" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.hostWarning).toMatch(/nothing is playing on "Host laptop"/i);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[spotify-live] playback not confirmed"));
  }, 10_000);

  it("pauses the game when Spotify will not start a Spotify-owned break playlist", async () => {
    spotify.devices = [laptop()];
    spotify.trackId = "game-song";
    spotify.isPlaying = true;

    const res = await POST(
      command({ action: "play_break", playlistId: "https://open.spotify.com/playlist/37i9dQZF1DX2GKumqRIZ7g?si=x" })
    );
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error.code).toBe("RESTRICTED");
    expect(data.error.message).toMatch(/Spotify-owned playlist/);
    expect(data.error.message).toMatch(/Game music is paused/);
    expect(spotify.calls.some((call) => call.path === "/me/player/pause")).toBe(true);
    expect(spotify.isPlaying).toBe(false);
  });

  it("plays a single song inside its album rather than as a bare track list", async () => {
    spotify.devices = [laptop()];

    const res = await POST(command({ action: "play_track", trackId: "welcome" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.playback.trackId).toBe("welcome");
    expect(data.hostWarning).toBeNull();
    const lookup = spotify.calls.find((call) => call.path === "/tracks/welcome");
    expect(lookup).toBeDefined();
    const play = spotify.calls.find((call) => call.path === "/me/player/play");
    expect(play?.body).toEqual({
      context_uri: "spotify:album:album-of-welcome",
      offset: { uri: "spotify:track:welcome" },
      position_ms: 0,
    });
  });

  it("falls back to the bare track when Spotify refuses the album", async () => {
    spotify.devices = [laptop()];
    spotify.refusedAlbums = true;

    const res = await POST(command({ action: "play_track", trackId: "welcome" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.playback.trackId).toBe("welcome");
    const plays = spotify.calls.filter((call) => call.path === "/me/player/play");
    expect(plays.at(-1)?.body).toEqual({ uris: ["spotify:track:welcome"], position_ms: 0 });
  });

  it("says when the account cannot play the song instead of sending it", async () => {
    spotify.devices = [laptop()];
    spotify.unavailableTracks.add("welcome");

    const res = await POST(command({ action: "play_track", trackId: "welcome" }));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error.message).toMatch(/not available on this Spotify account/);
    expect(spotify.calls.some((call) => call.path === "/me/player/play")).toBe(false);
  });

  it("starts a game normally and confirms it is playing", async () => {
    spotify.devices = [laptop()];

    const res = await POST(command({ action: "play_game", playlistId: "game1playlist" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.hostWarning).toBeNull();
    expect(data.playback.isPlaying).toBe(true);
  });
});
