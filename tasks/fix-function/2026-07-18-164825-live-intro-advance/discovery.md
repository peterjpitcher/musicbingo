# Discovery: live intro playback and auto-advance

## Reported symptoms (game night 2026-07-16)
1. Both URL-configured songs (Game 1 dance-along, Game 2 sing-along) stopped
   suddenly instead of playing in full.
2. During Game 2, some songs stopped auto-progressing and needed manual skips.

## How the engine works
- Host page polls /api/spotify/live/status every 2s (app/host/[sessionId]/page.tsx pollStatus).
- Normal songs auto-skip once progressMs passes revealConfig.nextMs (default 45s).
- Challenge songs use CHALLENGE_REVEAL_CONFIG (90s cap) via matchChallengeSong.
- Intro songs are exempt from auto-skip while runtime.isIntroSong is true.
- isIntroSong was recomputed each tick as: !introPlayed && trackId === introTrackIdRef.

## Root causes found
1. Intro cut short: applyStatusSnapshot flipped introPlayed on ANY track change
   while isIntroSong, including the change from null to the intro track itself
   right after pressing Play (the command route reads playback state immediately
   after the play command, and Spotify's status is eventually consistent, so
   currentTrack was usually null/stale at that point). Two ticks later the
   intro lost its exemption and the normal 45s timer cut it. Spotify market
   relinking (different reported track id) breaks the id comparison the same way.
2. Auto-advance stalls: the advanceTriggeredForTrackId marker was set BEFORE the
   skip command was sent; any failed send left the marker in place, permanently
   suppressing auto-skip for that song.
3. Double-skip risk: updateAdvanceTrackMarker cleared the marker when playback
   momentarily reported no track, re-arming the trigger while stale reports of
   the old track could still arrive.
4. Background throttling: no visibilitychange handling; hidden tabs throttle the
   2s poll to ~1/minute, stalling reveals and auto-skips.

## Owner decisions (2026-07-18)
- URL intro songs: play in full, then wait for the host.
- Challenge songs: keep the 90s cap.
- Failed skips: retry until they work, with a visible warning.
- Backgrounding: warn plus instant catch-up on return.
