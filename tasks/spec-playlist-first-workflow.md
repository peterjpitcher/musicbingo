# Spec: Playlist-First Workflow

## Problem

When the app creates Spotify playlists from a song list, the Spotify search sometimes picks odd remixes or wrong versions of tracks. The user has no opportunity to fix these before game cards are generated, meaning cards may reference tracks that don't match what's actually in the curated playlist.

## Solution

Split the current single "Generate Event Pack + Create Spotify Playlists" action into two sequential steps:

1. **Create Playlists** — search Spotify, create playlists, let the user review and curate in Spotify
2. **Generate Cards** — pull the *final* track list from the curated Spotify playlists and generate cards from those

## Current Flow

```
Enter songs → Click "Generate Event Pack + Create Spotify Playlists"
  → Parallel: create playlists + generate PDF bundle
  → Done (cards use the raw song list, not the Spotify matches)
```

Cards are generated from the **raw text input**, not from the Spotify playlist. So even if Spotify finds the wrong remix, the card still shows the original artist/title. But this creates a mismatch: the card says one thing, the playlist plays another.

## Proposed Flow

```
Step 3a: "Create Spotify Playlists"
  → Search Spotify, create playlists
  → Show playlist links + not-found songs
  → User opens Spotify, swaps bad tracks, reorders
  → User returns and clicks...

Step 3b: "Generate Event Pack"
  → Fetch current tracks from Spotify playlists via API
  → Generate cards using the actual playlist track names
  → Download PDF bundle
```

## UI Changes (Step 3 — StepGenerateConnect)

### Before playlists are created
- **"Create Spotify Playlists" button** (primary action)
- Spotify connect flow unchanged (OAuth if not connected)
- Song list summary visible (Game 1: X songs, Game 2: Y songs)

### After playlists are created, before card generation
- **Playlist status panel** for each game:
  - Playlist name + link to open in Spotify (external link icon)
  - "X of Y tracks matched" summary
  - List of not-found songs (if any) — user can find these manually in Spotify
  - "Refresh from Spotify" button — re-fetches playlist tracks to show updated state
- **"Generate Event Pack" button** (primary action, now enabled)
- Helper text: "Review your playlists in Spotify, then generate your event pack"

### After card generation
- Download links (unchanged from current behaviour)
- Playlist links still visible

## API Changes

### New: GET `/api/spotify/playlist-tracks/[playlistId]`
- Fetches current tracks from a Spotify playlist
- Returns: `{ tracks: Array<{ uri, title, artist, position }>, total }`
- Used by the generate step to pull the curated track list

### Modified: POST `/api/generate`
- New optional field: `spotify_playlist_id_game1`, `spotify_playlist_id_game2`
- When playlist IDs are provided:
  - Fetch tracks from Spotify playlists instead of using raw song list
  - Use Spotify track names (artist + title) for card generation
  - This ensures cards match exactly what's in the playlist
- When playlist IDs are NOT provided:
  - Fall back to current behaviour (generate from raw song list)
  - Supports offline/no-Spotify usage

### Unchanged
- POST `/api/spotify/create-playlist` — same as today
- Spotify OAuth flow — same as today

## State Management (prep page)

New state fields:
```typescript
// Playlist creation results (per game)
playlistResults: Array<{
  gameNumber: 1 | 2
  playlistId: string
  playlistUrl: string
  addedCount: number
  notFoundSongs: Array<{ artist: string; title: string }>
}> | null

// Whether user has completed playlist review
playlistsReady: boolean  // enables "Generate Event Pack" button
```

The "Generate Event Pack" button is enabled once at least one playlist has been created. There's no enforced gate on review — the user can generate immediately if they're happy with the auto-matched tracks, or review first.

## Card Generation Logic Change

Currently (`lib/generator.ts`):
- Takes `Song[]` from parsed text input
- Generates combined pool from artist names + song titles
- Cards contain items from this text-based pool

With playlist-first:
- When Spotify playlist IDs provided: fetch tracks from Spotify, build `Song[]` from those
- The generator itself doesn't change — it still takes `Song[]`
- The *source* of that `Song[]` changes from "parsed text" to "Spotify playlist tracks"

## Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| User removes tracks from playlist | Cards generate from fewer songs; validation still requires min 25 combined pool items |
| User adds extra tracks to playlist | Extra tracks included in card generation — more variety |
| Spotify auth expires between steps | Re-auth prompt before generate step |
| User never creates playlists | "Generate Event Pack" still works from raw song list (current behaviour preserved) |
| Playlist has fewer than required songs | Validation error shown, user prompted to add more songs |

## Intro Songs: Spotify URL Input

### Problem

The "dance along" and "sing along" intro songs (played before each game starts) are currently selected from a dropdown of the game's song list. These songs are **not** part of the game — they're pre-game entertainment. They shouldn't come from the song list at all.

### Change

Replace the intro song dropdown with a **Spotify URL text input** for each game. The user pastes a Spotify track URL (e.g. `https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8`) and the app extracts the track ID to fetch metadata (artist, title) via the Spotify API.

### Current UI (StepGameConfig)

- Dropdown: "Intro Song" — lists songs from the game's song list
- Selected value stored as `"artist|||title"` string

### New UI (StepGameConfig)

- **Text input**: "Dance Along Song URL" (required) — accepts a Spotify track URL
- **Text input**: "Sing Along Song URL" (required) — accepts a Spotify track URL
- On paste/blur: validate URL format, fetch track metadata from Spotify, show artist + title confirmation below the input
- Invalid URL: inline validation error
- Each game gets its own pair of intro song URL fields
- Both fields are **required** — the form cannot proceed without them

### Validation

| Input | Behaviour |
|-------|-----------|
| `https://open.spotify.com/track/{trackId}` | Accepted — extract track ID |
| `https://open.spotify.com/track/{trackId}?si=...` | Accepted — strip query params, extract track ID |
| `spotify:track:{trackId}` | Accepted — extract track ID |
| `https://open.spotify.com/playlist/...` | Rejected — "Please paste a track URL, not a playlist" |
| `https://open.spotify.com/album/...` | Rejected — "Please paste a track URL, not an album" |
| `https://spotify.link/...` | Rejected — "Please paste the full track URL from Spotify" |
| Any other URL or text | Rejected — "Please paste a valid Spotify track URL" |
| Empty | Rejected — "Dance along / sing along song is required" |
| Valid URL, track unavailable/restricted | Show warning: "Track not available — please check the URL" |

Validation fires **on blur** (not on every keystroke). On paste, also trigger immediately.

### Data Model Change

```typescript
// LiveGameConfig — replace intro song fields
// Before:
introSongArtist?: string;
introSongTitle?: string;

// After:
introSongs: Array<{
  type: 'dance-along' | 'sing-along';
  spotifyUrl: string;
  trackId: string;
  artist: string;
  title: string;
}>;
```

Note: `introSongs` is **required** (not optional) — both entries must be present per game.

### Data Flow

- **Stored in**: `LiveGameConfig.introSongs` within the live session
- **Used by**: Host playback detection (to identify when intro songs are playing)
- **Included in**: DOCX clipboard (so host knows which intro songs to queue)
- **NOT on**: Bingo cards — intro songs are pre-game entertainment, not game content

### API

- **New: GET `/api/spotify/track/[trackId]`** — fetches track metadata (artist, title, album art) from Spotify. Used to resolve pasted URLs.
- Alternatively, resolve client-side if access token is available.

### What This Removes

- Intro song dropdown in StepGameConfig
- Intro songs no longer come from or are constrained by the game song list

## Challenge Songs: Type Labels

### Problem

Challenge songs (selected from the game's song list) currently have no indication of whether they're a "sing along" or "dance along" challenge. The host needs to know which type each challenge is so they can instruct the audience.

### Change

Add a **type selector** to each challenge song slot in `StepGameConfig`:

- Each challenge song dropdown gets a paired toggle/select: **"Sing Along"** or **"Dance Along"**
- Default: "Sing Along"
- The type is stored alongside the song selection

### Data Model Change

```typescript
// LiveGameConfig — update challenge songs
// Before:
challengeSongs?: Array<{ artist: string; title: string }>;

// After:
challengeSongs?: Array<{
  artist: string;
  title: string;
  type: 'sing-along' | 'dance-along';
}>;
```

### UI

- Each challenge song row: `[Type toggle: Sing Along | Dance Along] [Song dropdown]`
- Type label visible on host dashboard during gameplay so host knows what to announce

## Double-Submit Protection

- **"Create Spotify Playlists" button**: disabled immediately on click, shows spinner, re-enables only on error
- **Playlist IDs persisted**: stored in component state; if user refreshes, playlists are lost (acceptable — user can re-create)
- **Duplicate playlists**: if user somehow triggers twice, Spotify creates a second playlist (harmless — user deletes the duplicate manually)

## Partial Failure Handling

Each game's playlist creation is **independent**. Status per game:

| Game 1 | Game 2 | UI State |
|--------|--------|----------|
| Success | Success | Both playlist links shown; "Generate Event Pack" enabled |
| Success | Failed | Game 1 link shown; Game 2 shows error + "Retry" button |
| Failed | Success | Game 2 link shown; Game 1 shows error + "Retry" button |
| Failed | Failed | Both show errors + "Retry" buttons; "Generate Event Pack" disabled |

- Retry is per-game — only re-creates the failed playlist
- Orphan playlists in Spotify are harmless; user can delete manually
- "Generate Event Pack" requires **all games** to have playlists (or fall back to raw song list for games without)

## Refresh from Spotify

The "Refresh from Spotify" button:
- Re-fetches current tracks from the Spotify playlist
- Updates the track count and matched song display
- **Also re-validates intro song URLs** — re-fetches track metadata to confirm they're still available
- Shows updated status for both playlists and intro songs

## What Doesn't Change

- Song list input format and parsing (intro songs are no longer part of this)
- Challenge songs remain as dropdowns from the game's song list (selection mechanism unchanged)
- Spotify OAuth flow
- PDF rendering and layout
- Card grid dimensions (5x3, 12 filled)
- Host dashboard
- Guest view
- DOCX clipboard export
- QR code generation

## Complexity

**Score: 4 (L)** — 7+ files changed, no schema changes, two new API routes, UI restructure across two components.

## Files to Modify

| File | Change |
|------|--------|
| `app/prep/page.tsx` | Split onSubmit into two actions; add playlist review state; intro song URL state |
| `app/prep/StepGameConfig.tsx` | Replace intro song dropdown with Spotify URL inputs; add challenge song type toggle |
| `app/prep/StepGenerateConnect.tsx` | Two-button UI with playlist status panel |
| `app/api/spotify/playlist-tracks/[playlistId]/route.ts` | New route — fetch playlist tracks |
| `app/api/spotify/track/[trackId]/route.ts` | New route — resolve track metadata from Spotify URL |
| `app/api/generate/route.ts` | Accept optional playlist IDs; fetch tracks from Spotify when provided |
| `lib/spotifyWeb.ts` | Add `getPlaylistTracks()` and `getTrack()` helpers |
| `lib/live/types.ts` | Update `introSong` fields to URL-based model |
