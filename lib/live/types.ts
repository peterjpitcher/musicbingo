export const LIVE_SESSION_VERSION = "music-bingo-live-session-v1" as const;
export const LIVE_RUNTIME_VERSION = "music-bingo-live-runtime-v1" as const;

export type LiveMode = "idle" | "running" | "paused" | "break" | "ended";

export type RevealConfig = {
  albumMs: number;
  titleMs: number;
  artistMs: number;
  nextMs: number;
};

export const DEFAULT_REVEAL_CONFIG: RevealConfig = {
  albumMs: 15_000,
  titleMs: 30_000,
  artistMs: 40_000,
  nextMs: 60_000,
};

/** Challenge songs play for 90 seconds instead of 60. */
export const CHALLENGE_REVEAL_CONFIG: RevealConfig = {
  albumMs: 10_000,
  titleMs: 20_000,
  artistMs: 25_000,
  nextMs: 90_000,
};

export type ChallengeSong = {
  artist: string;
  title: string;
  type: 'sing-along' | 'dance-along';
};

export type IntroSong = {
  type: 'dance-along' | 'sing-along';
  spotifyUrl: string;
  trackId: string;
  artist: string;
  title: string;
};

export type LiveGameConfig = {
  gameNumber: 1 | 2;
  theme: string;
  playlistId: string;
  playlistName: string;
  playlistUrl: string | null;
  totalSongs: number;
  addedCount: number;
  /** Artist of the challenge song for this game (user-entered, may be "" for legacy sessions). */
  challengeSongArtist: string;
  /** Title of the challenge song for this game (user-entered, may be "" for legacy sessions). */
  challengeSongTitle: string;
  /** Up to 5 challenge songs per game. Authoritative when present; falls back to single legacy pair. */
  challengeSongs?: ChallengeSong[];
  /** @deprecated Use introSongs instead */
  introSongArtist?: string;
  /** @deprecated Use introSongs instead */
  introSongTitle?: string;
  introSongs?: IntroSong[];
};

/** Raw prep-screen inputs stored so the event pack ZIP can be re-generated from the host dashboard. */
export type PrepData = {
  game1SongsText: string;
  game2SongsText: string;
  game1Theme: string;
  game2Theme: string;
  game1ChallengeSong: string;
  game2ChallengeSong: string;
  cardCount: number;
  /** Multiple challenge songs per game (artist|||title format). */
  game1ChallengeSongs?: string[];
  game2ChallengeSongs?: string[];
  /** Intro songs (artist|||title format). */
  game1IntroSong?: string;
  game2IntroSong?: string;
};

export type LiveSessionV1 = {
  version: typeof LIVE_SESSION_VERSION;
  id: string;
  name: string;
  createdAt: string;
  eventDateInput: string;
  eventDateDisplay: string;
  games: [LiveGameConfig, LiveGameConfig] | LiveGameConfig[];
  revealConfig: RevealConfig;
  /** Spotify playlist URL/ID to play during breaks. Empty string = manual host control. */
  breakPlaylistId: string;
  /** Raw prep inputs for re-generating the event pack ZIP without revisiting the prep screen. */
  prepData?: PrepData;
  /** Brand ID for venue theming. Null = use default brand. */
  brandId?: string;
};

export type LiveTrackSnapshot = {
  trackId: string | null;
  title: string;
  artist: string;
  albumImageUrl: string | null;
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
};

export type LiveRevealState = {
  showAlbum: boolean;
  showTitle: boolean;
  showArtist: boolean;
  shouldAdvance: boolean;
};

export type LiveRuntimeState = {
  version: typeof LIVE_RUNTIME_VERSION;
  sessionId: string;
  mode: LiveMode;
  activeGameNumber: 1 | 2 | null;
  spotifyControlAvailable: boolean;
  currentTrack: LiveTrackSnapshot | null;
  revealState: LiveRevealState;
  advanceTriggeredForTrackId: string | null;
  warningMessage: string | null;
  /** True when the currently playing track is the challenge song for the active game. */
  isChallengeSong: boolean;
  /** The type of challenge when isChallengeSong is true. Null when not a challenge song. */
  challengeType: 'sing-along' | 'dance-along' | null;
  /** Track ID stored before going to break, so resume can restart it from the beginning. */
  preBreakTrackId: string | null;
  /** Playlist ID stored before going to break, so resume can restart in the right context. */
  preBreakPlaylistId: string | null;
  /** Extra ms added to the auto-advance threshold via the +30s button. Resets to 0 on track change. */
  extensionMs: number;
  /** When true, auto-advance is disabled and songs play in full (free play / post-round mode). */
  freePlay: boolean;
  /** True when playing the intro song (track 1) before a game starts. Derived, not sticky. */
  isIntroSong: boolean;
  /** Flips true after first track change post-intro. Persisted in localStorage. Prevents re-trigger after refresh. */
  introPlayed: boolean;
  updatedAtMs: number;
};

export type LiveControlLock = {
  tabId: string;
  lastSeenMs: number;
};

export type LiveChannelMessage =
  | {
    type: "runtime_update";
    runtime: LiveRuntimeState;
  }
  | {
    type: "host_heartbeat";
    hostId: string;
    timestampMs: number;
  }
  | {
    type: "warning";
    message: string;
    timestampMs: number;
  }
  | {
    type: "brand_update";
    brand: import("@/lib/brands/types").BrandConfig;
  };

export function makeEmptyRuntimeState(sessionId: string): LiveRuntimeState {
  return {
    version: LIVE_RUNTIME_VERSION,
    sessionId,
    mode: "idle",
    activeGameNumber: null,
    spotifyControlAvailable: true,
    currentTrack: null,
    revealState: {
      showAlbum: false,
      showTitle: false,
      showArtist: false,
      shouldAdvance: false,
    },
    advanceTriggeredForTrackId: null,
    warningMessage: null,
    isChallengeSong: false,
    challengeType: null,
    preBreakTrackId: null,
    preBreakPlaylistId: null,
    extensionMs: 0,
    freePlay: false,
    isIntroSong: false,
    introPlayed: false,
    updatedAtMs: Date.now(),
  };
}

/** Returns the effective challenge songs for a game. Uses the array when present, falls back to the single legacy pair. */
export function getChallengeSongs(game: LiveGameConfig): ChallengeSong[] {
  if (game.challengeSongs && game.challengeSongs.length > 0) {
    return game.challengeSongs.map((s) => ({
      artist: s.artist,
      title: s.title,
      type: s.type ?? 'sing-along',
    }));
  }
  if (game.challengeSongArtist && game.challengeSongTitle) {
    return [{ artist: game.challengeSongArtist, title: game.challengeSongTitle, type: 'sing-along' as const }];
  }
  return [];
}

/** Returns the effective intro songs for a game. Uses the array when present, falls back to legacy single pair. */
export function getIntroSongs(game: LiveGameConfig): IntroSong[] {
  if (game.introSongs && game.introSongs.length > 0) {
    return game.introSongs;
  }
  if (game.introSongArtist && game.introSongTitle) {
    return [{
      type: 'sing-along' as const,
      spotifyUrl: '',
      trackId: '',
      artist: game.introSongArtist,
      title: game.introSongTitle,
    }];
  }
  return [];
}
