# API Routes - Handoff

## What was created

### Route 1: GET `/api/spotify/playlist-tracks/[playlistId]`
- **File**: `app/api/spotify/playlist-tracks/[playlistId]/route.ts`
- Fetches all tracks from a Spotify playlist with pagination
- Returns `{ tracks: Array<{ uri, trackId, title, artist, position }>, total }`
- Skips null/removed tracks while preserving position index
- Uses `fields` filter to minimize Spotify API response size

### Route 2: GET `/api/spotify/track/[trackId]`
- **File**: `app/api/spotify/track/[trackId]/route.ts`
- Fetches metadata for a single Spotify track
- Returns `{ trackId, title, artist, albumArt }`
- Returns 404 with `{ error: "Track not available" }` when Spotify returns 404

## Auth pattern

Both routes follow the existing cookie-based auth pattern from `create-playlist/route.ts`:
- Read `spotify_refresh_token` cookie for refresh token
- Read `spotify_access_cache` cookie for cached access token
- Call `getOrRefreshAccessToken({ refreshToken, cachedRaw, origin })` from `@/lib/spotifyWeb`
- Set updated cookies on response when token was refreshed
- Return 401 if no refresh token or token refresh fails

## Implementation notes

- Used `spotifyApiRequest` from `@/lib/spotifyWeb` directly (not helper wrappers) since the brief noted parallel agents may be adding helpers
- The `getOrRefreshAccessToken` function signature uses an object param `{ refreshToken, cachedRaw, origin }` (not three positional args as described in the brief) -- matched the actual implementation
- Next.js 15+ dynamic route params are `Promise<>` -- used `await params` pattern
- All Spotify API calls use `encodeURIComponent` for user-supplied path segments

## Type safety

- No `any` types used
- Explicit return type `Promise<NextResponse>` on both handlers
- Typed Spotify API responses with local type aliases

## Pre-existing type errors

The following type errors exist in the codebase but are unrelated to these new routes:
- `app/prep/page.tsx` (lines 274, 288): `ChallengeSong` type mismatch
- `lib/live/validate.ts` (line 62): `ChallengeSong` type mismatch
