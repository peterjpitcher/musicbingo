import { describe, expect, it } from "vitest";

import { isSpotifyOwnedPlaylist, normalizePlaylistId } from "@/lib/spotifyPlaylistId";

describe("normalizePlaylistId", () => {
  it("reads links, URIs and bare ids", () => {
    expect(normalizePlaylistId("https://open.spotify.com/playlist/5xlpL99DNK4YeFOpiD5P59?si=2f1d738436304563")).toBe(
      "5xlpL99DNK4YeFOpiD5P59"
    );
    expect(normalizePlaylistId("spotify:playlist:5xlpL99DNK4YeFOpiD5P59")).toBe("5xlpL99DNK4YeFOpiD5P59");
    expect(normalizePlaylistId("  5xlpL99DNK4YeFOpiD5P59 ")).toBe("5xlpL99DNK4YeFOpiD5P59");
  });

  it("rejects anything that is not a playlist", () => {
    expect(normalizePlaylistId("")).toBeNull();
    expect(normalizePlaylistId("https://open.spotify.com/track/2LScqpywMqGcnum6nNaxXX")).toBeNull();
  });
});

describe("isSpotifyOwnedPlaylist", () => {
  it("recognises Spotify-owned playlists by link or id", () => {
    expect(isSpotifyOwnedPlaylist("https://open.spotify.com/playlist/37i9dQZF1DX2GKumqRIZ7g?si=822166ce9fc44b5e")).toBe(true);
    expect(isSpotifyOwnedPlaylist("37i9dQZF1DX2GKumqRIZ7g")).toBe(true);
  });

  it("leaves playlists people own alone", () => {
    expect(isSpotifyOwnedPlaylist("https://open.spotify.com/playlist/5xlpL99DNK4YeFOpiD5P59")).toBe(false);
    expect(isSpotifyOwnedPlaylist("")).toBe(false);
  });
});
