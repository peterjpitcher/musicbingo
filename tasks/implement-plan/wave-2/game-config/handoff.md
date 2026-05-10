# StepGameConfig Handoff

## What Changed

### Removed
- `introSong: string` and `onIntroSong` props (old dropdown-based intro selection)
- Intro song `<select>` dropdown and `introAvailable` variable
- `introSong` from challenge song exclusion logic (challenges now only exclude other challenge selections)

### Added
- `introSongs: IntroSong[]` and `onIntroSongsChange` props for URL-based intro songs
- `spotifyConnected: boolean` prop to gate intro song inputs
- Two Spotify URL text inputs (dance-along + sing-along) with:
  - On-blur and on-paste URL validation via local `parseSpotifyTrackUrl`
  - Metadata resolution via `GET /api/spotify/track/[trackId]`
  - Loading, error (red), and resolved (green "Artist - Title") states
  - Disabled state with helper text when Spotify not connected
- `challengeSongs` prop changed from `string[]` to `ChallengeEntry[]` (`{ value: string; type: 'sing-along' | 'dance-along' }`)
- `onChallengeSongs` updated to match new type
- Type toggle `<select>` (Sing Along / Dance Along) before each challenge song dropdown
- `canProceed` now requires both intro songs resolved when `spotifyConnected` is true

### Exported Types
- `ChallengeEntry` type is defined locally in StepGameConfig.tsx. The parent page.tsx will need to import or replicate this type.

## Downstream Changes Required (page.tsx)

The parent `app/prep/page.tsx` needs to adapt to the new props:

1. **Replace state**: `introSong` (string) -> `introSongs` (IntroSong[])
2. **Replace state**: `game1ChallengeSongs` / `game2ChallengeSongs` from `string[]` to `ChallengeEntry[]`
3. **Pass `spotifyConnected`** boolean (derived from existing Spotify auth state)
4. **Update `buildConfig` calls** in page.tsx to map `ChallengeEntry[]` to `ChallengeSong[]` (adding `.type`)
5. **Remove `introSong` / `onIntroSong` props** from `<StepGameConfig>` usage
6. **Add `introSongs` / `onIntroSongsChange` / `spotifyConnected` props**

## Design Decisions
- `parseSpotifyTrackUrl` is duplicated locally (not imported from `@/lib/spotifyWeb`) because that module imports `node:crypto` at the top level, making it incompatible with `"use client"` components.
- Intro URL inputs trigger resolution on both blur and paste events for fast feedback.
- Challenge type defaults to "sing-along" when a new slot is created.
