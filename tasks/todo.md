# Fix: prep loses its Spotify playlists, so the game cannot be saved (17 October 2026)

Reported 16 October: on /prep the Save Live Session button stayed locked after playlists were made.

Evidence (Vercel request logs, `live_sessions`):
- 16:07:32 two intro-song lookups, 16:07:33 create-playlist 200, then no save; 16:11 host console, back to /prep; Save locked.
- Intro links typed while Spotify was disconnected are looked up when Create is pressed. The lookup changes the intro songs, the page compares the new playlists against the inputs captured before the lookup, sees a mismatch and discards them at once.
- Separately, created playlists live only in memory: leaving or refreshing /prep drops them (the draft does not keep them), editing a saved game never loads its playlists, and Connect/Disconnect half-clear them (Save locked with no Create button).
- The 16 October game was saved at 18:27 after a second Create, so the show itself was unaffected.

- [x] Browser flow 14 reproduces the 16:07 click (intro link pending, connect, create) and fails on current code (playlist links never stay visible); without the intro link it fails later, at the reload
- [x] Signature of the playlist inputs taken after the intro lookup, from the resolved songs; key order no longer matters
- [x] Playlists kept in the prep draft with their signature and restored on reload (dropped if the songs changed)
- [x] Editing a saved game loads its playlists; changing songs, themes, date or intro songs still discards them
- [x] Connect/Disconnect leave created playlists alone
- [x] "&amp;" shown literally on the Spotify and Playlists rows (the only JavaScript strings with entities in the app)
- [x] Unit tests for the draft playlists and signature; lint, typecheck, unit 208/208 (London and UTC), py 7/7, e2e 14/14, build
- [ ] PR, merge, confirm the production deploy

Not tested against real Spotify: the browser flows mock the Spotify routes, so real playlist creation was not repeated.

---

# Fix: Spotify "Restriction violated" on the host controller (16 October 2026)

Reported at 16:36 BST on show day: "Spotify playback control unavailable: Player command failed: Restriction violated (UNKNOWN)".

Evidence (Vercel request logs, `session_events`, `session_runtime_snapshots` for session `ab15ea89`):
- 16:36:37 Play Welcome Intro returned OK, but Spotify then reported nothing loaded on the active device; two more commands returned OK; the fourth (16:36:56) got Spotify 403 "Restriction violated".
- By 16:44 Spotify reported no active device at all. The device accepted commands without playing.
- Spotify sends 403 "Restriction violated" when a command does not fit the player state (pause when paused, skip with nothing loaded). The app labelled every 403 as "control unavailable / Premium".
- Tonight's break playlist (`37i9dQZF1DX2GKumqRIZ7g`) is Spotify-owned; the Web API returns 404 for it with this app's credentials.

- [x] Map 403 "Restriction violated" to a new `RESTRICTED` code, keep `PREMIUM_REQUIRED` for real Premium errors (`lib/spotifyLive.ts`)
- [x] Treat pause-when-paused, pause-with-no-device and resume-when-playing as success (`command/route.ts`)
- [x] No active device: send play commands to the only open Spotify app; name the apps when there are several
- [x] Confirm playback after play commands; warn the host when Spotify accepted but nothing plays (new host banner, clears itself)
- [x] Shuffle refusals never block a playlist starting; retried after play, then a warning
- [x] Break playlist that will not start: pause the game music and explain (Spotify-owned playlists named)
- [x] Plain-English failure messages from player state; server logs for failures (no device names)
- [x] Restart on welcome/intro songs replays the single track; elsewhere off the game screens it restarts in place
- [x] Auto-advance failure banner shows the message, not raw JSON
- [x] Prep: pasting an intro link no longer stores it twice (`StepGameConfig.tsx`)
- [x] Tests: 18 library, 11 route (fake Spotify), browser flows 10 and 11; flow 11 fails without the paste fix
- [x] Follow-up (owner approved): prep warns when the break playlist is Spotify-owned, with the steps to make an owned copy; playlist id parsing moved to `lib/spotifyPlaylistId.ts`; browser flow 12
- [ ] Owner to copy tonight's break playlist in the Spotify app (computer use is blocked for Spotify, and the Web API returns 404 for Spotify-owned playlists), then switch session `ab15ea89` to the copy

---

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


## API connections, 5 September 2026

- [x] Complete the approved Music Bingo feed remediation and verification in tasks/fix-function/2026-09-05-api-connections/todo.md.
