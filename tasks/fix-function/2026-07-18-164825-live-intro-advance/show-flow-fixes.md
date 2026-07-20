# Follow-up run: show flow fixes (owner decisions 2026-07-18)

Owner decisions on the six walkthrough items:
1. Break mid-game resume: FIX. 2. Wooden spoon second-lowest: intentional
(anti-sandbagging), no change, saved to memory. 3. Challenge bonus default: FIX.
4. Break countdown: FIX (live countdown). 5. Access fail-open without secret:
FIX (fail closed in production). 6. createdAt on re-save + edit-mode drafts: FIX.

| ID | Fix | Files | Status |
|----|-----|-------|--------|
| FF-201 | Resume interrupted game after a break: resume point stored only when a game (running or paused, not intro) was interrupted; "Resume Game N" button in break mode uses resume_from_track (restarts the interrupted song, keeps playedTracks); manual-mode fallback returns the TV to the game screen | GameFlowPanel.tsx, host page | Done |
| FF-202 | Award modal bonus box defaults to the active game's configured challenge bonus | AwardPointsModal.tsx, host page | Done |
| FF-203 | Break screen "Back In" is a live M:SS countdown from breakStartedAtMs (new runtime field, validated in storage.ts); "Back Any Minute Now" at zero; static editable number while editing | BreakScreen.tsx, types.ts, storage.ts, host page | Done |
| FF-204 | Access fails closed in production when APP_ADMIN_SECRET is unset (admin denied + server error log); signed display/host links still verify via the service-key fallback secret; local dev unchanged; 2 new unit tests | lib/live/access.ts, access.test.ts | Done |
| FF-205 | Re-saves preserve createdAt (repo already bumps updated_at); sessionCreatedAtRef seeded from the edited session or first save | app/prep/page.tsx | Done |
| FF-206 | Draft autosave in edit mode: per-session draft keys, restore over server hydration with notice, discard reloads saved state, baseline signature stops no-change drafts, draft cleared on save; 1 new unit test | lib/prepDraft.ts, prepDraft.test.ts, app/prep/page.tsx | Done |

Rediscovery pass: found and fixed the paused-mid-game break case (resume point
now also stored when mode is "paused"). Nothing further.

Live verification notes: break countdown and resume need a real Spotify session
to observe end-to-end; deploy fail-closed access only AFTER setting
APP_ADMIN_SECRET in Vercel or production admin access will be locked until set.
