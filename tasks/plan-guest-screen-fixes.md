# Plan: Guest Screen — Challenge Song Indicator & Progress Interpolation

**Spec:** `tasks/spec-guest-screen-fixes.md`
**Review:** `tasks/codex-qa-review/2026-05-10-guest-screen-fixes-*`
**Complexity:** S (2 files, ~70 LOC net change, no schema changes)

## Task Breakdown

### Phase 1: Host — Challenge Detection Fix

**File:** `app/host/[sessionId]/page.tsx`

- [x] 1.1 Extract `detectChallenge(track)` helper inside `applyStatusSnapshot` that checks ID set first, then falls through to text-based `matchesChallengeSong()`
- [x] 1.2 Replace the existing ternary detection block with calls to `detectChallenge`
- [x] 1.3 Preserve intro-takes-precedence logic (`isIntroSong ? false : ...`)
- [x] 1.4 Preserve sticky behaviour on same track (`prev.isChallengeSong || detectChallenge(track)`)

### Phase 2: Guest — Progress Interpolation Hook

**File:** `app/guest/[sessionId]/page.tsx`

- [x] 2.1 Add `useInterpolatedProgress(runtime)` hook above the component
- [x] 2.2 Use `useMemo` to create an anchor object keyed on `[updatedAt, trackId]`
- [x] 2.3 Add tick counter state with synchronous render-time reset when anchor changes (not useEffect — lint forbids setState in effects)
- [x] 2.4 Add `setInterval` effect incrementing tick every 1000ms while `isPlaying && trackId`
- [x] 2.5 Return `anchor.progress + tick * 1000` (or just `anchor.progress` when paused)
- [x] 2.6 Call the hook before any early returns to satisfy rules-of-hooks

### Phase 3: Guest — Local Reveal State

**File:** `app/guest/[sessionId]/page.tsx`

- [x] 3.1 Import `computeRevealState` from `@/lib/live/reveal`
- [x] 3.2 Compute `effectiveNextCfg` incorporating `runtime.extensionMs` into `nextMs`
- [x] 3.3 Compute `localRevealState` from `interpolatedProgress` + `effectiveNextCfg`
- [x] 3.4 Replace all `runtime.revealState.showAlbum/showTitle/showArtist/shouldAdvance` references with `localRevealState.*`
- [x] 3.5 Update footer progress display to use `interpolatedProgress` instead of `runtime.currentTrack?.progressMs`

### Phase 4: Verification

- [x] 4.1 `npm run lint` — zero errors
- [x] 4.2 `npx tsc --noEmit` — clean
- [x] 4.3 `npm run build` — success
- [ ] 4.4 Manual smoke test: challenge banner appears on guest
- [ ] 4.5 Manual smoke test: progress ticks every second
- [ ] 4.6 Manual smoke test: +30s extension respected on guest
- [ ] 4.7 Manual smoke test: no flash on track transition

## Dependencies

```
Phase 1 (host detection) ──→ independent
Phase 2 (interpolation hook) ──→ independent
Phase 3 (local reveal) ──→ depends on Phase 2 (uses interpolatedProgress)
Phase 4 (verification) ──→ depends on all above
```

Phases 1 and 2 can be done in parallel. Phase 3 builds on Phase 2's hook output.

## Implementation Status

All code changes (Phases 1–3) and automated verification (4.1–4.3) are complete.
Remaining: manual smoke testing (4.4–4.7) requires running the dev server with a Spotify session.
