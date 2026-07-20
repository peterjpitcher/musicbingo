# Defect log: live intro playback and auto-advance

Owner confirmations (2026-07-18): URL intro songs play in full then wait for the
host; challenge songs keep the 90s cap; failed auto-skips retry until they work;
background tab gets a warning plus instant catch-up on return.

| ID | Type | Severity | Confidence | Status |
|----|------|----------|------------|--------|
| FF-101 | Bug (reported: intros cut short) | Critical | High | Fixed |
| FF-102 | Bug (reported: auto-advance stalls) | High | High | Fixed |
| FF-103 | Bug (double-skip risk) | Medium | Medium | Fixed |
| FF-104 | UX gap (background throttling) | Medium | Medium | Fixed |
| FF-105 | Requirement check (90s challenge cap) | n/a | n/a | Confirmed by owner, no change |

## FF-101: Intro songs cut at the normal song timer
- Evidence: app/host/[sessionId]/page.tsx applyStatusSnapshot: introPlayed flipped
  on any trackChanged while isIntroSong, including the first status report AFTER
  pressing Play (currentTrack was null, so trackChanged fired for the intro track
  itself). Two ticks later isIntroSong=false and the normal reveal config
  auto-advanced the intro at nextMs (~45s). Amplifiers: the command route reads
  playback state immediately after the play command (stale, often still the old
  track) and Spotify market relinking can report a different track id than the
  requested one, so the id comparison against introTrackIdRef fails.
- Fix: anchor-based intro tracking (lib/live/introState.ts). playIntroSong
  records {expected, ignore (pre-intro track), anchor}. Status ticks hold the
  intro flag through stale/null/relinked reports; the intro only finishes when
  playback moves away from the observed anchor track. Fallback (refresh
  mid-intro) keeps the id comparison but no longer marks the intro finished when
  the changed-to track IS the intro.
- Acceptance: unit tests for hold-on-stale, adopt-expected, adopt-relinked,
  hold-on-null, finish-on-change-away.

## FF-102: One failed skip permanently stalls that song
- Evidence: pollStatus set advanceTriggeredForTrackId BEFORE posting next; on a
  failed POST (Spotify 5xx/429, device blip 409) the marker stayed, and
  shouldTriggerNextForTrack suppressed all retries for that track.
- Fix: marker is now set only after a successful next; an in-flight ref stops
  duplicate posts; failures leave the marker clear so the next 2s poll retries;
  after 3 consecutive failures a visible "retrying automatically" error shows.

## FF-103: Transient empty playback could re-arm the trigger (double skip)
- Evidence: updateAdvanceTrackMarker returned null when trackId was null, so a
  momentary "nothing playing" gap between tracks cleared the marker and the next
  stale report of the old track could fire a second next.
- Fix: the marker now holds through null trackIds and clears only when a
  different real track appears. Unit tests added.

## FF-104: Background tab silently suspends the game engine
- Evidence: no visibilitychange handling; browsers throttle the 2s poll to about
  once a minute in hidden tabs, so reveals and auto-skips stall.
- Fix: on returning to the tab the app polls immediately, and if the tab was
  hidden more than 10s during a running game it shows a warning to keep the host
  screen visible.

## Sibling checks
- Python module has no advance/intro logic (no cross-language parity impact).
- Display page consumes isIntroSong only as a boolean; semantics unchanged.
- Welcome song path does not use the intro flag; unaffected.
- The 401 circuit breaker (stops polling until Reconnect) is intentional and was
  not last night's failure (manual commands worked); left unchanged.
