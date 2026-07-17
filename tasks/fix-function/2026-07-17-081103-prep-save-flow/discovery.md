# Discovery: prep wizard save flow

## Reported symptom
After adding all songs and reaching the last wizard stage there is no save button, and a whole game's prep was lost.

## Problem perimeter
- app/prep/page.tsx (wizard state owner, save/export/generate handlers)
- app/prep/StepGenerateConnect.tsx (final step UI, owns the save button)
- app/prep/StepGameConfig.tsx, StepEventSetup.tsx (earlier steps, state via props)
- lib/live/sessionApi.ts (client persistence), app/api/sessions/route.ts (PUT upsert)
- lib/live/validate.ts (server validation: playlistId REQUIRED per game, line 61)
- lib/live/storage.ts (localStorage idiom used elsewhere in the app)
- scripts/e2e-flows.mjs (Playwright flows exercise the wizard; fresh context per flow)

## Root-cause chain
1. The "Save Live Session" button only renders when `livePlaylistByGame` is truthy
   (StepGenerateConnect.tsx:333). That requires BOTH Spotify playlists created
   successfully. Until then the save affordance is invisible, not disabled.
2. Server validation genuinely requires both playlist IDs (validate.ts:61), so a
   session cannot be saved without playlists. The contract is fine; the UX hides it.
3. All wizard state is volatile React state. Any refresh, crash, or navigation
   before a successful save loses everything typed. This is the actual data loss.
4. Bonus defect found tracing the path: `buildLiveSessionPayload` mints a NEW id on
   every call (`editingSessionId ?? makeSessionId()`), so Generate Event Pack's
   auto-save plus a manual Save creates duplicate sessions.

## e2e safety check
Each flow in scripts/e2e-flows.mjs uses a fresh browser context (empty
localStorage), and flows 1-3 never re-navigate to /prep after typing, so a draft
autosave/restore feature cannot change existing flow behaviour.
