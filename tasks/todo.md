# Implementation Plan: Intro Songs & Multi-Challenge

Spec: `tasks/spec-intro-songs-and-multi-challenge.md`
Review: `tasks/codex-qa-review/2026-05-09-intro-songs-multi-challenge-v2-*`

## Phase 1: Types, Validation & Helpers

**Files:** `lib/live/types.ts`, `lib/live/validate.ts`, `lib/gameInput.ts`

- [ ] 1.1 Add to `LiveGameConfig`: `challengeSongs?: Array<{artist: string; title: string}>`, `introSongArtist?: string`, `introSongTitle?: string`
- [ ] 1.2 Add to `PrepData`: `game1ChallengeSongs?: string[]`, `game2ChallengeSongs?: string[]`, `game1IntroSong?: string`, `game2IntroSong?: string`
- [ ] 1.3 Add to `LiveRuntimeState`: `isIntroSong: boolean`, `introPlayed: boolean`
- [ ] 1.4 Update `makeEmptyRuntimeState()`: initialise `isIntroSong: false`, `introPlayed: false`
- [ ] 1.5 Add `getChallengeSongs(game: LiveGameConfig)` helper: returns array from `challengeSongs` or falls back to single legacy pair
- [ ] 1.6 Update `validateGameConfig()`: return `challengeSongs`, `introSongArtist`, `introSongTitle` in allowlist
- [ ] 1.7 Update `validatePrepData()`: accept and return new array/intro fields, keep legacy fields required for backward compat
- [ ] 1.8 Add `resolveChallengeSongs(selections: string[], songs: Song[])` in `lib/gameInput.ts`: array version of existing `resolveChallengeSong()`

## Phase 2: Prep UI

**Files:** `app/prep/StepGameConfig.tsx`, `app/prep/page.tsx`

- [ ] 2.1 `StepGameConfig`: replace single challenge `<select>` with 5 dropdowns. First auto-selects, others default "None". Show "Challenge songs: N/5 selected"
- [ ] 2.2 `StepGameConfig`: add intro song `<select>` at top. Game 1: "Dance Along Song", Game 2: "Sing Along Song". Optional.
- [ ] 2.3 Cross-field exclusion: each dropdown filters options via `makeSongSelectionValue()`. Intro excludes challenge values and vice versa.
- [ ] 2.4 `page.tsx`: add state for `game1ChallengeSongs`, `game2ChallengeSongs`, `game1IntroSong`, `game2IntroSong`
- [ ] 2.5 `page.tsx`: wire new state into `buildLiveSessionPayload()` and `buildBaseFormData()`
- [ ] 2.6 `page.tsx`: extend existing `useEffect` reconciliation (lines 114-138) to prune `challengeSongs[]` and `introSong` against current parsed song list
- [ ] 2.7 Validation: `canNext` requires at least 1 challenge song selected

## Phase 3: Playlist Creation

**Files:** `app/api/spotify/create-playlist/route.ts`

- [ ] 3.1 Accept intro song fields from request payload
- [ ] 3.2 Match intro song separately (Spotify search before shuffling rest)
- [ ] 3.3 If intro match fails: proceed without intro, set `introNotFound: true` in response
- [ ] 3.4 Shuffle all remaining matched tracks, prepend intro match as track 1
- [ ] 3.5 Return intro track ID in response so host controller can store it

## Phase 4: Host Controller

**Files:** `app/host/[sessionId]/page.tsx`

- [ ] 4.1 Replace `challengeTrackIdRef` with `challengeTrackIdsRef: Set<string>` — resolve all challenge songs from playlist
- [ ] 4.2 Update `matchesChallengeSong()` to use `getChallengeSongs(game)` array
- [ ] 4.3 Add positional intro detection in `applyStatusSnapshot()`: `isIntroSong = (trackId === introTrackId) && !prev.introPlayed`
- [ ] 4.4 On track change after intro: flip `introPlayed` to `true`
- [ ] 4.5 Update reveal/auto-advance logic: check `isIntroSong || freePlay` instead of just `freePlay`
- [ ] 4.6 Show intro-specific UI: "Dance Along" / "Sing Along" badge, no countdown, elapsed time only
- [ ] 4.7 Handle intro warning: if session has `introNotFound`, show warning message

## Phase 5: TV Screen (Guest)

**Files:** `app/guest/[sessionId]/page.tsx`

- [ ] 5.1 Add `isIntroSong` check before challenge banner in running state
- [ ] 5.2 Dance Along layout (Game 1 intro): large album art, "DANCE ALONG!" banner, song title + artist, "Game 1 starting soon..."
- [ ] 5.3 Sing Along layout (Game 2 intro): song title extra-large, "SING ALONG!" banner, album art secondary, "Game 2 starting soon..."
- [ ] 5.4 Both intros: no reveal phases, all metadata shown immediately, no countdown
- [ ] 5.5 Update challenge banner to work with any of 5 challenge songs (already driven by `runtime.isChallengeSong`, just verify)
- [ ] 5.6 Check `isIntroSong || freePlay` for immediate metadata reveal

## Phase 6: Clipboard DOCX

**Files:** `lib/clipboardDocx.ts`

- [ ] 6.1 Fix "40 seconds" → "60 seconds" in two places (lines 109, 146)
- [ ] 6.2 Update `ClipboardGame` type: `challengeSongs: Song[]` (array), `introSong?: Song`
- [ ] 6.3 Renumber SCHEDULE to include intro songs (10 items)
- [ ] 6.4 Update BONUS FUN: list all challenge songs per game (numbered), add intro song info
- [ ] 6.5 Update callers of `renderClipboardDocx()` to pass new shape

## Phase 7: Verification

- [ ] 7.1 `npm run lint`
- [ ] 7.2 `npm run typecheck`
- [ ] 7.3 `npm run build`
- [ ] 7.4 Manual smoke test: prep screen shows 5 challenge + intro dropdowns
