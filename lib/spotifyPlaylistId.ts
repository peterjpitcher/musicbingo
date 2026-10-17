/**
 * Spotify playlist id helpers with no server dependencies, so the prep wizard
 * (client) and the live command route (server) share one parser.
 */

/** Pull the playlist id out of a Spotify playlist link, URI or bare id. */
export function normalizePlaylistId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const uriMatch = trimmed.match(/^spotify:playlist:([a-zA-Z0-9]+)$/);
  if (uriMatch) return uriMatch[1] ?? null;

  const urlMatch = trimmed.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/i);
  if (urlMatch) return urlMatch[1] ?? null;

  if (/^[a-zA-Z0-9]+$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Spotify-owned editorial and algorithmic playlists all have ids starting
 * 37i9dQZF1. Spotify does not let this app read them and may refuse to play
 * them, so a break playlist has to be one the operator owns.
 */
export function isSpotifyOwnedPlaylist(raw: string): boolean {
  const normalized = normalizePlaylistId(raw);
  return Boolean(normalized && normalized.startsWith("37i9dQZF1"));
}
