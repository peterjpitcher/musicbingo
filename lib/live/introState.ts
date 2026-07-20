/**
 * Anchor-based tracking for intro (dance-along / sing-along) song playback.
 *
 * Why this exists: Spotify's playback status is eventually consistent. Right
 * after the host commands the intro track to play, status can still report the
 * previous track for a tick or two, and market relinking can make the playing
 * track carry a different id than the one requested. A naive id comparison
 * flips the "intro is playing" flag off during those windows, which puts the
 * intro on the normal song timer and cuts it short.
 *
 * The model: when the intro command succeeds we record the expected track id,
 * the track that was current at command time (whose stale reports we ignore),
 * and an anchor that starts empty. The first plausible playing track becomes
 * the anchor (the expected id, or an unknown id treated as a relinked copy).
 * The intro is only considered finished when playback moves AWAY from the
 * anchor to a different real track. Null/absent playback holds the intro flag
 * so gaps between tracks or API blips cannot end it.
 */

export type IntroTracking = {
  /** Track id the host asked Spotify to play. */
  expectedTrackId: string;
  /** Track that was current when the command was sent; stale status may still report it. */
  ignoreTrackId: string | null;
  /** Track id actually observed playing as the intro (expected id or a relinked variant). */
  anchorTrackId: string | null;
};

export type IntroPlaybackResult = {
  tracking: IntroTracking;
  isIntroSong: boolean;
  introFinished: boolean;
};

export function makeIntroTracking(params: {
  expectedTrackId: string;
  currentTrackId: string | null;
}): IntroTracking {
  return {
    expectedTrackId: params.expectedTrackId,
    // If the current track already IS the intro, there is nothing stale to ignore.
    ignoreTrackId:
      params.currentTrackId && params.currentTrackId !== params.expectedTrackId
        ? params.currentTrackId
        : null,
    anchorTrackId:
      params.currentTrackId === params.expectedTrackId ? params.expectedTrackId : null,
  };
}

export function trackIntroPlayback(
  tracking: IntroTracking,
  observedTrackId: string | null
): IntroPlaybackResult {
  if (observedTrackId == null) {
    // No playback info this tick (gap between tracks, API blip): hold as intro.
    return { tracking, isIntroSong: true, introFinished: false };
  }

  if (tracking.anchorTrackId != null) {
    if (observedTrackId === tracking.anchorTrackId) {
      return { tracking, isIntroSong: true, introFinished: false };
    }
    return { tracking, isIntroSong: false, introFinished: true };
  }

  if (observedTrackId === tracking.expectedTrackId) {
    return {
      tracking: { ...tracking, anchorTrackId: observedTrackId },
      isIntroSong: true,
      introFinished: false,
    };
  }

  if (tracking.ignoreTrackId != null && observedTrackId === tracking.ignoreTrackId) {
    // Spotify is still reporting the pre-intro track; the intro has not surfaced yet.
    return { tracking, isIntroSong: true, introFinished: false };
  }

  // Unknown track while waiting for the intro to surface: treat it as a
  // market-relinked copy of the requested track and adopt it as the anchor.
  return {
    tracking: { ...tracking, anchorTrackId: observedTrackId },
    isIntroSong: true,
    introFinished: false,
  };
}
