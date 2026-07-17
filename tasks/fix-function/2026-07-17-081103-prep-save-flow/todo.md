# Remediation plan

- [x] lib/prepDraft.ts: versioned draft type, sanitiser, read/write/clear (quota-safe)
- [x] lib/prepDraft.test.ts: round trip, corrupt JSON, wrong version, entry normalisation, no-window safety (7 tests)
- [x] app/prep/page.tsx: draft restore/write effects, discard, stable session id, persistLiveSession(), savingLive state, draft notice UI, makeEmptyChallengeEntries() dedupe
- [x] app/prep/StepGenerateConnect.tsx: always-visible Live Session block, disabled-with-reason, saving state on buttons
- [x] scripts/e2e-flows.mjs: Flow 9 covers type songs -> reload -> restore -> discard
- [x] Verification pipeline: lint, typecheck, test:unit (113), test:py (7), test:e2e (9 flows), build, all green
- [x] Rediscovery pass over changed files: no new in-scope defects

## Remediation passes
1. Initial discovery and fixes (FF-001..FF-006)
2. Focused rediscovery over changed files: surfaced nothing new in scope

## Remaining risks / out of scope
- FF-007: re-save refreshes createdAt so the dashboard reorders (accepted)
- Edit mode (?session=) never uses draft autosave, including the rare case where
  edit hydration fails and the user proceeds as a new game with the param still
  in the URL (accepted; remove the query param to get draft protection)
