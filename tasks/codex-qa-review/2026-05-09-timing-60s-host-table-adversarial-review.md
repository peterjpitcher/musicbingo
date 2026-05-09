# Adversarial Review: 60s Song Duration + Host Dashboard Table

**Date:** 2026-05-09
**Mode:** A (Adversarial Challenge)
**Scope:** Pre-implementation spec review — `tasks/spec-timing-and-host-table.md`
**Pack:** `tasks/codex-qa-review/2026-05-09-timing-60s-host-table-review-pack.md`
**Reviewers:** Assumption Breaker, Integration & Architecture, Workflow & Failure-Path

## Executive Summary

The spec correctly identifies `DEFAULT_REVEAL_CONFIG` as the primary timing lever and the host page cards as the layout target. However, three independent reviewers converged on the same critical gap: **the spec replaces hardcoded UI literals with new hardcoded literals instead of deriving display values from the session's stored `revealConfig`**. This means existing 40s sessions and challenge songs would show incorrect timing hints on both host and guest screens. The host table conversion is sound but drops the Created timestamp, which is needed to distinguish duplicate session names.

## What Appears Solid

- Changing `DEFAULT_REVEAL_CONFIG` is the correct lever — `getRevealPhase` and `computeRevealState` default through it
- Leaving `CHALLENGE_REVEAL_CONFIG` at 90s is consistent
- The reveal test update plan is correct and necessary
- Host dashboard action handlers (import, delete, re-download, brand) can be reused directly in the table layout
- No schema migration needed — `revealConfig` is stored per-session in JSONB
- The `+30s` extension and `Skip 30s` logic are relative increments, still valid at 60s

## Critical Risks

### RISK-1: Guest countdown shows wrong baseline for legacy sessions (AB-001 / ARCH-001 / WF-001)
**Severity: High | Confidence: High | Blocking**

The guest page line 354 currently hardcodes `(runtime.isChallengeSong ? 90_000 : 30_000)` for the "Next song at" display. The spec plans to change `30_000` → `60_000`. But existing sessions store `revealConfig.nextMs = 40_000` in their JSONB. After this change, a guest viewing an old session would see "Next song at 60s" while the host actually advances at 40s.

**Fix:** Derive the baseline from the session's `revealConfig.nextMs` (available via `session` state), not from a hardcoded constant.

### RISK-2: Guest placeholder text wrong for challenge songs AND legacy sessions (AB-002 / ARCH-002 / WF-002)
**Severity: Medium | Confidence: High | Blocking**

Guest lines 317/330/340 show "Album reveals at 10s", "Title reveals at 20s", "Artist reveals at 25s". The spec changes these to 15s/30s/40s. But:
- Challenge songs use `CHALLENGE_REVEAL_CONFIG` (10s/20s/25s) — the new placeholders would be wrong
- Legacy 40s sessions have different thresholds — also wrong

**Fix:** Derive placeholder text from the active reveal config (challenge vs normal, and respecting per-session stored config).

### RISK-3: Host controller badge labels also hardcoded (ARCH-003 / WF-003)
**Severity: Medium | Confidence: Medium | Blocking**

Host line 1052-1054 shows `Album @10s`, `Title @20s`, `Artist @25s`. Same problem — hardcoded labels don't reflect challenge config or legacy sessions. The fallback `nextMs: 30_000` on lines 1025/1057 would also be wrong for legacy sessions.

**Fix:** Derive badge labels from the effective config (challenge or session-stored).

## Implementation Defects

### DEFECT-1: Legacy session import/migration may backfill config (AB-003)
**Severity: Medium | Confidence: Medium**

If `importLiveSessionJson` or `migrateLocalSessionsToSupabase` backfill a missing `revealConfig` from `DEFAULT_REVEAL_CONFIG`, changing the default silently converts old sessions to 60s. The spec claims no migration needed but doesn't verify this path.

**Action:** Check `lib/live/validate.ts` and `lib/live/storage.ts` for default backfill behaviour.

### DEFECT-2: Race between brand change and re-download in table (WF-004)
**Severity: Medium | Confidence: Medium**

If a host changes the inline brand selector and immediately clicks Re-download before the async PUT + refresh completes, the re-download uses the stale `session.brandId`.

**Action:** Disable re-download while brand update is in-flight, or optimistically update local state.

## Architecture & Integration Defects

### ARCH-1: Stale `changingBrand` state after table conversion (ARCH-004)
**Severity: Low | Confidence: Medium**

The current card layout uses `changingBrand` state to toggle the brand selector. The table spec makes brand selectors always visible, so this state becomes dead code. Remove it.

## Spec Defects

### SPEC-1: Table drops Created timestamp (AB-004 / WF-005)
**Severity: Medium | Confidence: High**

The proposed table columns omit Created date. With multiple sessions sharing the same name and event date, there's no way to distinguish them. The current card layout shows Created.

**Decision needed:** Add Created as a column, or show it as secondary text under the session name.

### SPEC-2: Test command mismatch (AB-005)
**Severity: Low | Confidence: Medium**

The spec says "run `npm test`" but the project documents `npm run verify` as the full pipeline. Clarify.

### SPEC-3: No legacy session regression test (WF-006)
**Severity: Medium | Confidence: High**

The testing plan verifies new 60s behaviour but never opens a saved 40s session to confirm it still works. This is the primary user concern.

**Action:** Add a test fixture with stored 13s/27s/33s/40s config and verify host/guest display the correct times.

## Unproven Assumptions

1. **All existing sessions have `revealConfig` stored** — if any legacy sessions lack this field, the default backfill path determines their behaviour. Verify in `lib/live/validate.ts`.
2. **Badge labels are purely presentational** — if any host logic reads badge text to derive behaviour, changing them has side effects. Verify they're display-only.

## Recommended Fix Order

1. **Derive all timing display text from session config** (RISK-1, RISK-2, RISK-3) — this is the foundational fix
2. **Update `DEFAULT_REVEAL_CONFIG`** — the simple part
3. **Update tests** — match new defaults
4. **Check import/migration backfill** — verify DEFECT-1
5. **Add Created column to table spec** — resolve SPEC-1
6. **Convert host dashboard to table** — ARCH-1 cleanup included
7. **Add legacy session regression test** — SPEC-3

## Minor Observations

- The `+30s` button title says "max 5 minutes total" — still correct at 60s base (300s cap)
- Python test suite doesn't cover reveal timing — no changes needed there
- The guest page's `formatSeconds` helper is fine — it just formats progress, not thresholds
