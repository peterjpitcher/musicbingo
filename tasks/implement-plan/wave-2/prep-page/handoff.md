# Prep Page — Split Flow and Wire New State (Handoff)

## What changed

Refactored `app/prep/page.tsx` to split the monolithic generate+playlist flow into two phases and wire the new StepGameConfig and StepGenerateConnect prop interfaces.

## State changes

- `game1IntroSong` / `game2IntroSong` (string) replaced by `game1IntroSongs` / `game2IntroSongs` (IntroSong[])
- `game1ChallengeSongs` / `game2ChallengeSongs` changed from `string[]` to `ChallengeEntry[]` (value + type)
- Added `playlistResults` (PlaylistPhaseResult[] | null), `playlistsCreated` (boolean), `refreshing` (boolean)
- Removed `onSubmit` function entirely

## New functions

- `handleCreatePlaylists()` — connects Spotify if needed, creates playlists, maps results to PlaylistPhaseResult[], sets playlistsCreated
- `handleGenerateEventPack()` — builds FormData with playlist IDs from playlistResults, generates event pack ZIP, triggers auto-save
- `handleRefreshFromSpotify()` — fetches updated track counts from `/api/spotify/playlist-tracks/{id}` for each playlist

## FormData changes

- `game1_challenge_songs` / `game2_challenge_songs` — still JSON arrays of value strings (backward compat)
- Added `game1_challenge_song_types` / `game2_challenge_song_types` — comma-separated type strings
- Added `game1_intro_songs` / `game2_intro_songs` — JSON-serialized IntroSong arrays
- Added `spotify_playlist_id_game1` / `spotify_playlist_id_game2` from playlistResults

## LiveSession payload changes

- `challengeSongs` now includes `type` field per entry
- `introSongs` array passed directly from state
- Legacy `introSongArtist` / `introSongTitle` populated from first intro song for backward compat
- `prepData.game1IntroSong` / `game2IntroSong` removed (intro songs stored in game config)

## Auto-prune effects

Updated to work with ChallengeEntry[] (pruning by `.value`, preserving `.type`). Intro song pruning removed (intro songs are now Spotify URLs, not song list selections).

## Verification

- `npx tsc --noEmit` — zero errors
- `npx eslint app/prep/page.tsx` — zero errors, zero warnings

## Dependencies

- StepGameConfig expects: `introSongs`, `onIntroSongsChange`, `spotifyConnected`, `challengeSongs` as ChallengeEntry[]
- StepGenerateConnect expects: `playlistsCreated`, `playlistResults`, `onCreatePlaylists`, `onRefreshFromSpotify`, `onGenerateEventPack`, `refreshing`
- API route `/api/spotify/playlist-tracks/{id}` must exist for refresh functionality
