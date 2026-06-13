import { beforeEach, describe, expect, it, vi } from "vitest";

import { spotifyApiRequest } from "@/lib/spotifyWeb";
import { startPlaylistPlayback } from "@/lib/spotifyLive";

vi.mock("@/lib/spotifyWeb", () => ({
  spotifyApiRequest: vi.fn(async () => new Response(null, { status: 204 })),
}));

const mockedSpotifyApiRequest = vi.mocked(spotifyApiRequest);

describe("startPlaylistPlayback", () => {
  beforeEach(() => {
    mockedSpotifyApiRequest.mockClear();
  });

  it("turns shuffle off by default and starts at the first track", async () => {
    await startPlaylistPlayback({ accessToken: "token", playlistId: "playlist123" });

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

  it("keeps break playlists shuffled when requested", async () => {
    await startPlaylistPlayback({ accessToken: "token", playlistId: "playlist123", shuffle: true });

    expect(mockedSpotifyApiRequest).toHaveBeenCalledTimes(2);
    expect(mockedSpotifyApiRequest.mock.calls[0]?.[0].url).toContain("/me/player/shuffle");
    expect(mockedSpotifyApiRequest.mock.calls[0]?.[0].url).toContain("state=true");

    const playBody = JSON.parse(String(mockedSpotifyApiRequest.mock.calls[1]?.[0].init?.body));
    expect(playBody).toEqual({
      context_uri: "spotify:playlist:playlist123",
      position_ms: 0,
    });
  });
});
