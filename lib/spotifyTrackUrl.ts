export type SpotifyTrackUrlParseResult =
  | { trackId: string }
  | { error: string };

export function parseSpotifyTrackUrl(input: string): SpotifyTrackUrlParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "Please paste a valid Spotify track URL" };
  }
  const uriMatch = trimmed.match(/^spotify:track:([A-Za-z0-9]+)$/);
  if (uriMatch) {
    return { trackId: uriMatch[1] };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { error: "Please paste a valid Spotify track URL" };
  }
  if (url.hostname === "spotify.link") {
    return { error: "Please paste the full track URL from Spotify" };
  }
  if (url.hostname !== "open.spotify.com") {
    return { error: "Please paste a valid Spotify track URL" };
  }
  const pathSegments = url.pathname.split("/").filter(Boolean);
  if (pathSegments.length < 2) {
    return { error: "Please paste a valid Spotify track URL" };
  }
  const resourceType = pathSegments[0];
  if (resourceType === "playlist") {
    return { error: "Please paste a track URL, not a playlist" };
  }
  if (resourceType === "album") {
    return { error: "Please paste a track URL, not an album" };
  }
  if (resourceType !== "track") {
    return { error: "Please paste a valid Spotify track URL" };
  }
  const trackId = pathSegments[1];
  if (!trackId || !/^[A-Za-z0-9]+$/.test(trackId)) {
    return { error: "Please paste a valid Spotify track URL" };
  }
  return { trackId };
}
