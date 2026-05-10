# Implementation Plan: Playlist-First Workflow

**Spec:** `tasks/spec-playlist-first-workflow.md`
**Complexity:** 4 (L) — 8+ files, no schema changes, two new API routes, UI restructure

## Wave 1: Foundation (types + API helpers)

No UI changes yet — just the building blocks.

### Task 1.1: Update LiveGameConfig types
**File:** `lib/live/types.ts`
**Changes:**
- Add `type` field to `challengeSongs` array items: `Array<{ artist: string; title: string; type: 'sing-along' | 'dance-along' }>`
- Replace `introSongArtist?: string` + `introSongTitle?: string` with `introSongs: Array<{ type: 'dance-along' | 'sing-along'; spotifyUrl: string; trackId: string; artist: string; title: string }>`
- Keep legacy fields as optional for backward compat with existing saved sessions (add `@deprecated` comment)
- Update `getEffectiveChallengeSongs()` to handle the new type field (default `'sing-along'` for legacy entries)

**Verify:** `npm run typecheck` — expect type errors in consumers (fixed in later tasks)

### Task 1.2: Add Spotify helper functions
**File:** `lib/spotifyWeb.ts`
**Changes:**
- Add `getPlaylistTracks(accessToken: string, playlistId: string): Promise<Array<{ uri: string; trackId: string; title: string; artist: string; position: number }>>` — paginated fetch of all tracks
- Add `getTrackMetadata(accessToken: string, trackId: string): Promise<{ trackId: string; title: string; artist: string; albumArt: string | null }>` — single track lookup
- Add `parseSpotifyTrackUrl(input: string): { trackId: string } | { error: string }` — URL/URI parser with validation per spec table

**Verify:** `npm run typecheck`

### Task 1.3: New API route — playlist tracks
**File:** `app/api/spotify/playlist-tracks/[playlistId]/route.ts` (new)
**Changes:**
- GET handler: extract playlistId from params
- Use `getOrRefreshAccessToken` from cookies
- Call `getPlaylistTracks()` helper
- Return `{ tracks: [...], total: number }`
- Handle auth errors (401 → re-auth prompt)

**Verify:** `npm run typecheck && npm run build`

### Task 1.4: New API route — track metadata
**File:** `app/api/spotify/track/[trackId]/route.ts` (new)
**Changes:**
- GET handler: extract trackId from params
- Use `getOrRefreshAccessToken` from cookies
- Call `getTrackMetadata()` helper
- Return `{ trackId, title, artist, albumArt }`
- Handle 404 (track unavailable) → `{ error: "Track not available" }`

**Verify:** `npm run typecheck && npm run build`

---

## Wave 2: UI Changes (StepGameConfig + StepGenerateConnect + prep page)

### Task 2.1: StepGameConfig — intro song URL inputs + challenge type toggle
**File:** `app/prep/StepGameConfig.tsx`
**Changes:**
- Remove intro song dropdown and `introSong`/`onIntroSong` props
- Add new props: `introSongs: Array<{ type: 'dance-along' | 'sing-along'; spotifyUrl: string; trackId: string; artist: string; title: string }>`, `onIntroSongs: (v: ...) => void`, `spotifyConnected: boolean`
- Add two text inputs: "Dance Along Song URL" and "Sing Along Song URL" (both required)
- On paste/blur: call `parseSpotifyTrackUrl()` for client-side validation, then fetch `/api/spotify/track/[trackId]` to resolve metadata
- Show resolved artist + title below each input as confirmation
- Show inline validation errors per spec table
- Each challenge song row: add a toggle before the dropdown — "Sing Along" | "Dance Along" (default: "Sing Along")
- Update `onChallengeSongs` prop type to include type: `Array<{ value: string; type: 'sing-along' | 'dance-along' }>`
- Update `canProceed` logic: require both intro song URLs to be valid and resolved

**Verify:** `npm run typecheck` — prep page will have type errors (fixed in 2.3)

### Task 2.2: StepGenerateConnect — two-phase UI
**File:** `app/prep/StepGenerateConnect.tsx`
**Changes:**
- Add new props: `playlistsCreated: boolean`, `playlistResults: Array<{ gameNumber: 1|2; playlistId: string; playlistUrl: string; addedCount: number; totalSongs: number; notFoundSongs: Array<{ artist: string; title: string }> }> | null`, `onCreatePlaylists: () => void`, `onRefreshFromSpotify: () => void`, `onGenerateEventPack: () => void`
- Remove old `onSubmit` prop (replaced by the two action props)
- **Before playlists created:** Show "Create Spotify Playlists" button (primary), song count summary
- **After playlists created:** Show playlist status panel per game (name, link to open in Spotify, X/Y matched, not-found list), "Refresh from Spotify" button, "Generate Event Pack" button (primary)
- **After generation:** Show download links (preserve current download UI)
- Button states: disabled + spinner during creation, per-game retry on failure
- Keep existing live session section (save/export) unchanged

**Verify:** `npm run typecheck` — prep page will have type errors (fixed in 2.3)

### Task 2.3: Prep page — split flow and wire new state
**File:** `app/prep/page.tsx`
**Changes:**
- **New state:**
  - `game1IntroSongs` / `game2IntroSongs`: `Array<{ type; spotifyUrl; trackId; artist; title }>` (replacing `game1IntroSong` / `game2IntroSong` strings)
  - `game1ChallengeSongTypes` / `game2ChallengeSongTypes`: `Array<'sing-along' | 'dance-along'>` (parallel to existing challenge song arrays)
  - `playlistResults`: per-game playlist creation results | null
  - `playlistsCreated`: boolean
- **Split `onSubmit`** into two functions:
  - `handleCreatePlaylists()`: runs only `createSpotifyPlaylists()`, stores results in `playlistResults`, disables button during creation
  - `handleGenerateEventPack()`: builds FormData with `spotify_playlist_id_game1`/`game2` from `playlistResults`, calls `/api/generate`, downloads ZIP
- **Add `handleRefreshFromSpotify()`**: fetches `/api/spotify/playlist-tracks/[id]` for each game + re-validates intro song URLs via `/api/spotify/track/[id]`
- **Update `saveLiveSession()`**: pass new `introSongs` and typed `challengeSongs` to `LiveGameConfig`
- **Update props** passed to `StepGameConfig` and `StepGenerateConnect` to match new interfaces
- **Update `canSubmit`**: require both intro songs resolved per game

**Verify:** `npm run typecheck && npm run lint`

---

## Wave 3: Generate Integration

### Task 3.1: Generate route — accept playlist IDs
**File:** `app/api/generate/route.ts`
**Changes:**
- Read optional `spotify_playlist_id_game1` and `spotify_playlist_id_game2` from FormData
- When playlist IDs provided:
  - Fetch tracks via existing `fetchPlaylistTracks()` (already in this file)
  - Build `Song[]` from Spotify track names instead of parsed text input
  - Use these for card generation (replaces `parseGameSongsText` source)
- When playlist IDs NOT provided:
  - Keep current behaviour (parse from `game1_songs` text)
- Read `challenge_song_types` from FormData and pass through to clipboard DOCX

**Verify:** `npm run typecheck && npm run build`

### Task 3.2: Challenge song types in clipboard DOCX
**File:** `lib/clipboardDocx.ts`
**Changes:**
- Accept challenge song type in the data passed to DOCX renderer
- Show type label next to each challenge song in the clipboard output
- Include intro songs (dance along + sing along) in the DOCX output

**Verify:** `npm run build`

---

## Wave 4: Verification

### Task 4.1: Full pipeline check
```bash
npm run lint && npm run typecheck && npm run build
```

### Task 4.2: Manual testing
- Start dev server, walk through full flow:
  1. Enter songs for both games
  2. Paste Spotify URLs for intro songs (test valid, invalid, empty)
  3. Set challenge song types (sing along / dance along)
  4. Create Spotify playlists — verify links appear
  5. Open Spotify, swap a track
  6. Click "Refresh from Spotify" — verify updated count + intro re-validated
  7. Generate event pack — verify cards use Spotify track names
  8. Check DOCX clipboard shows challenge types and intro songs
  9. Test fallback: generate without Spotify playlists (download only)

### Task 4.3: Edge cases to test
- Invalid Spotify URL (playlist URL, album URL, garbage text)
- Track that doesn't exist / is unavailable
- Playlist creation fails for one game but succeeds for other
- Double-click on "Create Playlists" button
- Auth expires between playlist creation and card generation
