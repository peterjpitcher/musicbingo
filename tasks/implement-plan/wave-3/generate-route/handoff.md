# Generate Route + Clipboard Integration — Handoff

## Status: COMPLETE

## Changes Made

### app/api/generate/route.ts
- Added new FormData fields: `spotify_playlist_id_game1`, `spotify_playlist_id_game2`, `game1_challenge_song_types`, `game2_challenge_song_types`, `game1_intro_songs`, `game2_intro_songs`
- When Spotify playlist IDs are provided AND tracks can be fetched, builds `ParseResult` from Spotify track data instead of parsed text input — cards use actual Spotify track names
- Falls back to text parsing when playlist IDs are not provided or Spotify fetch fails
- Avoids duplicate Spotify API calls: reuses source-fetch tracks for sorting when the same playlist ID is used for both source and sort
- Passes challenge types and intro songs arrays to `renderClipboardDocx`
- Fixed all `catch (err: any)` to `catch (err: unknown)` with proper `instanceof Error` checks

### lib/clipboardDocx.ts
- Added `IntroSongEntry` type for typed intro songs (`{ type, artist, title }`)
- Extended `ClipboardGame` type with optional `challengeTypes?: string[]` and `introSongs?: IntroSongEntry[]`
- Added `challengeTypeLabel()` helper to map type slugs to display labels (e.g. `"dance-along"` -> `"DANCE ALONG"`)
- BONUS FUN section now shows intro songs with type labels before challenge songs for each game
- Challenge songs now show type prefix when provided (e.g. `"DANCE ALONG: Artist - Title"`)
- Legacy behaviour preserved: when no types/intro songs provided, output is identical to before

## Verification
- `npx tsc --noEmit` — zero errors
- `npm run build` — success
- Backward compatible: all new fields are optional with graceful fallbacks

## New FormData API

| Field | Type | Description |
|-------|------|-------------|
| `spotify_playlist_id_game1` | string | Spotify playlist ID to use as card source for game 1 |
| `spotify_playlist_id_game2` | string | Spotify playlist ID to use as card source for game 2 |
| `game1_challenge_song_types` | string | Comma-separated challenge types (e.g. `"dance-along,sing-along"`) |
| `game2_challenge_song_types` | string | Comma-separated challenge types |
| `game1_intro_songs` | JSON string | Array of `{ type, artist, title }` |
| `game2_intro_songs` | JSON string | Array of `{ type, artist, title }` |
