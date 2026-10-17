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
- [x] Unit tests for the draft playlists and signature; lint, typecheck, unit 246/246 (London and UTC, after merging main), py 7/7, e2e 14/14, build. Flow 10 (host playback banner, code not touched here) timed out once in four full runs
- [x] PR #19
- [ ] Merge and confirm the production deploy

Not tested against real Spotify: the browser flows mock the Spotify routes, so real playlist creation was not repeated.

---

# Event pack order: "ft" inside a word (17 October 2026)

Branch `fix/event-pack-order-feat-boundary`, cut from `main` at `eee0609` while the matcher fix (`fix/spotify-matcher-feat-boundary`, `cc809aa`) and `fix/spotify-matcher-dash-suffix` beneath it were unmerged. Both reached `main` in PR #10 (`5ad5b27`, 08:48 BST) during this work, and `main` was merged in. Complexity 2 (S): one route, one new lib module and its tests, no schema change.

- [x] Move the ordering helpers from `app/api/generate/route.ts` into `lib/spotifyPlaylistOrder.ts` unchanged (function bodies byte-identical), with tests pinning the current order
- [x] Trailing featured-artist pattern in `stripTrackNoise` needs the start of the text or whitespace before feat/ft/featuring (same line as `cc809aa`)
- [x] Unit tests: Daft Punk, Soft Cell and Left Outside Alone stay whole; "Song feat. X", "Song ft. X" and "Song (feat. X)" still stripped; the stubs no longer partly match "David Bowie", "Mark Ronson" or "Let It Be"; Left Outside Alone against Left Behind is no longer the same title
- [x] New tests fail before the fix ("Da", "So", "Le"; partial matches at 0.85; Left Behind at 0.95) and pass after it
- [x] Replay of every saved list (814 lines, 800 songs, 8 sessions, read only) through the old and new `stripTrackNoise`: 3 of 1,600 artist and title fields change, "Daft Punk - One More Time" (24 April, artist), "Tainted Love - Soft Cell" (28 May, title) and "Soft Cell – Tainted Love" (16 October, artist; saved after the matcher's 700-line count). Against the other songs in the same list, the best false score falls from at most 0.552 to at most 0.130 (the sort accepts at 0.72), so none could take another song's place there. Spotify's own playlist names not replayed: sessions store only the playlist id, and the playlists are private
- [x] lint, typecheck, test:unit (Europe/London and UTC, 241 tests), build, on the merged branch
- [x] test:e2e, all 13 flows: flow 3 downloads a real event pack through the moved code (no Spotify tokens there, so it takes the list-order path; the matching itself is covered by the unit tests)

# Spotify matcher: "ft" inside a word (16 October 2026)

Branch `fix/spotify-matcher-feat-boundary`, based on `fix/spotify-matcher-dash-suffix` (not merged yet, so the matcher only exists in `lib/spotifyTrackMatch.ts` there). Complexity 1 (XS): one regex and its tests, no schema change.

- [x] Trailing featured-artist pattern in `stripNoise` needs the start of the text or whitespace before feat/ft/featuring
- [x] Unit tests: Daft Punk, Soft Cell (both line orders), Left Outside Alone against Left Behind; "feat.", "ft." and "(feat. ...)" still stripped
- [x] New tests fail before the fix (0.728 instead of 1; Left Outside Alone against Left Behind 1 instead of 0.389) and pass after it
- [x] Replay of every saved list line (700 lines, 7 sessions) through the old and new `stripNoise`: only "Daft Punk - One More Time" (24 April, artist) and "Tainted Love - Soft Cell" (28 May, title) change; the other 698 are byte-identical
- [x] Live Spotify search (market GB) for those two: same track picked before and after (`0DiWol3AO6WpXZgp0goxAV`, `0cGG2EouYCEEC3xfa0tDFV`), score 0.728 to 1.000; Daft Punk's nearest rival, "One More Time" by Jbizz, scored 0.650 before. All 542 unique songs not replayed live, to keep load off the shared Spotify app
- [x] lint, typecheck, test:unit (Europe/London and UTC, 184 tests), build
- [x] Parked, not on this branch: `stripTrackNoise` in `app/api/generate/route.ts` (event pack ordering) has the same regex. Fixed on `fix/event-pack-order-feat-boundary` (17 October 2026)

# Spotify matcher: version suffixes (16 October 2026)

Branch `fix/spotify-matcher-dash-suffix`. Complexity 2 (S): one route, one new lib module and its tests, no schema change.

- [x] Move the matcher from `app/api/spotify/create-playlist/route.ts` into `lib/spotifyTrackMatch.ts` unchanged (functions byte-identical; replaying the 14 August lists changes 0 picks)
- [x] `titleSimilarity` also compares against the Spotify title with its " - <suffix>" removed, keeping the existing comparisons
- [x] Unit tests: Valerie (Version Revisited), Help! (Remastered 2009), Waves (Radio Edit), Grease, title-first lines, hyphens inside titles, Steve Winwood guard
- [x] Replay of the 14 August lists against live Spotify search (market GB): 100 of 100 found (was 99); 4 other songs move to the better-known recording of the same song
- [x] Popularity tie-break built and tested on its own branch, `fix/spotify-matcher-popularity-tiebreak`; not on this branch (26 changed picks on the same lists, one of them a live "On the Road Again")
- [x] lint, typecheck, test:unit, build

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
