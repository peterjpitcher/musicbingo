import type { ScreenId } from "@/lib/live/runOfShow";
import type { ContentKey } from "@/lib/live/content";

export const LIVE_SESSION_VERSION = "music-bingo-live-session-v1" as const;
export const LIVE_RUNTIME_VERSION = "music-bingo-live-runtime-v1" as const;

export type LiveMode = "idle" | "running" | "paused" | "break" | "ended";

export type RevealConfig = {
  albumMs: number;
  titleMs: number;
  artistMs: number;
  nextMs: number;
};

export type RevealRatios = {
  album: number;
  title: number;
  artist: number;
};

export const DEFAULT_SONG_PLAY_MS = 45_000;
export const MIN_SONG_PLAY_MS = 15_000;
export const MAX_SONG_PLAY_MS = 300_000;
export const MAX_SONG_EXTENSION_MS = 300_000;

const DEFAULT_REVEAL_RATIOS: RevealRatios = {
  album: 10_000 / 45_000,
  title: 15_000 / 45_000,
  artist: 20_000 / 45_000,
};

const CHALLENGE_REVEAL_RATIOS: RevealRatios = {
  album: 10_000 / 90_000,
  title: 20_000 / 90_000,
  artist: 25_000 / 90_000,
};

function sanitizeSongPlayMs(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_SONG_PLAY_MS;
  return Math.min(MAX_SONG_PLAY_MS, Math.max(MIN_SONG_PLAY_MS, Math.round(ms)));
}

function clampRatio(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function makeRevealConfigFromNextMs(nextMs: number, ratios: RevealRatios): RevealConfig {
  const safeNextMs = Math.max(1, Math.round(nextMs));
  const albumRatio = clampRatio(ratios.album, DEFAULT_REVEAL_RATIOS.album);
  const titleRatio = clampRatio(ratios.title, DEFAULT_REVEAL_RATIOS.title);
  const artistRatio = clampRatio(ratios.artist, DEFAULT_REVEAL_RATIOS.artist);
  const albumMs = Math.min(safeNextMs, Math.max(0, Math.round(safeNextMs * albumRatio)));
  const titleMs = Math.min(safeNextMs, Math.max(albumMs, Math.round(safeNextMs * titleRatio)));
  const artistMs = Math.min(safeNextMs, Math.max(titleMs, Math.round(safeNextMs * artistRatio)));
  return { albumMs, titleMs, artistMs, nextMs: safeNextMs };
}

function ratiosFromRevealConfig(cfg: RevealConfig): RevealRatios {
  if (!Number.isFinite(cfg.nextMs) || cfg.nextMs <= 0) return DEFAULT_REVEAL_RATIOS;
  return {
    album: cfg.albumMs / cfg.nextMs,
    title: cfg.titleMs / cfg.nextMs,
    artist: cfg.artistMs / cfg.nextMs,
  };
}

export function makeRevealConfigForSongPlayMs(ms: number): RevealConfig {
  return makeRevealConfigFromNextMs(sanitizeSongPlayMs(ms), DEFAULT_REVEAL_RATIOS);
}

export function getRevealConfigWithExtension(cfg: RevealConfig, extensionMs: number): RevealConfig {
  if (!Number.isFinite(extensionMs) || extensionMs <= 0) return cfg;
  return makeRevealConfigFromNextMs(cfg.nextMs + Math.round(extensionMs), ratiosFromRevealConfig(cfg));
}

export const DEFAULT_REVEAL_CONFIG: RevealConfig = makeRevealConfigForSongPlayMs(DEFAULT_SONG_PLAY_MS);

/** Challenge songs play longer than normal songs and use their own relative reveal points. */
export const CHALLENGE_REVEAL_CONFIG: RevealConfig = makeRevealConfigFromNextMs(90_000, CHALLENGE_REVEAL_RATIOS);

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
  /** Per-event editable TV text (spec A3). Bounded to ContentKey. */
  content?: Partial<Record<ContentKey, string>>;
  /** Session default layout variants for the Welcome / Title screens. */
  welcomeVariant?: "A" | "B" | "C";
  titleVariant?: "A" | "B" | "C";
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

/**
 * Minimal record of a played song for the Bingo Claim list. Deliberately lighter
 * than `LiveTrackSnapshot` (no album art, progress or duration) because the whole
 * `playedTracks` array rides every runtime broadcast + Supabase write, and the
 * claim screen only ever shows the number, title and artist.
 */
export type PlayedTrack = {
  trackId: string;
  title: string;
  artist: string;
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
  /**
   * Songs played so far in the active game, oldest first. Appended on each track
   * change (deduped by trackId) and reset to [] when a game starts, so the Bingo
   * Claim screen can list exactly the songs played this game for the host to
   * validate a claim. Optional/back-compat: older runtimes omit it.
   */
  playedTracks?: PlayedTrack[];
  revealState: LiveRevealState;
  /** Normal-song reveal timing for this live run. Mirrored here so open guest screens receive timing changes. */
  revealConfig?: RevealConfig;
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
  /** Extra ms added to the reveal schedule via the +30s and Skip 30s buttons. Resets to 0 on track change. */
  extensionMs: number;
  /** When true, auto-advance is disabled and songs play in full (free play / post-round mode). */
  freePlay: boolean;
  /** True when playing the intro song (track 1) before a game starts. Derived, not sticky. */
  isIntroSong: boolean;
  /** Flips true after first track change post-intro. Persisted in localStorage. Prevents re-trigger after refresh. */
  introPlayed: boolean;
  /** Current run-of-show screen on the TV. Omitted unless the host explicitly sets it; when absent the render layer derives a screen (deriveScreenId). */
  screenId?: ScreenId;
  /** Live content snapshot pushed to the TV (spec A3), overrides session content. */
  content?: Partial<Record<ContentKey, string>>;
  /** Host-selected layout variants for the Welcome / Title screens. */
  welcomeVariant?: "A" | "B" | "C";
  titleVariant?: "A" | "B" | "C";
  /**
   * Resolved Spotify track for the Welcome (idle) screen's song line. Set by the host from a
   * pasted track link; persisted on the runtime so the Play button always has the URI and the
   * choice survives a refresh. The on-screen song text is driven separately by the
   * `introTitle`/`introArtist` content keys — this field exists purely to back manual playback.
   */
  welcomeSong?: WelcomeSong;
  updatedAtMs: number;
};

export type WelcomeSong = {
  trackId: string;
  uri: string;
  title: string;
  artist: string;
};

export const DEFAULT_WELCOME_SONG: WelcomeSong = {
  trackId: "2LScqpywMqGcnum6nNaxXX",
  uri: "spotify:track:2LScqpywMqGcnum6nNaxXX",
  title: "Yes Sir, I Can Boogie",
  artist: "Baccara",
};

export function withDefaultWelcomeSong(runtime: LiveRuntimeState): LiveRuntimeState {
  return runtime.welcomeSong ? runtime : { ...runtime, welcomeSong: DEFAULT_WELCOME_SONG };
}

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
    playedTracks: [],
    revealState: {
      showAlbum: false,
      showTitle: false,
      showArtist: false,
      shouldAdvance: false,
    },
    revealConfig: DEFAULT_REVEAL_CONFIG,
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
    welcomeSong: DEFAULT_WELCOME_SONG,
    updatedAtMs: 0,
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
