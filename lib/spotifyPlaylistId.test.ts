import { describe, expect, it } from "vitest";

import { DEFAULT_BREAK_PLAYLIST_URL, isSpotifyOwnedPlaylist, normalizePlaylistId, resolveBreakPlaylist } from "@/lib/spotifyPlaylistId";

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

describe("resolveBreakPlaylist", () => {
  it("uses the default break playlist when a game has none", () => {
    expect(resolveBreakPlaylist("")).toBe(DEFAULT_BREAK_PLAYLIST_URL);
    expect(resolveBreakPlaylist("   ")).toBe(DEFAULT_BREAK_PLAYLIST_URL);
    expect(resolveBreakPlaylist(undefined)).toBe(DEFAULT_BREAK_PLAYLIST_URL);
  });
  it("keeps a playlist the host set", () => {
    expect(resolveBreakPlaylist(" https://open.spotify.com/playlist/abc ")).toBe("https://open.spotify.com/playlist/abc");
  });
  it("points at the agreed playlist, which is not a Spotify-owned one", () => {
    expect(normalizePlaylistId(DEFAULT_BREAK_PLAYLIST_URL)).toBe("2Iwzdan13nqGI3k3sTfwkM");
    expect(isSpotifyOwnedPlaylist(DEFAULT_BREAK_PLAYLIST_URL)).toBe(false);
  });
});
