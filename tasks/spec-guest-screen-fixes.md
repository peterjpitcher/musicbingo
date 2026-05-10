# Spec: Guest Screen — Challenge Song Indicator & Progress Interpolation

## Problem Statement

Two bugs on the guest display screen (`/guest/[sessionId]`):

1. **Challenge song banner not appearing** — when a challenge song plays, the guest screen should show a prominent "Get Up and Dance!" or "Sing Along!" banner. It does not.
2. **Progress timer jumping** — the footer progress counter and reveal transitions update in 2-second jumps rather than ticking smoothly each second.

## Root Cause Analysis

### Bug 1: Challenge detection logic short-circuits text fallback

**File:** `app/host/[sessionId]/page.tsx` — `applyStatusSnapshot` callback, challenge detection block.

The host resolves challenge songs to Spotify track IDs by fuzzy-matching stored artist/title against the playlist metadata when the playlist first loads. These resolved IDs are stored in `challengeTrackIdsRef` (a `Set<string>`).

At runtime, challenge detection runs on every Spotify poll (every 2s):

```typescript
// BEFORE (simplified)
const isChallengeSong = challengeTrackIdsRef.current.size > 0
  ? challengeTrackIdsRef.current.has(track.trackId)   // ID-only path
  : matchesChallengeSong(track, game);                 // text fallback
```

**Problem:** If the playlist loads and resolves _some_ challenge songs but not _all_ (e.g. the fuzzy match fails for one song because Spotify metadata differs from the user-entered text), the Set has `size > 0` so the text-based fallback **never executes**. The unmatched song's track ID isn't in the Set → `has()` returns false → `isChallengeSong` stays false → guest never sees the banner.

### Bug 2: No client-side interpolation between polls

**File:** `app/guest/[sessionId]/page.tsx`

The guest receives runtime state updates from three sources:
- BroadcastChannel (same-device, instant but only fires when host polls — every 2s)
- localStorage poll (every 2s)
- HTTP API poll (every 2s, cross-device)

All three deliver a `progressMs` snapshot from the Spotify API. Between deliveries, the displayed value is frozen. The UI only re-renders when new data arrives → visible 2-second jumps in the progress counter and delayed reveal transitions.

## Solution

### Fix 1: Always try both detection methods

```typescript
const detectChallenge = (t) => {
  if (challengeTrackIdsRef.current.has(t.trackId)) return true;
  return matchesChallengeSong(t, game);
};
const isChallengeSong = isIntroSong ? false
  : trackChanged ? detectChallenge(track)
  : (prev.isChallengeSong || detectChallenge(track));
```

ID-based detection is tried first (fast, exact). If it misses, text-based fuzzy matching runs as a safety net. This means even songs that weren't resolved during playlist load will still be detected.

**Known limitation:** The text fallback uses bidirectional substring matching on both title AND artist. If a non-challenge track shares substrings with a configured challenge song in both fields, it could be falsely classified. This is acceptable because: (a) requiring both fields to match makes it unlikely, (b) `getChallengeSongs` filters out entries with empty artist/title, and (c) the previous bug (challenge never detected) was a worse user experience than an occasional false positive.

### Fix 2: Local progress interpolation hook

New `useInterpolatedProgress(runtime)` hook in the guest page:

1. **Anchor** — `useMemo` stores the last server-provided `progressMs`, keyed by `updatedAtMs` + `trackId`. Only recalculates when the server sends genuinely new data.
2. **Tick counter** — a `setInterval` increments a counter every 1000ms while the track is playing.
3. **Synchronous reset** — when the anchor object changes (detected during render via identity comparison), the tick counter resets to 0 immediately — preventing stale ticks from flashing incorrect reveal state for one frame on track transitions.
4. **Derived value** — returns `anchor.progress + tick * 1000`.

The guest page now uses this interpolated progress for:
- Footer progress display (`Progress: Xs`)
- Local reveal state computation via `computeRevealState(interpolatedProgress, effectiveNextCfg)`

### Fix 3: Extension-aware reveal config on guest

The guest must account for `runtime.extensionMs` (added when the host presses "+30s") when computing local reveal state. Without this, the guest shows "Advancing to next song..." while the host keeps the song playing.

```typescript
const effectiveNextCfg = runtime.extensionMs > 0
  ? { ...effectiveCfg, nextMs: effectiveCfg.nextMs + runtime.extensionMs }
  : effectiveCfg;
const localRevealState = computeRevealState(interpolatedProgress, effectiveNextCfg);
```

## Files Changed

| File | Change |
|------|--------|
| `app/host/[sessionId]/page.tsx` | Replaced challenge detection logic with `detectChallenge()` helper that tries ID-based then text-based matching |
| `app/guest/[sessionId]/page.tsx` | Added `useInterpolatedProgress` hook with synchronous tick reset; compute `localRevealState` from interpolated progress + extension-aware config; replace all `runtime.revealState` references with local computation |

## Constraints

- ESLint forbids `setState` called synchronously within `useEffect` bodies (`react-hooks/set-state-in-effect`)
- ESLint forbids ref access during render (`react-hooks/refs`)
- ESLint forbids impure function calls like `Date.now()` during render (`react-hooks/purity`)
- The synchronous state-during-render pattern (`if (x !== y) { setState(...) }`) is the React-recommended alternative for derived state resets

## Acceptance Criteria

- [ ] When a challenge song plays, the guest screen shows the challenge banner regardless of whether the track ID was pre-resolved
- [ ] The guest screen footer progress counter ticks up every second (not every 2s)
- [ ] Reveal transitions (album, title, artist) fire at the correct second mark without visible delay
- [ ] Progress snaps to the correct server value when a new poll arrives (no drift accumulation)
- [ ] Track changes reset progress to the new track's position immediately (no stale-tick flash)
- [ ] Host "+30s" extension is reflected on guest — no premature "Advancing..." message
- [ ] No lint errors, type errors, or build failures

## Verification

```bash
npm run lint        # zero errors
npm run typecheck   # clean
npm run build       # success
```

Manual smoke test:
1. Start a game with a configured challenge song
2. Verify the challenge banner appears on the guest screen when that song plays
3. Watch the progress counter — it should tick up every second without jumping
4. Verify reveal transitions happen at the expected second marks (album @15s, title @30s, artist @40s)
5. Press "+30s" on the host — verify guest does NOT show "Advancing..." at the original threshold
6. Let a track transition happen — verify no flash of revealed content on the new track
