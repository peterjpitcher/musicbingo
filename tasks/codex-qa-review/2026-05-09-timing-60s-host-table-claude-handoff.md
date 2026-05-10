# Claude Hand-Off Brief: 60s Song Duration + Host Dashboard Table

**Generated:** 2026-05-09
**Review mode:** A (Adversarial Challenge)
**Overall risk:** High (3 blocking findings — all fixable at spec level before implementation)

## DO NOT REWRITE

- `lib/live/reveal.ts` — the reveal phase computation is correct and config-driven; no changes needed
- `CHALLENGE_REVEAL_CONFIG` — 90s stays as-is
- `+30s` extension / `Skip 30s` / `Restart Song` logic — relative increments, still valid
- Host dashboard handlers (import, delete, re-download, brand update) — reuse in table
- Auto-advance idempotency guard (`shouldTriggerNextForTrack`) — sound

## SPEC REVISION REQUIRED

- [ ] **RISK-1/2/3**: Replace "change hardcoded text" approach with "derive from session config". All timing display (guest placeholders, guest countdown, host badges, host countdown) must read from the active `RevealConfig` — either `session.revealConfig` for normal songs or `CHALLENGE_REVEAL_CONFIG` for challenge songs. Never hardcode timing values in UI text.
- [ ] **SPEC-1**: Add Created date to table — either as its own column or as secondary text under session name (e.g. `<span className="text-xs text-slate-400">Created 9 May 2026</span>`).
- [ ] **SPEC-3**: Add legacy session regression test to testing plan — open a saved session with 40s config and verify host/guest show correct timing.
- [ ] **SPEC-2**: Change "run `npm test`" to `npm run verify` (or confirm `npm test` is defined in `package.json`).

## IMPLEMENTATION CHANGES REQUIRED

- [ ] **DEFAULT_REVEAL_CONFIG**: Update to `{ albumMs: 15_000, titleMs: 30_000, artistMs: 40_000, nextMs: 60_000 }` in `lib/live/types.ts:13-18`
- [ ] **Guest countdown** (`app/guest/[sessionId]/page.tsx:354`): Replace `(runtime.isChallengeSong ? 90_000 : 30_000)` with config-derived value. The session object is available as `session` state — use `session?.revealConfig?.nextMs ?? DEFAULT_REVEAL_CONFIG.nextMs` for normal songs, `CHALLENGE_REVEAL_CONFIG.nextMs` for challenge.
- [ ] **Guest placeholders** (`app/guest/[sessionId]/page.tsx:317,330,340`): Derive from active config instead of hardcoded strings. Use something like `Album reveals at ${Math.floor(cfg.albumMs / 1000)}s`.
- [ ] **Host badges** (`app/host/[sessionId]/page.tsx:1052-1054`): Derive label text from effective config, e.g. `Album @${Math.floor(cfg.albumMs / 1000)}s`.
- [ ] **Host fallback nextMs** (`app/host/[sessionId]/page.tsx:1025,1057`): Change fallback from `30_000` to `DEFAULT_REVEAL_CONFIG.nextMs` (import the constant instead of hardcoding).
- [ ] **Host challenge description** (`app/host/[sessionId]/page.tsx:1108`): Change "90s instead of 40s" to "90s instead of 60s" — OR derive both values from config.
- [ ] **Tests** (`lib/live/reveal.test.ts`): Update threshold assertions to match new 15/30/40/60 defaults.
- [ ] **Host dashboard** (`app/host/page.tsx`): Replace card grid with table, include Created column, remove `changingBrand` state, keep brand selector always visible inline.

## ASSUMPTIONS TO RESOLVE

- [ ] **DEFECT-1**: Check `lib/live/validate.ts` and `lib/live/storage.ts` — do they backfill missing `revealConfig` from `DEFAULT_REVEAL_CONFIG`? If yes, changing the default silently converts legacy sessions. Decide: keep old default in backfill, or accept conversion.
- [ ] **SPEC-1**: Confirm with user whether Created date should be a full column or secondary text.

## REPO CONVENTIONS TO PRESERVE

- Use `Badge` component for reveal phase indicators (already in use)
- Use `Button` component variants: `primary`, `secondary`, `danger` (already in use)
- Use `Card` for loading/empty states even in the table layout
- Use `Notice` component for success/error messages
- Use `AppHeader` with action buttons in the header area
- Keep `text-slate-*` colour palette — no new design tokens

## RE-REVIEW REQUIRED AFTER FIXES

- [ ] **RISK-1/2/3**: After implementing config-derived timing display, verify with both a new 60s session and a legacy 40s session
- [ ] **DEFECT-1**: After checking backfill path, confirm legacy sessions aren't silently converted

## REVISION PROMPT

```
Update the spec at tasks/spec-timing-and-host-table.md with these changes:

1. TIMING DISPLAY: All timing text in guest and host screens must derive from the active RevealConfig (session.revealConfig for normal songs, CHALLENGE_REVEAL_CONFIG for challenge songs). No hardcoded timing values in UI strings. Import DEFAULT_REVEAL_CONFIG for fallbacks instead of literal numbers.

2. HOST TABLE: Add Created date as secondary text under session name in the table. Remove changingBrand state — brand selector always visible inline.

3. TESTING: Add legacy 40s session regression test. Change "npm test" to "npm run verify".

4. CHECK: Verify lib/live/validate.ts for revealConfig backfill behaviour before implementing.

Then implement the changes following the updated spec.
```
