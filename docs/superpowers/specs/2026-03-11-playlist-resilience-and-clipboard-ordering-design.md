# Spec: Playlist Load Resilience & Clipboard Spotify Ordering

**Date:** 2026-03-11
**Project:** OJ-MusicBingo
**Status:** Approved

---

## Problem Statements

### 1. Host screen stuck on "Loading playlist…"

During a live event the host screen showed "Loading playlist…" for the entire session. Spotify was connected and playing correctly; only the track listing panel was broken.

**Root cause:** In `app/host/[sessionId]/page.tsx`, `loadedPlaylistIdRef.current` is set to the playlist ID *before* the fetch fires. If the fetch fails for any reason (network hiccup, Spotify auth race, non-200 response), the error is silently swallowed (`.catch(() => {})`). The effect guard `if (playlistId === loadedPlaylistIdRef.current) return` then blocks every subsequent retry attempt — the host has no recovery path without refreshing the page and losing in-session state.

### 2. Clipboard song list not in Spotify playlist order

The clipboard DOCX lists songs in the order the user typed them into the prep text box. The user wants the clipboard to reflect the exact order songs appear in the Spotify playlist, so the printed running order matches what will play.

**Root cause:** `app/api/generate/route.ts` passes `parsedGame1.songs` / `parsedGame2.songs` directly to `renderClipboardDocx` without consulting the Spotify playlist order.

---

## Solution 1 — Playlist Fetch Resilience

### Scope

Single file: `app/host/[sessionId]/page.tsx`

### Changes

**1. Move ref assignment to post-success only**

`loadedPlaylistIdRef.current = playlistId` moves from before the fetch to inside the success handler, after `setPlaylistTracks(data.tracks)`. On any failure path the ref stays `null` (or its previous value), allowing the effect to re-run.

**2. Add `playlistLoadError` state**

```typescript
const [playlistLoadError, setPlaylistLoadError] = useState<boolean>(false);
```

Set to `true` on `!res.ok` or in `.catch()`. Reset to `false` at the start of each fetch attempt.

**3. Error UI with Retry button**

Replace the current "Loading playlist…" paragraph with a three-state render:

- `playlistTracks.length > 0` → existing track list (unchanged)
- `playlistLoadError` → error message + "Retry" button
- otherwise (loading) → "Loading playlist…" (unchanged)

**4. Retry mechanism**

The Retry button resets `loadedPlaylistIdRef.current = null` and increments a `playlistRetryCount` state counter. The fetch effect depends on `playlistRetryCount`, so incrementing it forces the effect to re-run even though `activeGameNumber` and `session` haven't changed.

```typescript
const [playlistRetryCount, setPlaylistRetryCount] = useState(0);
// effect dependency: [runtime.activeGameNumber, session, playlistRetryCount]
```

### Error states handled

| Failure | Before | After |
|---------|--------|-------|
| Network error | Silent, stuck forever | Error shown, retry available |
| Non-200 response | Silent, stuck forever | Error shown, retry available |
| Token expired (401) | Silent, stuck forever | Error shown, retry available |
| Success after retry | Not possible | Works correctly |

### What does NOT change

- Auto-advance logic
- Challenge song resolution
- Played track tracking
- All other host screen behaviour

---

## Solution 2 — Clipboard Spotify Ordering

### Scope

Single file: `app/api/generate/route.ts`

### Changes

**1. Fetch Spotify playlist tracks for each game**

After parsing `parsedGame1` and `parsedGame2`, and before calling `renderClipboardDocx`, fetch the Spotify playlist tracks for each game's `playlistId`. Uses `getOrRefreshAccessToken()` with the refresh token from the request cookies — the same auth pattern as `app/api/spotify/playlist/[playlistId]/tracks/route.ts`.

Both playlists are fetched in parallel (`Promise.all`).

**2. Sort songs to match Spotify order**

For each game, build a position map from Spotify tracks:

```typescript
// normalise: lowercase + trim
const norm = (s: string) => s.trim().toLowerCase();

// build position index: "artist|title" → index
const spotifyIndex = new Map<string, number>();
spotifyTracks.forEach((t, i) => {
  spotifyIndex.set(`${norm(t.artist)}|${norm(t.title)}`, i);
});

// sort songs: matched songs by Spotify position, unmatched appended at end
const sorted = [...songs].sort((a, b) => {
  const ia = spotifyIndex.get(`${norm(a.artist)}|${norm(a.title)}`) ?? Infinity;
  const ib = spotifyIndex.get(`${norm(b.artist)}|${norm(b.title)}`) ?? Infinity;
  return ia - ib;
});
```

**3. Graceful degradation**

If Spotify auth is unavailable (no refresh token cookie, token refresh fails) or the playlist fetch fails, the sort is skipped and `parsedGame.songs` original order is preserved. A `console.warn` is logged. The generate request still succeeds — the only degradation is the clipboard song order.

**4. Matching strategy**

Exact key match on `norm(artist)|norm(title)`. If no exact match, the song is treated as unmatched and appended at the end in its original relative order. This handles minor whitespace/capitalisation differences between what the user typed and what Spotify returns.

### What does NOT change

- `lib/clipboardDocx.ts` — unchanged
- `renderClipboardDocx` signature — unchanged
- PDF card generation — unchanged (cards use randomised selection, not playlist order)
- Song inclusion — all user-entered songs remain in the clipboard; only their order changes

---

## Files Changed

| File | Change |
|------|--------|
| `app/host/[sessionId]/page.tsx` | Playlist fetch resilience: ref fix, error state, retry button |
| `app/api/generate/route.ts` | Fetch Spotify playlist at generate time, sort songs before passing to clipboard renderer |

---

## Testing

- **Manual:** Start a game on the host screen; simulate a playlist load failure by temporarily breaking the playlist API; confirm error + retry button appear; confirm retry succeeds
- **Manual:** Generate a ZIP where the user-entered song order differs from the Spotify playlist order; confirm the DOCX lists songs in Spotify order
- **Manual:** Generate a ZIP with no Spotify auth; confirm generation succeeds and DOCX uses original order with no crash

---

## Out of Scope

- Guest screen changes
- Reveal timing changes
- Challenge song detection changes
- Any changes to PDF card layout
