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
  albumMs: 10_000,
  titleMs: 20_000,
  artistMs: 25_000,
  nextMs: 30_000,
};

/** Challenge songs play for 60 seconds instead of 30. */
export const CHALLENGE_REVEAL_CONFIG: RevealConfig = {
  albumMs: 10_000,
  titleMs: 20_000,
  artistMs: 25_000,
  nextMs: 60_000,
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
    updatedAtMs: Date.now(),
  };
}
