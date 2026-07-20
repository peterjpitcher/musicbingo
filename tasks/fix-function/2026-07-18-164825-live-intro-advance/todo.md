# Remediation plan

- [x] lib/live/introState.ts: anchor-based intro tracking (stale status, relinked ids, null holds)
- [x] lib/live/introState.test.ts: 8 unit tests covering the full sequence
- [x] lib/live/reveal.ts: updateAdvanceTrackMarker holds through empty playback (double-skip guard)
- [x] lib/live/reveal.test.ts: updated contract + new hold test
- [x] app/host/[sessionId]/page.tsx: intro anchor wiring (playIntroSong, startGame, applyStatusSnapshot), skip-retry with in-flight guard and marker-on-success, visibilitychange catch-up + warning
- [x] Verification: lint, typecheck, test:unit (122), test:py (7), test:e2e (9 flows), build, all green
- [x] Rediscovery pass: anchor-wipe ordering issue found and fixed (clear only on intro finish); nothing further

## Not changed (deliberate)
- Challenge song 90s cap (owner confirmed as designed)
- 401 circuit breaker stopping polls until Reconnect (intentional)

## Live verification note
Intro and skip-retry behaviour depends on real Spotify playback and cannot be
fully proven with mocks; verify at the next live run: play each game's intro
(should run to the very end and wait), and mid-game briefly kill the speaker's
network (song should auto-skip within a few seconds of it returning).
