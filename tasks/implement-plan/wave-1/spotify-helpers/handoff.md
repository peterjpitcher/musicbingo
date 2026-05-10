# Spotify Helpers — Handoff

## What was done

Three new exported functions appended to `lib/spotifyWeb.ts`:

1. **`parseSpotifyTrackUrl`** — Synchronous URL/URI parser. Handles `open.spotify.com/track/...`, `spotify:track:...` URIs, and returns specific error messages for playlists, albums, shortened links, and invalid input.

2. **`getPlaylistTracks`** — Paginated fetch of all tracks from a Spotify playlist via `spotifyApiRequest`. Returns `{ uri, trackId, title, artist, position }[]`. Skips null tracks (removed from Spotify). Uses the `fields` query parameter to minimise payload.

3. **`getTrackMetadata`** — Single track lookup via `spotifyApiRequest`. Returns `{ trackId, title, artist, albumArt }`.

## Assumptions

- Artist is always extracted as the **first** artist in the `artists` array; collaborating artists are not included.
- `getPlaylistTracks` uses `limit=100` (Spotify's maximum per page) and follows the `next` URL for pagination.
- Album art returns the **first** image in the album's images array (typically the largest resolution).
- Track IDs are validated with `[A-Za-z0-9]+` in `parseSpotifyTrackUrl`; Spotify IDs are base-62 which this covers.
- "Unknown Artist" is used as fallback when the artists array is empty (defensive; Spotify should always return at least one artist).

## Issues

None. File compiles cleanly with `npx tsc --noEmit`.

## Files modified

- `/Users/peterpitcher/Cursor/OJ-MusicBingo/lib/spotifyWeb.ts` — three functions appended (existing code untouched)
