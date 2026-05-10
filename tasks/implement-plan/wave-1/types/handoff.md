# Types Foundation - Handoff

## What changed
- Added `ChallengeSong` type alias with required `type: 'sing-along' | 'dance-along'` field
- Added `IntroSong` type alias with `type`, `spotifyUrl`, `trackId`, `artist`, `title` fields
- Updated `LiveGameConfig.challengeSongs` to use `ChallengeSong[]`
- Marked `introSongArtist` and `introSongTitle` as `@deprecated` with JSDoc
- Added `introSongs?: IntroSong[]` to `LiveGameConfig`
- Updated `getChallengeSongs()` to return `ChallengeSong[]`, defaulting `type` to `'sing-along'` for legacy entries
- Added `getIntroSongs()` helper with legacy fallback logic

## Assumptions
- Legacy challenge song entries (without `type`) default to `'sing-along'`
- Legacy intro song fallback constructs IntroSong with empty `spotifyUrl` and `trackId`
- The `type` field on `ChallengeSong` is required (not optional) -- callers must provide it

## Known downstream errors
Type errors now exist in files that construct `challengeSongs` arrays without the `type` field:
- `app/prep/page.tsx` (lines 274, 288)
- `lib/live/validate.ts` (line 62)

These files need updating to include `type` when constructing challenge song objects.

## Exports added
- `ChallengeSong` (type)
- `IntroSong` (type)
- `getIntroSongs` (function)
