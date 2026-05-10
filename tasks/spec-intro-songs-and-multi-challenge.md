# Spec: Intro Songs & Multi-Challenge Songs

## Summary

Two changes:
1. **Intro songs** — a "dance along" song plays before Game 1 and a "sing along" song plays before Game 2. These play in full (no timed auto-advance) but the host can stop/skip when ready.
2. **Expand challenge songs** from 1 per game to 5 per game, following the same runtime behaviour as the current single challenge song (90s play time, special guest screen banner).

## Design Decisions

These were resolved during adversarial spec review (2026-05-09):

1. **Intro songs remain on bingo cards.** They are regular songs that happen to play first as a warm-up. Guests hearing them early is fine — the game hasn't officially started. This avoids card generation changes.
2. **No `"intro"` LiveMode.** Keep `mode: "running"` with `isIntroSong: boolean` as the only intro signal. The host controller derives it positionally on each poll tick.
3. **Intro and challenge song selections must not overlap.** The prep UI excludes already-selected songs from each dropdown.
4. **Intro song Spotify match failure: proceed without it.** If the intro song is not found on Spotify, skip it and surface a warning to the host: "Intro song not found on Spotify — game will start normally."
5. **`gameNChallengeSong` mirrors `gameNChallengeSongs[0]`.** The array is authoritative when present. Legacy sessions fall back via `getChallengeSongs()`.
6. **Duplicates detected via `makeSongSelectionValue()`.** Each dropdown filters already-selected values from its options.
7. **v1 intro songs must be selected from the game's parsed song list.** Selecting from external sources is out of scope.
8. **Intro detection is positional, not identity-based.** The intro song is placed as track 1 in the Spotify playlist. `isIntroSong` is true only while the very first track is playing after game start — it clears on the first track change and never re-fires, even if the same song appears later in the playlist.
9. **`isIntroSong` is derived from position on every poll tick, not persisted as a sticky flag.** Same pattern as `isChallengeSong` derivation in `applyStatusSnapshot()`.
10. **`introPlayed` is a durable marker** that flips to `true` after the first track change post-intro. Persisted in localStorage. Prevents intro re-triggering after host refresh.
11. **Intro does not overwrite `freePlay`.** Reveal/auto-advance logic checks `isIntroSong || freePlay` to keep intro and manual free-play independent.
12. **Cross-field dropdown conflicts** resolved by filtering: each dropdown hides values selected in other dropdowns. Users clear a selection to make it available elsewhere.

## Current System

### Challenge Song Flow

1. **Prep screen** (`app/prep/StepGameConfig.tsx`): single `<select>` per game, picks one song from the game's song list as the challenge song. Value format: `artist|||title`.
2. **Session storage** (`LiveGameConfig`): `challengeSongArtist` + `challengeSongTitle` — one pair per game.
3. **Spotify playlist** (`app/api/spotify/create-playlist/route.ts`): challenge song has no special handling — it's shuffled into the playlist with all other songs.
4. **Host controller** (`app/host/[sessionId]/page.tsx`):
   - `matchesChallengeSong()` fuzzy-matches the current Spotify track against the stored artist/title.
   - When matched, uses `CHALLENGE_REVEAL_CONFIG` (90s instead of 60s).
   - Shows "CHALLENGE SONG" badge and amber info card.
   - `challengeTrackIdRef` resolves the exact Spotify track ID once the playlist is loaded.
5. **Guest screen** (`app/guest/[sessionId]/page.tsx`): shows a banner ("Dancing Challenge" / "Sing-Along Challenge") when `runtime.isChallengeSong` is true.
6. **Clipboard DOCX** (`lib/clipboardDocx.ts`): lists the challenge song under "BONUS FUN" section.
7. **PDF cards**: challenge song is just a normal song on the bingo card — no special treatment.

### Key Constants

- `CHALLENGE_REVEAL_CONFIG`: `{albumMs: 10_000, titleMs: 20_000, artistMs: 25_000, nextMs: 90_000}`
- `DEFAULT_REVEAL_CONFIG`: `{albumMs: 15_000, titleMs: 30_000, artistMs: 40_000, nextMs: 60_000}`

## Proposed Changes

### 1. Data Model (`lib/live/types.ts`)

**`LiveGameConfig`** — add intro song + expand challenge songs:

```typescript
type LiveGameConfig = {
  gameNumber: 1 | 2;
  theme: string;
  playlistId: string;
  playlistName: string;
  playlistUrl: string | null;
  totalSongs: number;
  addedCount: number;
  // Legacy single challenge song (kept for backward compat with existing sessions)
  challengeSongArtist: string;
  challengeSongTitle: string;
  // New: up to 5 challenge songs per game
  challengeSongs?: Array<{ artist: string; title: string }>;
  // New: intro song played before the game starts (full play, no auto-advance)
  introSongArtist?: string;
  introSongTitle?: string;
};
```

**`PrepData`** — expand to store multiple challenge songs and intro songs:

```typescript
type PrepData = {
  game1SongsText: string;
  game2SongsText: string;
  game1Theme: string;
  game2Theme: string;
  // Legacy single challenge (kept for backward compat)
  game1ChallengeSong: string;
  game2ChallengeSong: string;
  // New: multiple challenge songs (artist|||title format)
  game1ChallengeSongs?: string[];
  game2ChallengeSongs?: string[];
  // New: intro songs (artist|||title format)
  game1IntroSong?: string;
  game2IntroSong?: string;
  cardCount: number;
};
```

**`LiveRuntimeState`** — add intro song flag (NO new LiveMode):

```typescript
// LiveMode stays: "idle" | "running" | "paused" | "break" | "ended"
// NO "intro" mode — intro is signalled positionally via isIntroSong

type LiveRuntimeState = {
  // ... existing fields ...
  /** True when playing the intro song (track 1) before a game starts. Derived, not sticky. */
  isIntroSong: boolean;
  /** Flips to true after the first track change post-intro. Persisted in localStorage. Prevents re-trigger after host refresh. */
  introPlayed: boolean;
};
```

### 2. Backward Compatibility

- `challengeSongArtist` / `challengeSongTitle` remain on `LiveGameConfig` for existing sessions.
- `getChallengeSongs()` helper resolves the effective list: if `challengeSongs` array exists and is non-empty, use it; otherwise fall back to the single `challengeSongArtist`/`challengeSongTitle` pair.
- `gameNChallengeSong = gameNChallengeSongs[0]` — the legacy field mirrors the first array entry. The array is authoritative when present.
- `validateLiveSession()` in `lib/live/validate.ts` handles both old and new formats.

### 3. Prep Screen (`app/prep/StepGameConfig.tsx`)

**Challenge songs**: replace the single `<select>` with 5 separate `<select>` dropdowns:
- First dropdown auto-selects. Others default to "None".
- Show count: "Challenge songs: 3/5 selected".
- Validation: at least 1 required, max 5.
- **No duplicates**: each dropdown filters out values already selected in other dropdowns, using `makeSongSelectionValue()` as the canonical identity.

**Intro song**: add one `<select>` at the top of each game config:
- Game 1: "Dance Along Song (plays before game)"
- Game 2: "Sing Along Song (plays before game)"
- Populated from the game's parsed song list. Optional — can be "None" / empty.
- **No overlap with challenge songs**: the intro dropdown excludes songs already selected as challenge songs, and vice versa.

**Cross-field conflict resolution**: each dropdown filters its options based on all other current selections. No automatic clearing of existing values. If a user wants to move a song from intro to challenge (or vice versa), they must clear the original selection first. This is the standard multi-select exclusion pattern — simple and predictable.

### 4. Prep Page State (`app/prep/page.tsx`)

New state variables:
- `game1ChallengeSongs: string[]` (array of `artist|||title`)
- `game2ChallengeSongs: string[]`
- `game1IntroSong: string` (single `artist|||title` or empty)
- `game2IntroSong: string`

Wire into `buildLiveSessionPayload()` and `buildBaseFormData()`.

**Stale selection pruning**: extend the existing `useEffect` that reconciles `challengeSong` on `parsedGame.songs` changes (lines 114-138) to also prune `challengeSongs[]` and `introSong` against the current parsed song list.

### 5. Playlist Creation (`app/api/spotify/create-playlist/route.ts`)

**Intro song positioning**:
1. Match the intro song separately from the regular song list (search Spotify for it first).
2. If intro song match fails: proceed without it. Return a warning in the response: `introNotFound: true`.
3. Shuffle all remaining matched tracks.
4. Prepend the intro song match result as track 1.

This ensures the intro song's matched track identity is preserved through the pipeline — no need to reverse-lookup which shuffled track was the intro after the fact.

### 6. Host Controller (`app/host/[sessionId]/page.tsx`)

**Intro song detection — positional, not identity-based**:

The intro song is track 1 in the playlist. Detection works as follows:
- On game start, the host controller knows the intro track ID (resolved during playlist creation, stored in game config or resolved from playlist track list).
- `isIntroSong` is `true` when ALL of:
  1. The current Spotify track is the first track in the playlist (by track ID).
  2. `introPlayed` is `false` (the intro phase has not been consumed yet).
- `introPlayed` defaults to `false`. On the first track change after intro detection, it flips to `true` and is persisted in localStorage via `commitRuntime()`. This ensures:
  - After host refresh mid-intro: `introPlayed` is still `false` in localStorage, so the intro resumes correctly.
  - After host refresh post-intro: `introPlayed` is `true`, so intro never re-triggers even if the same song appears later.
- `isIntroSong` is derived on every poll tick in `applyStatusSnapshot()`, NOT persisted as a sticky flag.
- When `isIntroSong` is true: auto-advance is suppressed and all metadata shown immediately. The intro does NOT overwrite the `freePlay` flag — instead, the reveal/auto-advance logic checks `isIntroSong || freePlay` wherever it currently checks `freePlay`. This keeps intro free-play and manual free-play independent.

**Challenge song detection** — `matchesChallengeSong()` changes:

```typescript
function matchesChallengeSong(
  track: { title: string; artist: string } | null,
  game: LiveGameConfig | null | undefined
): boolean {
  if (!track || !game) return false;
  const songs = getChallengeSongs(game); // returns Array<{artist, title}>
  return songs.some(cs => fuzzyMatch(track, cs));
}
```

**`challengeTrackIdRef`** becomes `challengeTrackIdsRef` — a `Set<string>` of resolved Spotify track IDs for all challenge songs (up to 5).

### 7. TV Screen Changes (`app/guest/[sessionId]/page.tsx`)

The guest screen is displayed on a TV in the venue — everything must be readable from across the room. No progressive reveal during intros; all metadata shown immediately.

**Dance Along intro (Game 1)** — energy-focused, visual:
- Full-screen layout: large album art centred, song title + artist shown immediately.
- Big bold banner: "DANCE ALONG!" in brand gold.
- Sub-text: "Get up and dance! Game 1 starting soon..."
- No countdown, no reveal phases. The focus is on the room, not the screen — guests should be watching each other dance, not reading their phones.

**Sing Along intro (Game 2)** — participation-focused:
- Full-screen layout: song title + artist shown large and prominent (bigger than album art).
- Big bold banner: "SING ALONG!" in brand gold.
- Sub-text: "Sing along! Game 2 starting soon..."
- Song title displayed extra-large so the room knows what they're singing.
- Future enhancement: lyrics display via Musixmatch API (not in v1 — API requires licensing).

**Both intros share:**
- No bingo card reveal UI (no album/title/artist countdown phases).
- Album art visible immediately.
- Host's "Next" click ends the intro and transitions to normal gameplay.

**Challenge songs** — same banner style as today but works for any of the 5 challenge songs per game, not just one. Game number determines the label ("Dancing Challenge" / "Sing-Along Challenge").

### 8. Clipboard DOCX (`lib/clipboardDocx.ts`)

Update the document:

**"40 seconds" → "60 seconds"**: fix the two hardcoded references (lines 109 and 146) to match the current 60s reveal config.

**BONUS FUN section**: list all challenge songs per game (numbered) and add intro song info.

**SCHEDULE section** — fully renumbered to include intro songs:

```
1. Welcome - Yes Sir (Nikki lip sync)
2. Announcements
3. KaraFun mobile quiz (Round 1)
4. Dance Along intro song
5. Music Bingo Game 1 (50 songs max)
6. Break (10 mins)
7. KaraFun mobile quiz (Round 2)
8. Sing Along intro song
9. Music Bingo Game 2 (50 songs max, different song list)
10. Announcements
```

### 9. Validation (`lib/live/validate.ts`)

`validateGameConfig()` must be updated to **return** the new fields (it's an allowlist boundary that drops unknown fields):
- `challengeSongs` — validate each entry has `artist` + `title` strings.
- `introSongArtist` / `introSongTitle` — optional strings.
- Backfill: if `challengeSongs` is missing, construct from legacy `challengeSongArtist`/`challengeSongTitle`.
- Reject duplicate entries in `challengeSongs`.

### 10. API Route (`app/api/generate/route.ts`)

- Accept `game1_challenge_songs` / `game2_challenge_songs` (JSON array or multiple form entries).
- Accept `game1_intro_song` / `game2_intro_song`.
- Pass through to clipboard DOCX and PDF generation.
- Normalise both JSON arrays and repeated form entries into the same shape.

### 11. Re-download from Host Dashboard

- `onRedownload()` in `app/host/page.tsx` already uses `prepData` — new fields flow through automatically once PrepData is updated.

## Implementation Order

1. **Types & validation** — update `LiveGameConfig`, `PrepData`, `LiveRuntimeState`, validation
2. **Prep UI** — multi-challenge select, intro song select, state management, overlap exclusion
3. **Playlist creation** — match intro separately, shuffle rest, prepend intro as track 1
4. **Host controller** — multi-challenge detection, positional intro detection + free play override
5. **Guest screen** — intro song banner, multi-challenge support
6. **Clipboard DOCX** — fix 40→60s, updated schedule, multi-challenge BONUS FUN
7. **Database migration** — none needed (JSONB data column, new fields are optional)

## Out of Scope

- Intro song from outside the game's song list (future enhancement)
- Different reveal timing per challenge song
- Reordering challenge songs within the playlist
- Lyrics display for sing-along (Spotify Web API has no public lyrics endpoint; Musixmatch integration would require licensing — flagged as v2 enhancement)
- Guest-side intro song interaction (TV display only, no interactivity)

## Risks

- **Existing sessions**: backward compat is maintained — `challengeSongs` array is optional, falls back to single pair.
- **Playlist ordering**: placing intro song at position 0 means Spotify plays it first. If user doesn't want an intro, the field is empty and playlist order is unchanged.
- **Intro re-trigger eliminated**: positional detection (track index 0 + no prior advances) means the intro banner never fires again when the same song appears later in the shuffled playlist. This was a critical user requirement.
