import { beforeEach, describe, expect, it, vi } from "vitest";

import { spotifyApiRequest } from "@/lib/spotifyWeb";
import {
  confirmPlaybackStarted,
  listDevices,
  mapHttpError,
  pausePlayback,
  pickFallbackDevice,
  SpotifyLiveError,
  startPlaylistPlayback,
  type SpotifyLiveDevice,
} from "@/lib/spotifyLive";

vi.mock("@/lib/spotifyWeb", () => ({
  spotifyApiRequest: vi.fn(async () => new Response(null, { status: 204 })),
}));

const mockedSpotifyApiRequest = vi.mocked(spotifyApiRequest);

function restrictionViolated(): Response {
  return new Response(
    JSON.stringify({
      error: { status: 403, message: "Player command failed: Restriction violated", reason: "UNKNOWN" },
    }),
    { status: 403, headers: { "Content-Type": "application/json" } }
  );
}

function device(overrides: Partial<SpotifyLiveDevice> = {}): SpotifyLiveDevice {
  return {
    id: "device-1",
    name: "Host laptop",
    type: "Computer",
    isActive: false,
    isRestricted: false,
    ...overrides,
  };
}

describe("startPlaylistPlayback", () => {
  beforeEach(() => {
    mockedSpotifyApiRequest.mockReset();
    mockedSpotifyApiRequest.mockImplementation(async () => new Response(null, { status: 204 }));
  });

  it("turns shuffle off by default and starts at the first track", async () => {
    const result = await startPlaylistPlayback({ accessToken: "token", playlistId: "playlist123" });

    expect(result).toEqual({ warnings: [] });
    expect(mockedSpotifyApiRequest).toHaveBeenCalledTimes(2);
    expect(mockedSpotifyApiRequest.mock.calls[0]?.[0].url).toContain("/me/player/shuffle");
    expect(mockedSpotifyApiRequest.mock.calls[0]?.[0].url).toContain("state=false");

    const playBody = JSON.parse(String(mockedSpotifyApiRequest.mock.calls[1]?.[0].init?.body));
    expect(playBody).toEqual({
      context_uri: "spotify:playlist:playlist123",
      position_ms: 0,
      offset: { position: 0 },
    });
  });

  it("shuffles break playlists and starts them at a random song", async () => {
    mockedSpotifyApiRequest.mockImplementation(async (params) =>
      params.url.includes("/playlists/playlist123?fields=tracks.total")
        ? Response.json({ tracks: { total: 111 } })
        : new Response(null, { status: 204 })
    );

    await startPlaylistPlayback({ accessToken: "token", playlistId: "playlist123", shuffle: true });

    const urls = mockedSpotifyApiRequest.mock.calls.map((call) => call[0].url);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("/me/player/shuffle");
    expect(urls[0]).toContain("state=true");
    expect(urls[2]).toContain("/me/player/play");

    const playBody = JSON.parse(String(mockedSpotifyApiRequest.mock.calls[2]?.[0].init?.body));
    expect(playBody.context_uri).toBe("spotify:playlist:playlist123");
    expect(playBody.position_ms).toBe(0);
    expect(Number.isInteger(playBody.offset.position)).toBe(true);
    expect(playBody.offset.position).toBeGreaterThanOrEqual(0);
    expect(playBody.offset.position).toBeLessThan(111);
  });

  it("starts a Spotify-owned break playlist within its first ten songs", async () => {
    mockedSpotifyApiRequest.mockImplementation(async (params) =>
      params.url.includes("/playlists/")
        ? Response.json({ error: { status: 404, message: "Resource not found" } }, { status: 404 })
        : new Response(null, { status: 204 })
    );

    await startPlaylistPlayback({ accessToken: "token", playlistId: "37i9dQZF1DX2GKumqRIZ7g", shuffle: true });

    const play = mockedSpotifyApiRequest.mock.calls.find((call) => call[0].url.includes("/me/player/play"));
    const playBody = JSON.parse(String(play?.[0].init?.body));
    expect(playBody.offset.position).toBeGreaterThanOrEqual(0);
    expect(playBody.offset.position).toBeLessThan(10);
  });

  it("starts the break playlist from the top when Spotify refuses the random song", async () => {
    let plays = 0;
    mockedSpotifyApiRequest.mockImplementation(async (params) => {
      if (params.url.includes("/me/player/play")) {
        plays += 1;
        return plays === 1 ? restrictionViolated() : new Response(null, { status: 204 });
      }
      return new Response(null, { status: 204 });
    });

    await startPlaylistPlayback({ accessToken: "token", playlistId: "playlist123", shuffle: true });

    const playCalls = mockedSpotifyApiRequest.mock.calls.filter((call) => call[0].url.includes("/me/player/play"));
    expect(playCalls).toHaveLength(2);
    expect(JSON.parse(String(playCalls[1]?.[0].init?.body))).toEqual({
      context_uri: "spotify:playlist:playlist123",
      position_ms: 0,
    });
  });

  it("still starts the playlist when Spotify refuses the shuffle toggle, then retries it", async () => {
    mockedSpotifyApiRequest
      .mockImplementationOnce(async () => restrictionViolated())
      .mockImplementation(async () => new Response(null, { status: 204 }));

    const result = await startPlaylistPlayback({ accessToken: "token", playlistId: "playlist123" });

    expect(result).toEqual({ warnings: [] });
    const urls = mockedSpotifyApiRequest.mock.calls.map((call) => call[0].url);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("/me/player/shuffle");
    expect(urls[1]).toContain("/me/player/play");
    expect(urls[2]).toContain("/me/player/shuffle");
  });

  it("reports a shuffle refusal as a warning instead of failing a playlist that is playing", async () => {
    mockedSpotifyApiRequest.mockImplementation(async (params) =>
      params.url.includes("/me/player/shuffle") ? restrictionViolated() : new Response(null, { status: 204 })
    );

    const result = await startPlaylistPlayback({ accessToken: "token", playlistId: "playlist123" });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/shuffle off/i);
  });

  it("still reports no active device when the play command itself cannot find one", async () => {
    mockedSpotifyApiRequest.mockImplementation(async () =>
      new Response(
        JSON.stringify({ error: { status: 404, message: "Player command failed: No active device found", reason: "NO_ACTIVE_DEVICE" } }),
        { status: 404 }
      )
    );

    await expect(startPlaylistPlayback({ accessToken: "token", playlistId: "playlist123" })).rejects.toMatchObject({
      code: "NO_ACTIVE_DEVICE",
    });
    const urls = mockedSpotifyApiRequest.mock.calls.map((call) => call[0].url);
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("/me/player/play");
  });

  it("stops at once when the Spotify login has expired", async () => {
    mockedSpotifyApiRequest.mockImplementation(async () => new Response(null, { status: 401 }));

    await expect(startPlaylistPlayback({ accessToken: "token", playlistId: "playlist123" })).rejects.toMatchObject({
      code: "TOKEN_INVALID",
    });
    expect(mockedSpotifyApiRequest).toHaveBeenCalledTimes(1);
  });
});

describe("mapHttpError", () => {
  it("treats Restriction violated as a refused command, not missing Premium or lost control", () => {
    const err = mapHttpError({
      status: 403,
      message: "Player command failed: Restriction violated",
      reason: "UNKNOWN",
    });

    expect(err.code).toBe("RESTRICTED");
    expect(err.message).not.toMatch(/unavailable|premium/i);
    expect(err.spotifyReason).toBe("UNKNOWN");
    expect(err.httpStatus).toBe(403);
  });

  it("keeps Premium errors as Premium errors", () => {
    const err = mapHttpError({
      status: 403,
      message: "Player command failed: Premium required",
      reason: "PREMIUM_REQUIRED",
    });

    expect(err.code).toBe("PREMIUM_REQUIRED");
    expect(err.message).toMatch(/premium/i);
  });

  it("maps 401 and 404 as before", () => {
    expect(mapHttpError({ status: 401, message: null, reason: null }).code).toBe("TOKEN_INVALID");
    expect(mapHttpError({ status: 404, message: null, reason: "NO_ACTIVE_DEVICE" }).code).toBe("NO_ACTIVE_DEVICE");
  });
});

describe("player commands", () => {
  beforeEach(() => {
    mockedSpotifyApiRequest.mockReset();
  });

  it("raises RESTRICTED with Spotify's reason when pausing is refused", async () => {
    mockedSpotifyApiRequest.mockImplementation(async () => restrictionViolated());

    const failure = await pausePlayback({ accessToken: "token" }).catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(SpotifyLiveError);
    expect(failure).toMatchObject({
      code: "RESTRICTED",
      spotifyMessage: "Player command failed: Restriction violated",
      spotifyReason: "UNKNOWN",
    });
  });

  it("keeps a non-JSON error body as the Spotify message", async () => {
    mockedSpotifyApiRequest.mockImplementation(async () => new Response("Bad gateway", { status: 502 }));

    await expect(pausePlayback({ accessToken: "token" })).rejects.toMatchObject({
      code: "API_ERROR",
      message: "Bad gateway",
    });
  });
});

describe("devices", () => {
  beforeEach(() => {
    mockedSpotifyApiRequest.mockReset();
  });

  it("lists open Spotify apps", async () => {
    mockedSpotifyApiRequest.mockImplementation(async () =>
      Response.json({
        devices: [
          { id: "a", name: "Host laptop", type: "Computer", is_active: false, is_restricted: false },
          { id: "b", name: "Phone", type: "Smartphone", is_active: true, is_restricted: false },
        ],
      })
    );

    const devices = await listDevices("token");

    expect(mockedSpotifyApiRequest.mock.calls[0]?.[0].url).toBe("https://api.spotify.com/v1/me/player/devices");
    expect(devices).toEqual([
      { id: "a", name: "Host laptop", type: "Computer", isActive: false, isRestricted: false },
      { id: "b", name: "Phone", type: "Smartphone", isActive: true, isRestricted: false },
    ]);
  });

  it("picks the only open app when nothing is active", () => {
    expect(pickFallbackDevice([device()])).toMatchObject({ id: "device-1" });
  });

  it("does not guess between several open apps, or override an active one", () => {
    expect(pickFallbackDevice([device(), device({ id: "device-2", name: "Phone" })])).toBeNull();
    expect(pickFallbackDevice([device({ isActive: true })])).toBeNull();
    expect(pickFallbackDevice([])).toBeNull();
  });

  it("ignores apps that cannot be controlled", () => {
    expect(pickFallbackDevice([device({ isRestricted: true })])).toBeNull();
    expect(
      pickFallbackDevice([device({ isRestricted: true }), device({ id: "device-2" })])
    ).toMatchObject({ id: "device-2" });
  });
});

describe("confirmPlaybackStarted", () => {
  beforeEach(() => {
    mockedSpotifyApiRequest.mockReset();
  });

  const noWait = async () => {};

  function playerState(isPlaying: boolean): Response {
    return Response.json({
      device: { id: "d", name: "Host laptop", type: "Computer", is_active: true, is_restricted: false },
      is_playing: isPlaying,
      progress_ms: 0,
      item: { id: "t", name: "Song", duration_ms: 1000, artists: [], album: { images: [] } },
    });
  }

  it("confirms as soon as Spotify reports music playing", async () => {
    mockedSpotifyApiRequest
      .mockImplementationOnce(async () => playerState(false))
      .mockImplementationOnce(async () => playerState(true));

    const result = await confirmPlaybackStarted({ accessToken: "token", wait: noWait });

    expect(result.confirmed).toBe(true);
    expect(mockedSpotifyApiRequest).toHaveBeenCalledTimes(2);
  });

  it("reports silence when nothing starts playing", async () => {
    mockedSpotifyApiRequest.mockImplementation(async () => new Response(null, { status: 204 }));

    const result = await confirmPlaybackStarted({ accessToken: "token", wait: noWait });

    expect(result.confirmed).toBe(false);
    expect(result.state?.activeDevice).toBeNull();
    expect(mockedSpotifyApiRequest).toHaveBeenCalledTimes(3);
  });
});
