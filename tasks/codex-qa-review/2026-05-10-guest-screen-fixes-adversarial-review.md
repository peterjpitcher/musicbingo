# Adversarial Review: Guest Screen Fixes

**Date:** 2026-05-10
**Mode:** B (Code Review / Bug Fix)
**Scope:** `app/guest/[sessionId]/page.tsx`, `app/host/[sessionId]/page.tsx`
**Pack:** `tasks/codex-qa-review/2026-05-10-guest-screen-fixes-review-pack.md`

## Executive Summary

Two bug fixes: (1) challenge song detection now falls through to text matching when ID-based resolution misses, (2) guest progress interpolation ticks every second instead of jumping every 2s. Both fixes have material correctness issues: the guest computes reveal state without `extensionMs`, causing premature "advancing..." display when the host extends a song; and the tick counter can flash stale values on track transitions.

## What Appears Solid

- **Intro precedence preserved:** Intro songs are still forced to `isChallengeSong: false` before any detection logic runs — no regression.
- **Shared reveal logic:** Guest reuses `computeRevealState()` rather than duplicating threshold arithmetic — single source of truth for the algorithm.
- **Timer cleanup:** The interpolation interval is properly cleared on unmount and dependency change — no leak.
- **Anchor reset:** The `useMemo` anchor recalculates when `updatedAt` or `trackId` changes, correctly snapping to fresh server data.

## Critical Risks

### FINDING-1: Guest ignores extensionMs in reveal computation (High / Blocking)

**Files:** `app/guest/[sessionId]/page.tsx:199`

The guest computes `localRevealState` from `effectiveCfg` (base config), but the host adds `runtime.extensionMs` to `baseCfg.nextMs` before computing its own reveal state. When the host extends a song via the "+30s" button, the guest's `shouldAdvance` flag fires early, showing "Advancing to next song..." on the projection while the host keeps the song playing.

**Fix:** Include `runtime.extensionMs` in the effective config before passing to `computeRevealState`:
```typescript
const effectiveNextCfg = runtime.extensionMs > 0
  ? { ...effectiveCfg, nextMs: effectiveCfg.nextMs + runtime.extensionMs }
  : effectiveCfg;
const localRevealState = (runtime.isIntroSong || runtime.freePlay)
  ? { showAlbum: true, showTitle: true, showArtist: true, shouldAdvance: false }
  : computeRevealState(interpolatedProgress, effectiveNextCfg);
```

### FINDING-2: Stale tick renders on track change (High / Blocking)

**Files:** `app/guest/[sessionId]/page.tsx:51-64`

When a track changes, the `tick` state is reset in a `useEffect` (runs after paint). On the first render of the new track, the old tick value is still in state, so the returned progress is `newAnchor.progress + oldTick * 1000` — potentially 20-60 seconds ahead. This can flash reveal content on the projection for one frame.

**Fix:** Reset tick synchronously when the anchor changes. Since `useMemo` triggers synchronously, derive the tick from a comparison:
```typescript
const [tick, setTick] = useState(0);
const [lastAnchor, setLastAnchor] = useState(anchor);
if (anchor !== lastAnchor) {
  setLastAnchor(anchor);
  setTick(0);
}
```
This pattern (setState during render when detecting prop change) is the React-recommended approach for derived state resets.

## Implementation Defects

### FINDING-3: Text fallback may false-positive (Medium / Non-blocking)

**Files:** `app/host/[sessionId]/page.tsx:335-337`

The `detectChallenge` helper always falls through to `matchesChallengeSong()` when the ID check misses. If a non-challenge track happens to share a title/artist substring with a configured challenge song (e.g., "Love" in both), it gets classified as challenge and plays for 90s instead of 60s.

**Mitigation:** The risk is low in practice because `matchesChallengeSong` requires BOTH title AND artist to substring-match. However, it could be tightened:
- Only use text fallback when `challengeTrackIdsRef.current.size === 0` (playlist not yet loaded)
- Once IDs are resolved, trust the ID set exclusively for matched songs; text fallback only for songs that weren't in the playlist at all

**Verdict:** Acceptable for now. The original bug (challenge song never detected) was worse than occasional false positives. Document as known limitation.

## Workflow & Failure-Path Defects

No additional findings beyond FINDING-1 and FINDING-2 above.

## Unproven Assumptions

| Assumption | Risk if wrong | How to verify |
|---|---|---|
| `runtime.extensionMs` is always included in broadcast/poll payloads | Guest would never be able to account for extensions | Check `validateRuntimeState` includes `extensionMs` — ✓ confirmed at line 186 |
| Track changes always produce a new `updatedAt` | Anchor wouldn't reset, stale ticks would accumulate | `commitRuntime` always sets `updatedAtMs: Date.now()` — ✓ confirmed |
| `matchesChallengeSong` rejects empty-string challenge entries | False positives on every track | `getChallengeSongs` requires both `artist` and `title` non-empty — ✓ confirmed |

## Recommended Fix Order

1. **FINDING-1** (extensionMs) — simple one-line config adjustment, eliminates the most visible user-facing bug
2. **FINDING-2** (tick flash) — synchronous reset pattern, prevents metadata flash on projection
3. **FINDING-3** (text fallback) — optional tightening, low urgency

## Minor Observations

- The `eslint-disable-next-line react-hooks/exhaustive-deps` on the anchor useMemo is justified (intentionally excluding `serverProgress` to only recalculate on genuinely new data), but a brief inline comment would help future readers.
