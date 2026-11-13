"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useWakeLock } from "@anchor-nights/kit/tv";
import { PairTvForm } from "@anchor-nights/kit/pairing/screens";
import { AnchorLogo, Banner, buttonClass, Card, Dock } from "@anchor-nights/kit/ui";
import { pairTv } from "@/app/tv/actions";
import { useHostControl } from "@/hooks/useHostControl";
import { assertSignedIn, SignInRequiredError } from "@/lib/live/signInGuard";
import { publishLiveMessage } from "@/lib/live/channel";
import { ensureHostDeviceId } from "@/lib/live/hostDevice";
import { TAKEOVER_AFTER_S } from "@/lib/live/hostControl";
import { NowPlayingPanel } from "@/components/host/NowPlayingPanel";
import { GameFlowPanel } from "@/components/host/GameFlowPanel";
import { TimingPanel } from "@/components/host/TimingPanel";
import { ContentPanel } from "@/components/host/ContentPanel";
import { WelcomeSongPanel } from "@/components/host/WelcomeSongPanel";
import { PlaylistPanel } from "@/components/host/PlaylistPanel";
import { AwardPointsModal, type AwardPreset } from "@/components/host/AwardPointsModal";
import { SCREEN_REGISTRY } from "@/components/screens/registry";
import { ScoreToastOverlay } from "@/components/screens/ScoreToastOverlay";
import { EditContext, type EditContextValue } from "@/components/motifs/EditContext";
import { TvCornerLogo } from "@/components/motifs/TvCornerLogo";
import { gameSongTotal } from "@/lib/live/songCount";
import { SHOW_STEPS, adjacentShowStep, normalizeScreenId, showStepsFor, type ScreenId } from "@/lib/live/runOfShow";
import { resolveBreakPlaylist } from "@/lib/spotifyPlaylistId";
import { deriveScreenId } from "@/lib/live/deriveScreen";
import { getContent, type ContentKey } from "@/lib/live/content";
import { DEFAULT_BRAND_CONFIG } from "@/lib/brands/defaultBrand";
import type { BrandConfig } from "@/lib/brands/types";
import {
  computeRevealState,
  shouldRecoverRunningMode,
  shouldTriggerNextForTrack,
  updateAdvanceTrackMarker,
} from "@/lib/live/reveal";
import { makeIntroTracking, trackIntroPlayback, type IntroTracking } from "@/lib/live/introState";
import {
  findSongStartMs,
  nextSongStartMs,
  songProgressMs,
  songStartSeekIgnored,
  songStartSeekMs,
} from "@/lib/live/songStart";
import { getLiveSession, upsertLiveSession } from "@/lib/live/sessionApi";
import {
  formatSecondsInput,
  formatTimingMs,
  parseRevealConfigInputs,
} from "@/lib/live/timing";
import { readRuntimeState, writeRuntimeState } from "@/lib/live/storage";
import {
  clearQueuedRuntime,
  pushRuntimeState,
  queueRuntime,
  readQueuedRuntime,
  shouldRetry,
  syncStateFor,
  type SyncState,
} from "@/lib/live/runtimeSync";
import { matchChallengeSong } from "@/lib/live/challenge";
import {
  CHALLENGE_REVEAL_CONFIG,
  DEFAULT_CHALLENGE_BONUS_POINTS,
  DEFAULT_WELCOME_SONG,
  DEFAULT_REVEAL_CONFIG,
  MAX_SONG_EXTENSION_MS,
  MAX_SONG_PLAY_MS,
  MAX_TEAM_SCORE,
  MIN_SONG_PLAY_MS,
  LIVE_RUNTIME_VERSION,
  getRevealConfigWithExtension,
  getChallengeSongs,
  getIntroSongs,
  hasPlayableWarmup,
  makeEmptyRuntimeState,
  sanitizeChallengeBonusPoints,
  withDefaultWelcomeSong,
  type LiveRuntimeState,
  type LiveSessionV1,
  type LiveTeamScore,
  type LiveTrackSnapshot,
  type RevealConfig,
} from "@/lib/live/types";

const AWARD_PRESETS: AwardPreset[] = [
  { label: "1 Line", points: 15 },
  { label: "2 Lines", points: 25 },
  { label: "Full House", points: 50 },
  { label: "KaraFun 1st", points: 30 },
  { label: "KaraFun 2nd", points: 20 },
  { label: "KaraFun 3rd", points: 10 },
];

function getChallengeBonusPoints(game: LiveSessionV1["games"][number] | null): number {
  return sanitizeChallengeBonusPoints(game?.challengeBonusPoints ?? DEFAULT_CHALLENGE_BONUS_POINTS);
}

function getRevealConfig(
  session: LiveSessionV1,
  activeGameNumber: 1 | 2 | null,
  track: { title: string; artist: string } | null,
  normalRevealConfig: RevealConfig = session.revealConfig
): RevealConfig {
  const game = activeGameNumber
    ? session.games.find((g) => g.gameNumber === activeGameNumber) ?? null
    : null;
  return matchChallengeSong(track, game) ? CHALLENGE_REVEAL_CONFIG : normalRevealConfig;
}

type LiveStatusResponse = {
  connected?: boolean;
  canControlPlayback?: boolean;
  activeDevice?: {
    id?: string | null;
    name?: string;
    type?: string;
    isActive?: boolean;
    isRestricted?: boolean;
  } | null;
  playback?: {
    trackId?: string | null;
    title?: string;
    artist?: string;
    albumImageUrl?: string | null;
    progressMs?: number;
    durationMs?: number;
    isPlaying?: boolean;
  } | null;
  warnings?: unknown;
  error?: { code?: string; message?: string };
};

type LiveCommandResponse = LiveStatusResponse & {
  ok?: boolean;
  action?: string;
  /** A problem the host should see even though the command went through. */
  hostWarning?: string | null;
};

function makeScoreId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function getWinnersRevealTotal(runtime: LiveRuntimeState): number {
  const scoredTeamCount = runtime.teamScores.filter((team) => team.name.trim()).length;
  return scoredTeamCount > 0 ? scoredTeamCount : 2;
}

function getWinnersRevealCount(runtime: LiveRuntimeState): number {
  return Math.min(getWinnersRevealTotal(runtime), Math.max(0, runtime.winnersRevealCount));
}

function normalizeWarnings(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => (typeof value === "string" && value.trim() ? value.trim() : null))
    .filter((value): value is string => Boolean(value));
}

function normalizeTrackSnapshot(
  playback: LiveStatusResponse["playback"]
): LiveTrackSnapshot | null {
  if (!playback || typeof playback !== "object") return null;
  return {
    trackId: typeof playback.trackId === "string" ? playback.trackId : null,
    title: typeof playback.title === "string" ? playback.title : "",
    artist: typeof playback.artist === "string" ? playback.artist : "",
    albumImageUrl:
      typeof playback.albumImageUrl === "string" ? playback.albumImageUrl : null,
    progressMs:
      typeof playback.progressMs === "number" && Number.isFinite(playback.progressMs)
        ? playback.progressMs
        : 0,
    durationMs:
      typeof playback.durationMs === "number" && Number.isFinite(playback.durationMs)
        ? playback.durationMs
        : 0,
    isPlaying: Boolean(playback.isPlaying),
  };
}

/** The game's break playlist, or the default one; empty only before the game loads. */
function sessionBreakPlaylist(session: { breakPlaylistId?: string | null } | null | undefined): string {
  return session ? resolveBreakPlaylist(session.breakPlaylistId) : "";
}

export default function HostSessionControllerPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = useMemo(
    () => (typeof params?.sessionId === "string" ? params.sessionId : ""),
    [params?.sessionId]
  );

  useWakeLock();

  // This tab's console id for the server-held control lock (spec M-9).
  const [deviceId, setDeviceId] = useState<string | null>(null);
  useEffect(() => {
    if (sessionId) setDeviceId(ensureHostDeviceId(sessionId));
  }, [sessionId]);
  const control = useHostControl(sessionId, deviceId);
  const isController = control.state.status === "held";
  const { markLost, takeOver } = control;
  const isControllerRef = useRef(false);
  useEffect(() => {
    isControllerRef.current = isController;
  }, [isController]);
  // The runtime version this console last saw from the server; every save
  // presents it, and the server refuses an out-of-date one (spec M-9).
  const versionRef = useRef<number | null>(null);
  const runtimeRef = useRef<LiveRuntimeState>(makeEmptyRuntimeState(sessionId || "pending"));
  const pollAbortRef = useRef<AbortController | null>(null);
  // Circuit-breaker: stop polling after a 401 until the user reconnects Spotify.
  const spotifyDisconnectedRef = useRef<boolean>(false);
  const [session, setSession] = useState<LiveSessionV1 | null>(null);
  const [runtime, setRuntime] = useState<LiveRuntimeState>(
    makeEmptyRuntimeState(sessionId || "pending")
  );
  const [notice, setNotice] = useState<string>("");
  const [noticeVariant, setNoticeVariant] = useState<"success" | "warning">("success");
  const [syncState, setSyncState] = useState<SyncState>({ status: "saved" });
  const pollFailCountRef = useRef<number>(0);
  const [error, setError] = useState<string>("");
  // Set when Spotify accepted a play command but nothing started playing.
  // Its own banner, so the success notices callers set cannot overwrite it,
  // and it clears itself as soon as a status poll sees music playing.
  const [playbackWarning, setPlaybackWarning] = useState<string>("");
  const [spotifyDisconnected, setSpotifyDisconnected] = useState<boolean>(false);
  const [linksBusy, setLinksBusy] = useState<"copy" | "cancel" | null>(null);
  const [linksNotice, setLinksNotice] = useState<string>("");
  const [_commandBusy, setCommandBusy] = useState<boolean>(false);
  // Welcome Song control: in-flight flag and inline error for the "Set song" resolve step.
  const [welcomeSongBusy, setWelcomeSongBusy] = useState<boolean>(false);
  const [welcomeSongError, setWelcomeSongError] = useState<string | null>(null);
  const [_playedTrackIds, setPlayedTrackIds] = useState<Set<string>>(new Set());
  const lastPlayedTrackIdRef = useRef<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<{ trackId: string; title: string; artist: string }[]>([]);
  const playlistTracksRef = useRef<{ trackId: string; title: string; artist: string }[]>([]);
  const loadedPlaylistIdRef = useRef<string | null>(null);
  // Guards against concurrent in-flight fetches for the same playlist.
  const fetchingPlaylistIdRef = useRef<string | null>(null);
  const [_playlistLoadError, setPlaylistLoadError] = useState<boolean>(false);
  const [playlistRetryCount, _setPlaylistRetryCount] = useState<number>(0);
  const [songPlaySecondsInput, setSongPlaySecondsInput] = useState<string>("");
  const [albumRevealSecondsInput, setAlbumRevealSecondsInput] = useState<string>("");
  const [titleRevealSecondsInput, setTitleRevealSecondsInput] = useState<string>("");
  const [artistRevealSecondsInput, setArtistRevealSecondsInput] = useState<string>("");
  const [awardModalOpen, setAwardModalOpen] = useState<boolean>(false);
  const [_timingSaving, setTimingSaving] = useState<boolean>(false);
  // Resolved Spotify track IDs for all challenge songs of the active game.
  const challengeTrackIdsRef = useRef<Set<string>>(new Set());
  // Resolved Spotify track ID for the intro song (first track in playlist when introSongArtist is set).
  const introTrackIdRef = useRef<string | null>(null);
  // Start times ("@0:40" in the song list) by playlist track id, resolved when
  // the playlist loads; the text match covers relinked tracks.
  const songStartByTrackIdRef = useRef<Map<string, number>>(new Map());
  // The track the console last jumped to its start time, so it seeks once.
  const songStartSeekedTrackRef = useRef<string | null>(null);
  const songStartSeekedAtRef = useRef(0);
  // Anchor-based intro tracking set by playIntroSong; survives stale status
  // reports and market-relinked track ids (see lib/live/introState.ts).
  const introAnchorRef = useRef<IntroTracking | null>(null);
  // Auto-advance guards: one skip command in flight at a time, and a count of
  // consecutive failures so the retry loop can surface a warning.
  const advanceInFlightRef = useRef<boolean>(false);
  const advanceFailCountRef = useRef<number>(0);
  // Consecutive polls seen with the runtime on "paused" while Spotify reports
  // real playback on a game screen. Used to restore auto-advance (see pollStatus).
  const pausedButPlayingPollsRef = useRef<number>(0);
  // When the tab went hidden (browser throttling suspends the poll loop).
  const hiddenAtMsRef = useRef<number | null>(null);

  // ---- After Hours console additions ----
  const [brand, setBrand] = useState<BrandConfig | null>(null);
  const [editing, setEditing] = useState<boolean>(false);
  const [contentCollapsed, setContentCollapsed] = useState<boolean>(false);
  // TV preview scale (ResizeObserver on the frame container)
  const [previewScale, setPreviewScale] = useState<number>(0.27);
  const tvFrameRef = useRef<HTMLDivElement | null>(null);

  // Load brand from the session API.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { brand?: BrandConfig } | null) => {
        if (data?.brand && !cancelled) setBrand(data.brand);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // TV preview scale: fit the 1920px canvas into the frame container.
  useEffect(() => {
    const fit = (): void => {
      if (tvFrameRef.current) {
        setPreviewScale(tvFrameRef.current.clientWidth / 1920);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (tvFrameRef.current) ro.observe(tvFrameRef.current);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  useEffect(() => {
    playlistTracksRef.current = playlistTracks;
  }, [playlistTracks]);

  useEffect(() => {
    if (!session) return;
    setSongPlaySecondsInput(formatSecondsInput(session.revealConfig.nextMs));
    setAlbumRevealSecondsInput(formatSecondsInput(session.revealConfig.albumMs));
    setTitleRevealSecondsInput(formatSecondsInput(session.revealConfig.titleMs));
    setArtistRevealSecondsInput(formatSecondsInput(session.revealConfig.artistMs));
  }, [session]);

  // Track which song IDs have been played so far.
  // When the playlist is loaded, mark all tracks up to and including the current one
  // as played — this ensures resuming from a break shows the correct history.
  useEffect(() => {
    const track = runtime.currentTrack;
    if (!track?.trackId || track.trackId === lastPlayedTrackIdRef.current) return;
    lastPlayedTrackIdRef.current = track.trackId;
    const tracks = playlistTracksRef.current;
    const currentIndex = tracks.findIndex((t) => t.trackId === track.trackId);
    if (currentIndex >= 0) {
      // Mark every track up to the current one as played.
      const preceding = tracks.slice(0, currentIndex + 1).map((t) => t.trackId);
      setPlayedTrackIds((prev) => new Set([...prev, ...preceding]));
    } else {
      // Playlist not loaded yet or track not found — fall back to incremental add.
      setPlayedTrackIds((prev) => new Set([...prev, track.trackId!]));
    }
  }, [runtime.currentTrack]);

  // Fetch the full playlist track listing when the active game changes.
  // Once loaded, resolve challenge songs and intro song to their exact Spotify track IDs.
  // playlistRetryCount is incremented by the Retry button to force a re-fetch after failure.
  useEffect(() => {
    const game = runtime.activeGameNumber
      ? session?.games.find((g) => g.gameNumber === runtime.activeGameNumber) ?? null
      : null;
    const playlistId = game?.playlistId ?? null;
    // Skip if no playlist, already successfully loaded, or a fetch is already in flight.
    if (!playlistId || playlistId === loadedPlaylistIdRef.current || playlistId === fetchingPlaylistIdRef.current) return;
    fetchingPlaylistIdRef.current = playlistId;
    setPlaylistLoadError(false);
    setPlaylistTracks([]);
    challengeTrackIdsRef.current = new Set();
    songStartByTrackIdRef.current = new Map();
    introTrackIdRef.current = null;
    void fetch(`/api/spotify/playlist/${encodeURIComponent(playlistId)}/tracks`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          fetchingPlaylistIdRef.current = null;
          setPlaylistLoadError(true);
          return;
        }
        const data = (await res.json()) as { tracks?: { trackId: string; title: string; artist: string }[] };
        if (!data.tracks) {
          fetchingPlaylistIdRef.current = null;
          setPlaylistLoadError(true);
          return;
        }
        // Lock the success ref only after a successful response so failures stay retryable.
        loadedPlaylistIdRef.current = playlistId;
        fetchingPlaylistIdRef.current = null;
        setPlaylistTracks(data.tracks);
        // Resolve all challenge song track IDs against Spotify metadata using the same
        // matcher as runtime detection, including legacy swapped title/artist data.
        if (game) {
          const matched = new Set<string>();
          for (const playlistTrack of data.tracks) {
            if (playlistTrack.trackId && matchChallengeSong(playlistTrack, game)) {
              matched.add(playlistTrack.trackId);
            }
          }
          challengeTrackIdsRef.current = matched;
          const starts = new Map<string, number>();
          for (const playlistTrack of data.tracks) {
            const startMs = playlistTrack.trackId ? findSongStartMs(playlistTrack, game.songStarts) : 0;
            if (startMs > 0) starts.set(playlistTrack.trackId, startMs);
          }
          songStartByTrackIdRef.current = starts;
        }
        if (game) {
          const intros = getIntroSongs(game);
          if (intros.length > 0 && intros[0].trackId) {
            introTrackIdRef.current = intros[0].trackId;
          } else if (game.introSongArtist && data.tracks.length > 0) {
            introTrackIdRef.current = data.tracks[0].trackId ?? null;
          }
        }
      })
      .catch(() => {
        fetchingPlaylistIdRef.current = null;
        setPlaylistLoadError(true);
      });
  }, [runtime.activeGameNumber, session, playlistRetryCount]);

  // ---- Saving the runtime (spec M-9, S4.3, S4.4) ----
  // One save in flight at a time, newest runtime next. Each save presents the
  // version this console last saw; the server holds it to the control lock
  // and that version, and answers why when it refuses. A refusal is shown and
  // never retried; a save that could not reach the server is kept and retried
  // every 5 seconds.
  const pendingSaveRef = useRef<LiveRuntimeState | null>(null);
  const saveInFlightRef = useRef<boolean>(false);
  // A runtime adopted from the server (after a conflict or a takeover) is not saved back.
  const adoptedRuntimeRef = useRef<LiveRuntimeState | null>(null);

  const adoptServerRuntime = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/runtime`, { cache: "no-store" });
      assertSignedIn(res);
      if (!res.ok) return;
      const data = (await res.json()) as { runtime: LiveRuntimeState | null; version: number };
      versionRef.current = data.version;
      if (data.runtime) {
        const adopted = withDefaultWelcomeSong(data.runtime);
        adoptedRuntimeRef.current = adopted;
        runtimeRef.current = adopted;
        setRuntime(adopted);
      }
    } catch {
      // The next save or heartbeat says what is wrong.
    }
  }, [sessionId]);

  const flushSaves = useCallback(async (): Promise<void> => {
    if (!sessionId || !deviceId || saveInFlightRef.current) return;
    const next = pendingSaveRef.current;
    if (!next || versionRef.current === null || !isControllerRef.current) return;
    pendingSaveRef.current = null;
    saveInFlightRef.current = true;
    setSyncState((current) => (current.status === "retrying" ? current : { status: "saving" }));
    const outcome = await pushRuntimeState(sessionId, next, { deviceId, expectedVersion: versionRef.current });
    saveInFlightRef.current = false;

    if (outcome.kind === "saved") {
      versionRef.current = outcome.version;
      clearQueuedRuntime(sessionId);
      if (!pendingSaveRef.current) setSyncState({ status: "saved" });
    } else if (shouldRetry(outcome)) {
      // Keep the newest runtime for the retry, here and across a reload.
      pendingSaveRef.current = pendingSaveRef.current ?? next;
      queueRuntime(sessionId, pendingSaveRef.current);
      setSyncState(syncStateFor(outcome));
      return;
    } else {
      pendingSaveRef.current = null;
      clearQueuedRuntime(sessionId);
      setSyncState(syncStateFor(outcome));
      if (outcome.kind === "signed_out") {
        assertSignedIn(new Response(null, { status: outcome.status }));
      } else if (outcome.kind === "not_controller") {
        markLost(outcome.secondsSinceSeen);
      } else if (outcome.kind === "conflict") {
        await adoptServerRuntime();
      }
      return;
    }
    if (pendingSaveRef.current) void flushSaves();
  }, [sessionId, deviceId, markLost, adoptServerRuntime]);

  // Queue each new runtime once (the same object is never saved twice).
  const queuedRuntimeRef = useRef<LiveRuntimeState | null>(null);
  useEffect(() => {
    if (!sessionId || !isController) return;
    if (adoptedRuntimeRef.current === runtime || queuedRuntimeRef.current === runtime) return;
    queuedRuntimeRef.current = runtime;
    pendingSaveRef.current = runtime;
    void flushSaves();
  }, [runtime, sessionId, isController, flushSaves]);

  // Retry a save that could not reach the server, every 5 seconds and when
  // the browser comes back online. A runtime queued before a reload goes first.
  useEffect(() => {
    if (!sessionId || !isController) return;
    const queued = readQueuedRuntime(sessionId);
    if (queued && !pendingSaveRef.current) pendingSaveRef.current = queued;
    const retry = (): void => void flushSaves();
    retry();
    window.addEventListener("online", retry);
    const id = window.setInterval(retry, 5_000);
    return () => {
      window.removeEventListener("online", retry);
      window.clearInterval(id);
    };
  }, [sessionId, isController, flushSaves]);

  // Taking control (on open or by takeover): start from the server's runtime
  // when another console saved since this one last looked. Only on the
  // change into control, so a heartbeat that crosses this console's own save
  // never drops a newer local change.
  const serverVersion = control.state.serverVersion;
  const wasControllerRef = useRef(false);
  useEffect(() => {
    const becameController = isController && !wasControllerRef.current;
    wasControllerRef.current = isController;
    if (!becameController || serverVersion === null) return;
    if (versionRef.current === null || serverVersion > versionRef.current) void adoptServerRuntime();
  }, [isController, serverVersion, adoptServerRuntime]);

  // A console without control follows the one that has it, every 3 seconds,
  // so it shows the game as it stands and a takeover starts from there.
  useEffect(() => {
    if (!sessionId || isController || control.state.status === "checking") return;
    const id = window.setInterval(() => void adoptServerRuntime(), 3_000);
    return () => window.clearInterval(id);
  }, [sessionId, isController, control.state.status, adoptServerRuntime]);

  const persistAndBroadcastRuntime = useCallback(
    (next: LiveRuntimeState) => {
      if (!sessionId) return;
      writeRuntimeState(sessionId, next);
      // Only the console in control speaks for the game on this device's TV window.
      if (isControllerRef.current) publishLiveMessage(sessionId, { type: "runtime_update", runtime: next });
    },
    [sessionId]
  );

  const commitRuntime = useCallback(
    (updater: LiveRuntimeState | ((prev: LiveRuntimeState) => LiveRuntimeState)) => {
      // Only the console in control changes the game (spec M-9); the others are read only.
      if (!sessionId || !isControllerRef.current) return;
      setRuntime((prev) => {
        const computed = typeof updater === "function" ? updater(prev) : updater;
        const next: LiveRuntimeState = {
          ...computed,
          version: LIVE_RUNTIME_VERSION,
          sessionId,
          updatedAtMs: Date.now(),
        };
        persistAndBroadcastRuntime(next);
        return next;
      });
    },
    [persistAndBroadcastRuntime, sessionId]
  );

  function addTeamScore(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    commitRuntime((prev) => {
      const duplicate = prev.teamScores.some(
        (team) => team.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (duplicate) return prev;
      return {
        ...prev,
        teamScores: [
          ...prev.teamScores,
          { id: makeScoreId("team"), name: trimmed.slice(0, 80), score: 0 },
        ],
      };
    });
  }

  // "Open Display" on the laptop opens /tv (spec M-9). Signed in, the laptop
  // shows this game there without being paired; the console's
  // BroadcastChannel keeps that window instant.
  function openPrivateDisplay(): void {
    if (!sessionId) return;
    window.open(`/tv?session=${encodeURIComponent(sessionId)}`, "music_bingo_display");
  }

  // The fallback for a screen that cannot be paired: a TV link for this game,
  // copied to the clipboard. It works for 24 hours, or until links are cancelled.
  async function copyTvLink(): Promise<void> {
    if (!sessionId) return;
    setLinksBusy("copy");
    setLinksNotice("");
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/links`, { cache: "no-store" });
      assertSignedIn(res);
      const data = (await res.json().catch(() => null)) as { displayUrl?: string; error?: string } | null;
      if (!res.ok || !data?.displayUrl) throw new Error(data?.error ?? "Could not make a TV link.");
      await navigator.clipboard.writeText(data.displayUrl);
      setLinksNotice("TV link copied. It works for 24 hours, or until you cancel links.");
    } catch (err) {
      if (err instanceof SignInRequiredError) return;
      setError(err instanceof Error ? err.message : "Could not make a TV link.");
    } finally {
      setLinksBusy(null);
    }
  }

  // Cancels every host and TV link made so far for this game. Paired TVs carry on.
  async function cancelLinks(): Promise<void> {
    if (!sessionId) return;
    setLinksBusy("cancel");
    setLinksNotice("");
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/links`, { method: "DELETE" });
      assertSignedIn(res);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not cancel the links. Try again.");
      }
      setLinksNotice("Every host and TV link made before now has stopped working. Paired TVs are not affected.");
    } catch (err) {
      if (err instanceof SignInRequiredError) return;
      setError(err instanceof Error ? err.message : "Could not cancel the links. Try again.");
    } finally {
      setLinksBusy(null);
    }
  }

  function removeTeamScore(teamId: string): void {
    commitRuntime((prev) => ({
      ...prev,
      teamScores: prev.teamScores.filter((team) => team.id !== teamId),
      scoreToast: prev.scoreToast?.teamId === teamId ? null : prev.scoreToast,
    }));
  }

  function awardTeamPoints(team: LiveTeamScore, points: number, label: string): void {
    const safePoints = Math.min(MAX_TEAM_SCORE, Math.max(0, Math.round(points)));
    if (!safePoints) return;
    commitRuntime((prev) => {
      const current = prev.teamScores.find((item) => item.id === team.id);
      if (!current) return prev;
      const nextTotal = Math.min(MAX_TEAM_SCORE, current.score + safePoints);
      return {
        ...prev,
        teamScores: prev.teamScores.map((item) =>
          item.id === team.id ? { ...item, score: nextTotal } : item
        ),
        scoreToast: {
          id: makeScoreId("score"),
          teamId: team.id,
          teamName: current.name,
          points: safePoints,
          label,
          total: nextTotal,
          createdAtMs: Date.now(),
        },
      };
    });
  }

  const applyStatusSnapshot = useCallback(
    (
      payload: LiveStatusResponse,
      opts?: { mode?: LiveRuntimeState["mode"] }
    ) => {
      if (!session) return;
      const warnings = normalizeWarnings(payload.warnings);
      const track = normalizeTrackSnapshot(payload.playback);
      commitRuntime((prev) => {
        const game = prev.activeGameNumber
          ? session.games.find((g) => g.gameNumber === prev.activeGameNumber) ?? null
          : null;
        const trackChanged = track?.trackId != null && track.trackId !== prev.currentTrack?.trackId;

        // --- Intro song detection ---
        // Primary: anchor tracking set by playIntroSong. It holds the intro
        // flag through Spotify's stale post-command status and relinked track
        // ids, and only finishes when playback moves away from the observed
        // intro track, so the intro always plays in full.
        // Fallback (e.g. page refreshed mid-intro, no anchor): direct id
        // comparison. The intro only counts as finished when the changed-to
        // track is NOT the intro itself, so the first report of the intro
        // track cannot end it.
        let isIntroSong: boolean;
        let introFinished = false;
        if (prev.isIntroSong && !prev.introPlayed && introAnchorRef.current) {
          const introResult = trackIntroPlayback(introAnchorRef.current, track?.trackId ?? null);
          introAnchorRef.current = introResult.tracking;
          isIntroSong = introResult.isIntroSong;
          introFinished = introResult.introFinished;
        } else {
          isIntroSong = !prev.introPlayed
            && introTrackIdRef.current != null
            && track?.trackId === introTrackIdRef.current;
          introFinished = prev.isIntroSong && trackChanged && !isIntroSong;
        }
        const introPlayed = prev.introPlayed || introFinished;
        // Clear the anchor only when an intro actually ends. Snapshots that run
        // BEFORE playIntroSong's own runtime commit (the command response is
        // queued first, with prev.isIntroSong still false) must not wipe the
        // freshly set anchor.
        if (introFinished || (prev.isIntroSong && !isIntroSong)) {
          introAnchorRef.current = null;
        }

        // --- Challenge song detection (uses resolved Set; falls back to text matching) ---
        // Intro takes precedence: when intro is playing, challenge is false.
        // Always try both detection methods: ID-based first, then text-based fallback.
        // This handles the case where the playlist loaded but a particular challenge
        // song wasn't matched by the fuzzy ID resolution.
        const detectChallengeType = (t: typeof track): 'sing-along' | 'dance-along' | null => {
          if (!t) return null;
          const idHit = challengeTrackIdsRef.current.has(t.trackId ?? "");
          const textHit = matchChallengeSong(t, game);
          if (idHit) return textHit ?? 'sing-along';
          return textHit;
        };
        const detectedType = isIntroSong
          ? null
          : trackChanged
            ? detectChallengeType(track)
            : (prev.challengeType ?? detectChallengeType(track));
        const isChallengeSong = detectedType !== null;
        const challengeType = detectedType;
        const challengeBonusPoints = isChallengeSong
          ? getChallengeBonusPoints(game)
          : DEFAULT_CHALLENGE_BONUS_POINTS;
        if (trackChanged && track) {
          const songs = game ? getChallengeSongs(game) : [];
          console.log("[music-bingo] challenge detection", {
            trackTitle: track.title,
            trackArtist: track.artist,
            trackId: track.trackId,
            gameNumber: prev.activeGameNumber,
            gameFound: !!game,
            challengeSongsCount: songs.length,
            challengeSongs: songs.map((s) => `${s.artist} — ${s.title}`),
            idSetSize: challengeTrackIdsRef.current.size,
            idHit: challengeTrackIdsRef.current.has(track.trackId ?? ""),
            textHit: matchChallengeSong(track, game),
            isIntroSong,
            detectedType,
            isChallengeSong,
          });
        }
        const baseCfg = isChallengeSong ? CHALLENGE_REVEAL_CONFIG : (prev.revealConfig ?? session.revealConfig);
        const extensionMs = trackChanged ? 0 : prev.extensionMs;
        const cfg = getRevealConfigWithExtension(baseCfg, extensionMs);
        // A song with a start time is counted from that point (the console
        // seeks there below). Not for the warm-up, free play or manual control.
        const configuredStartMs = track?.trackId
          ? songStartByTrackIdRef.current.get(track.trackId) ?? findSongStartMs(track, game?.songStarts)
          : 0;
        const songStartMs = nextSongStartMs({
          trackChanged,
          previousStartMs: prev.songStartMs,
          configuredStartMs,
          durationMs: track?.durationMs,
          isIntroSong,
          freePlay: prev.freePlay,
          canControlPlayback: Boolean(payload.canControlPlayback),
        });

        // When intro or free play is active, show all metadata immediately (no timed reveal).
        const computedRevealState = (isIntroSong || prev.freePlay)
          ? { showAlbum: true, showTitle: true, showArtist: true, shouldAdvance: false }
          : computeRevealState(songProgressMs(track?.progressMs ?? 0, songStartMs), cfg);
        const revealState = trackChanged
          ? computedRevealState
          : {
            showAlbum: prev.revealState.showAlbum || computedRevealState.showAlbum,
            showTitle: prev.revealState.showTitle || computedRevealState.showTitle,
            showArtist: prev.revealState.showArtist || computedRevealState.showArtist,
            shouldAdvance: computedRevealState.shouldAdvance,
          };
        const marker = updateAdvanceTrackMarker({
          trackId: track?.trackId ?? null,
          advanceTriggeredForTrackId: prev.advanceTriggeredForTrackId,
        });

        // Accumulate the now-playing song into the game's played list (oldest
        // first) so the Bingo Claim screen can list it. Only on a genuine track
        // change, only for tracks with a real id, and deduped so repeats/polls
        // never add the same song twice. Stored as a minimal {trackId,title,
        // artist} record to keep every runtime broadcast/write small. Reset
        // happens in startGame().
        const prevPlayed = prev.playedTracks ?? [];
        const isRecordingGameScreen =
          prev.mode === "running" &&
          (prev.screenId === "game1" || prev.screenId === "game2" || prev.screenId == null);
        const shouldRecordPlayedTrack =
          isRecordingGameScreen && !isIntroSong && !prev.isIntroSong && !prev.freePlay;
        const playedTracks =
          shouldRecordPlayedTrack && trackChanged && track?.trackId && !prevPlayed.some((t) => t.trackId === track.trackId)
            ? [...prevPlayed, { trackId: track.trackId, title: track.title, artist: track.artist }]
            : prevPlayed;

        return {
          ...prev,
          mode: opts?.mode ?? prev.mode,
          spotifyControlAvailable: Boolean(payload.canControlPlayback),
          currentTrack: track,
          playedTracks,
          revealState,
          revealConfig: prev.revealConfig ?? session.revealConfig,
          isChallengeSong,
          challengeType,
          challengeBonusPoints,
          isIntroSong,
          introPlayed,
          extensionMs,
          songStartMs,
          advanceTriggeredForTrackId: marker,
          warningMessage: warnings[0] ?? (payload.error?.message ?? null),
        };
      });
    },
    [commitRuntime, session]
  );

  useEffect(() => {
    if (!sessionId) {
      setError("Invalid session id.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const loaded = await getLiveSession(sessionId);
        if (cancelled) return;
        if (!loaded) {
          setError(
            "Live session not found. Open /host and create/import a session first."
          );
          return;
        }
        setSession(loaded);
        setError("");
        let serverRuntime: LiveRuntimeState | null = null;
        try {
          const runtimeRes = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/runtime`, {
            cache: "no-store",
          });
          if (runtimeRes.ok) {
            const stored = (await runtimeRes.json()) as { runtime: LiveRuntimeState | null; version: number };
            serverRuntime = stored.runtime;
            versionRef.current = stored.version;
          }
        } catch {}
        const persistedRuntime = readRuntimeState(sessionId);
        const initial = withDefaultWelcomeSong({
          ...(serverRuntime ?? persistedRuntime ?? makeEmptyRuntimeState(sessionId)),
          revealConfig: loaded.revealConfig,
        });
        setRuntime(initial);
        runtimeRef.current = initial;
        // The server's own runtime is not saved straight back.
        if (serverRuntime) adoptedRuntimeRef.current = initial;
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Failed to load session.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const pollStatus = useCallback(async () => {
    if (!session) return;
    // Circuit-breaker: don't keep hammering the token endpoint after a 401.
    if (spotifyDisconnectedRef.current) return;
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;
    try {
      const res = await fetch("/api/spotify/live/status", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (res.status === 401) {
        const bodyText = await res.text().catch(() => "");
        const msg = bodyText.trim() || "Spotify auth expired. Use the Reconnect button below.";
        spotifyDisconnectedRef.current = true;
        setSpotifyDisconnected(true);
        pollFailCountRef.current = 0;
        commitRuntime((prev) => ({
          ...prev,
          spotifyControlAvailable: false,
          warningMessage: msg,
        }));
        return;
      }
      if (!res.ok) {
        pollFailCountRef.current += 1;
        if (pollFailCountRef.current >= 3) {
          const msg = await res
            .text()
            .catch(() => "Failed to fetch live Spotify status.");
          setError(msg || "Failed to fetch live Spotify status.");
        }
        return;
      }
      pollFailCountRef.current = 0;
      const data = (await res.json()) as LiveStatusResponse;
      applyStatusSnapshot(data);
      if (data.playback?.isPlaying) setPlaybackWarning("");

      // --- Recover a stale "paused" mode from real playback ---
      // See shouldRecoverRunningMode: the engine below only runs in "running"
      // mode, and a runtime left on "paused" while Spotify actually plays used
      // to stop songs advancing for the rest of the game.
      const isPlayingNow = Boolean(data.playback?.isPlaying);
      pausedButPlayingPollsRef.current =
        runtimeRef.current.mode === "paused" && isPlayingNow
          ? pausedButPlayingPollsRef.current + 1
          : 0;
      if (
        shouldRecoverRunningMode({
          mode: runtimeRef.current.mode,
          screenId: normalizeScreenId(
            runtimeRef.current.screenId,
            deriveScreenId(runtimeRef.current)
          ),
          isPlaying: isPlayingNow,
          consecutivePlayingPolls: pausedButPlayingPollsRef.current,
        })
      ) {
        pausedButPlayingPollsRef.current = 0;
        commitRuntime((prev) => (prev.mode === "paused" ? { ...prev, mode: "running" } : prev));
        setNoticeVariant("warning");
        setNotice("Playback resumed outside the host controls, so auto-advance is back on.");
      }

      if (runtimeRef.current.mode !== "running") return;
      const track = normalizeTrackSnapshot(data.playback);
      const baseCfg = getRevealConfig(
        session,
        runtimeRef.current.activeGameNumber,
        track,
        runtimeRef.current.revealConfig ?? session.revealConfig
      );
      const extensionMs = runtimeRef.current.extensionMs;
      const cfg = getRevealConfigWithExtension(baseCfg, extensionMs);
      // Until the snapshot above has landed for this track, its start time is
      // not known here: wait for the next poll rather than advance early.
      if ((runtimeRef.current.currentTrack?.trackId ?? null) !== (track?.trackId ?? null)) return;
      const revealState = computeRevealState(
        songProgressMs(track?.progressMs ?? 0, runtimeRef.current.songStartMs),
        cfg
      );

      if (
        isController &&
        Boolean(data.canControlPlayback) &&
        !runtimeRef.current.freePlay &&
        !runtimeRef.current.isIntroSong &&
        !advanceInFlightRef.current &&
        shouldTriggerNextForTrack({
          trackId: track?.trackId ?? null,
          revealState,
          advanceTriggeredForTrackId: runtimeRef.current.advanceTriggeredForTrackId,
        })
      ) {
        const trackId = track?.trackId ?? null;
        // If this is the last track in the playlist, end the session instead of advancing.
        const tracks = playlistTracksRef.current;
        const isLastTrack =
          tracks.length > 0 &&
          trackId != null &&
          tracks[tracks.length - 1].trackId === trackId;
        if (isLastTrack) {
          commitRuntime((prev) => ({
            ...prev,
            mode: "ended",
            screenId: "winner-entry" as ScreenId,
            isIntroSong: false,
            isChallengeSong: false,
            challengeType: null,
            challengeBonusPoints: DEFAULT_CHALLENGE_BONUS_POINTS,
            advanceTriggeredForTrackId: null,
            extensionMs: 0,
            freePlay: false,
          }));
          await fetch("/api/spotify/live/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "pause" }),
          }).catch(() => {});
          return;
        }
        // Send the skip first and only mark the track as advanced on success.
        // A failed skip leaves the marker clear, so the next 2-second poll
        // retries automatically instead of stalling on this song. The in-flight
        // ref stops overlapping skip commands from concurrent polls.
        advanceInFlightRef.current = true;
        try {
          const nextRes = await fetch("/api/spotify/live/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "next" }),
          });
          if (nextRes.ok) {
            advanceFailCountRef.current = 0;
            if (trackId) {
              commitRuntime((prev) => ({
                ...prev,
                advanceTriggeredForTrackId: trackId,
              }));
            }
          } else {
            advanceFailCountRef.current += 1;
            if (advanceFailCountRef.current >= 3) {
              // The route answers with JSON for Spotify refusals and plain
              // text otherwise; show the message, never the raw body.
              const nextBody = await nextRes.text().catch(() => "");
              let nextError = nextBody.trim();
              try {
                const parsed = JSON.parse(nextBody) as LiveCommandResponse;
                if (typeof parsed?.error?.message === "string") nextError = parsed.error.message;
              } catch {}
              setError(
                `${nextError || "Failed to advance to next song."} Retrying automatically.`
              );
            }
          }
        } catch {
          advanceFailCountRef.current += 1;
        } finally {
          advanceInFlightRef.current = false;
        }
      }

      if (!data.canControlPlayback && !runtimeRef.current.warningMessage) {
        setNoticeVariant("warning");
        setNotice(
          "Manual host control mode active: control playback in Spotify app while this screen drives reveals."
        );
      }
      pollFailCountRef.current = 0;
    } catch (err: any) {
      if ((err as Error)?.name === "AbortError") return;
      pollFailCountRef.current += 1;
      // Only surface network errors after 3 consecutive failures to avoid transient noise
      if (pollFailCountRef.current >= 3) {
        setError(err?.message ?? "Failed to poll live status.");
      }
    }
  }, [applyStatusSnapshot, commitRuntime, isController, session]);

  useEffect(() => {
    if (!session) return;
    void pollStatus();
    const id = window.setInterval(() => void pollStatus(), 2_000);
    return () => {
      window.clearInterval(id);
      pollAbortRef.current?.abort();
    };
  }, [pollStatus, session]);

  // Browsers throttle timers in hidden tabs, which suspends the 2-second poll
  // that drives reveals and auto-skips. Poll immediately when the tab becomes
  // visible again so the game catches up at once, and warn the host if the
  // engine was suspended mid-game.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtMsRef.current = Date.now();
        return;
      }
      const hiddenForMs = hiddenAtMsRef.current ? Date.now() - hiddenAtMsRef.current : 0;
      hiddenAtMsRef.current = null;
      void pollStatus();
      if (hiddenForMs > 10_000 && runtimeRef.current.mode === "running") {
        setNoticeVariant("warning");
        setNotice(
          "Reveals and auto-skips pause while this tab is in the background. Keep the host screen visible during games."
        );
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [pollStatus]);

  const sendCommand = useCallback(
    async (
      action: "play_game" | "play_track" | "pause" | "resume" | "next" | "previous" | "seek" | "play_break" | "resume_from_track",
      payload?: Record<string, unknown>,
      opts?: { modeOnSuccess?: LiveRuntimeState["mode"] }
    ): Promise<boolean> => {
      setCommandBusy(true);
      setError("");
      setPlaybackWarning("");
      try {
        const res = await fetch("/api/spotify/live/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...(payload ?? {}) }),
        });
        if (res.status === 401) {
          const bodyText = await res.text().catch(() => "");
          const msg = bodyText.trim() || "Spotify auth expired. Use the Reconnect button below.";
          spotifyDisconnectedRef.current = true;
          setSpotifyDisconnected(true);
          commitRuntime((prev) => ({
            ...prev,
            spotifyControlAvailable: false,
            warningMessage: msg,
          }));
          return false;
        }
        const data = (await res.json().catch(() => null)) as LiveCommandResponse | null;
        if (!res.ok || !data) {
          const msg =
            typeof data?.error?.message === "string"
              ? data.error.message
              : "Live command failed.";
          setError(msg);
          if (data) applyStatusSnapshot(data);
          return false;
        }
        applyStatusSnapshot(data, { mode: opts?.modeOnSuccess });
        if (typeof data.hostWarning === "string" && data.hostWarning) {
          setPlaybackWarning(data.hostWarning);
        }
        return data.ok !== false;
      } catch (err: any) {
        setError(err?.message ?? "Live command failed.");
        return false;
      } finally {
        setCommandBusy(false);
      }
    },
    [applyStatusSnapshot, commitRuntime]
  );

  // A song with a start time ("@0:40" in the song list): once Spotify reports
  // it, jump there, once per track. If the jump is refused, count the song
  // from the top again so the reveals still run on time.
  useEffect(() => {
    const track = runtime.currentTrack;
    const songStartMs = runtime.songStartMs ?? 0;
    // Another song since the last jump (the break playlist, say), in any
    // mode: this one may jump again when it comes back.
    if (track?.trackId && songStartSeekedTrackRef.current !== null && songStartSeekedTrackRef.current !== track.trackId) {
      songStartSeekedTrackRef.current = null;
    }
    if (!isController || !track?.trackId || runtime.mode !== "running") return;
    if (songStartSeekedTrackRef.current === track.trackId) {
      // Spotify took the jump but stayed near the top: count from the top.
      if (songStartSeekIgnored({
        songStartMs,
        progressMs: track.progressMs,
        msSinceSeek: Date.now() - songStartSeekedAtRef.current,
      })) {
        const ignoredTrackId = track.trackId;
        commitRuntime((prev) =>
          prev.currentTrack?.trackId === ignoredTrackId ? { ...prev, songStartMs: 0 } : prev
        );
      }
      return;
    }
    const seekTo = songStartSeekMs({ songStartMs, progressMs: track.progressMs });
    if (seekTo === null) {
      if (songStartMs > 0) songStartSeekedTrackRef.current = track.trackId;
      return;
    }
    songStartSeekedTrackRef.current = track.trackId;
    songStartSeekedAtRef.current = Date.now();
    const trackId = track.trackId;
    void sendCommand("seek", { positionMs: seekTo }).then((ok) => {
      if (ok) return;
      commitRuntime((prev) =>
        prev.currentTrack?.trackId === trackId ? { ...prev, songStartMs: 0 } : prev
      );
    });
  }, [commitRuntime, isController, runtime.currentTrack, runtime.mode, runtime.songStartMs, sendCommand]);

  // Pre-show music: the host's Pre-Show Music button on the Welcome screen
  // plays the break playlist on shuffle as background music while guests
  // arrive. It never starts by itself (owner's call, 16 October 2026); Play
  // Welcome Intro replaces it with the welcome song.
  const startPreShowMusic = useCallback(async (): Promise<void> => {
    const playlistId = sessionBreakPlaylist(session);
    if (!playlistId || spotifyDisconnectedRef.current) return;
    const ok = await sendCommand("play_break", { playlistId }, { modeOnSuccess: "idle" });
    if (ok) {
      setNoticeVariant("success");
      setNotice("Pre-show music: the break playlist is playing on shuffle until you press Play Welcome Intro.");
    }
  }, [sendCommand, session]);

  async function startGame(gameNumber: 1 | 2) {
    if (!session || !isController) return;
    const game = session.games.find((item) => item.gameNumber === gameNumber);
    if (!game) {
      setError(`Game ${gameNumber} playlist not found in this session.`);
      return;
    }
    setNotice("");
    introAnchorRef.current = null;
    const ok = await sendCommand(
      "play_game",
      { playlistId: game.playlistId },
      { modeOnSuccess: "running" }
    );
    if (ok) {
      commitRuntime((prev) => {
        const startedTrack =
          prev.currentTrack && prev.activeGameNumber === gameNumber && !prev.isIntroSong
            ? prev.currentTrack
            : null;
        return {
          ...prev,
          mode: "running",
          activeGameNumber: gameNumber,
          screenId: (gameNumber === 1 ? "game1" : "game2") as ScreenId,
          currentTrack: startedTrack,
          advanceTriggeredForTrackId: null,
          // Fresh game → start a new played-songs list for the Bingo Claim screen.
          playedTracks: startedTrack?.trackId
            ? [{ trackId: startedTrack.trackId, title: startedTrack.title, artist: startedTrack.artist }]
            : [],
          isChallengeSong: false,
          challengeType: null,
          challengeBonusPoints: DEFAULT_CHALLENGE_BONUS_POINTS,
          isIntroSong: false,
          introPlayed: false,
          freePlay: false,
          extensionMs: 0,
        };
      });
      setNoticeVariant("success");
      setNotice(`Started Game ${gameNumber}: ${game.theme}`);
    } else {
      commitRuntime((prev) => ({
        ...prev,
        mode: "running",
        activeGameNumber: gameNumber,
        spotifyControlAvailable: false,
        currentTrack: null,
        // Fresh game → start a new played-songs list for the Bingo Claim screen.
        playedTracks: [],
        isChallengeSong: false,
        challengeType: null,
        challengeBonusPoints: DEFAULT_CHALLENGE_BONUS_POINTS,
        freePlay: false,
        extensionMs: 0,
        warningMessage: prev.warningMessage || "Manual host control mode active.",
      }));
      setNoticeVariant("warning");
      setNotice(
        "Spotify control unavailable. Continue in manual host control mode."
      );
    }
  }

  async function playIntroSong(gameNumber: 1 | 2) {
    if (!session || !isController) return;
    const game = session.games.find((item) => item.gameNumber === gameNumber);
    if (!game) return;
    const intros = getIntroSongs(game);
    if (intros.length === 0 || !intros[0].trackId) {
      setError(`No intro song configured for Game ${gameNumber}.`);
      return;
    }
    setNotice("");
    const ok = await sendCommand("play_track", { trackId: intros[0].trackId });
    if (ok) {
      // Track the intro from command time: status may still report the
      // pre-intro track for a tick or two, or report a relinked track id.
      introAnchorRef.current = makeIntroTracking({
        expectedTrackId: intros[0].trackId,
        currentTrackId: runtimeRef.current.currentTrack?.trackId ?? null,
      });
      commitRuntime((prev) => {
        const introTrack = prev.currentTrack?.trackId === intros[0].trackId ? prev.currentTrack : null;
        return {
          ...prev,
          mode: "running",
          activeGameNumber: gameNumber,
          screenId: (gameNumber === 1 ? "dance" : "sing") as ScreenId,
          currentTrack: introTrack,
          playedTracks:
            prev.screenId === "game1" || prev.screenId === "game2" || prev.screenId === "claim"
              ? (prev.playedTracks ?? [])
              : [],
          isIntroSong: true,
          introPlayed: false,
          isChallengeSong: false,
          challengeType: null,
          challengeBonusPoints: DEFAULT_CHALLENGE_BONUS_POINTS,
          advanceTriggeredForTrackId: null,
          extensionMs: 0,
          freePlay: false,
        };
      });
      const label = intros[0].type === "dance-along" ? "Dance Along" : "Sing Along";
      setNoticeVariant("success");
      setNotice(`Playing ${label}: ${intros[0].artist} — ${intros[0].title}`);
    }
  }

  function openBreakScreen() {
    // The song a break interrupts restarts from the top on resume, so it must
    // jump to its start time again, even if no other track played meanwhile.
    songStartSeekedTrackRef.current = null;
    // Only remember a resume point when the break interrupts an actual game
    // song (running, or paused mid-game). Breaks taken between games (or during
    // an intro, which is not part of the game playlist) have nothing to resume.
    const interruptedGame =
      (runtimeRef.current.mode === "running" || runtimeRef.current.mode === "paused") &&
      !runtimeRef.current.isIntroSong &&
      runtimeRef.current.activeGameNumber != null;
    const trackId = interruptedGame ? runtimeRef.current.currentTrack?.trackId ?? null : null;
    const gamePlaylistId = interruptedGame
      ? session?.games.find((g) => g.gameNumber === runtimeRef.current.activeGameNumber)?.playlistId ?? null
      : null;
    const spotifyAvailable = runtimeRef.current.spotifyControlAvailable;

    commitRuntime((prev) => ({
      ...prev,
      mode: "break",
      screenId: "break" as ScreenId,
      preBreakTrackId: trackId,
      preBreakPlaylistId: gamePlaylistId,
      breakStartedAtMs: Date.now(),
    }));

    if (spotifyAvailable) {
      if (sessionBreakPlaylist(session)) {
        void sendCommand("play_break", { playlistId: sessionBreakPlaylist(session) });
      } else {
        // No break playlist configured — pause Spotify so the game doesn't
        // keep advancing silently while the display shows the break screen.
        void sendCommand("pause");
      }
    }
  }

  function playBreakPlaylistAsBackground(modeOnSuccess: LiveRuntimeState["mode"]): void {
    if (!runtimeRef.current.spotifyControlAvailable) return;
    if (sessionBreakPlaylist(session)) {
      void sendCommand("play_break", { playlistId: sessionBreakPlaylist(session) }, { modeOnSuccess });
    } else {
      void sendCommand("pause", undefined, { modeOnSuccess });
    }
  }

  function showClosingScreen(screenId: Extract<ScreenId, "winner-entry" | "winners" | "thanks">): void {
    const alreadyPlayingClosingMusic =
      runtimeRef.current.mode === "ended" &&
      (
        runtimeRef.current.screenId === "winner-entry" ||
        runtimeRef.current.screenId === "winners" ||
        runtimeRef.current.screenId === "thanks"
      );

    commitRuntime((prev) => ({
      ...prev,
      mode: "ended",
      screenId,
      isIntroSong: false,
      isChallengeSong: false,
      challengeType: null,
      challengeBonusPoints: DEFAULT_CHALLENGE_BONUS_POINTS,
      winnersRevealCount: screenId === "winner-entry" || screenId === "winners" ? 0 : prev.winnersRevealCount,
      advanceTriggeredForTrackId: null,
      extensionMs: 0,
      freePlay: false,
    }));

    if (!alreadyPlayingClosingMusic) {
      playBreakPlaylistAsBackground("ended");
    }
  }

  function leaveBreakToScreen(screenId: ScreenId) {
    commitRuntime((prev) => ({
      ...prev,
      mode: "idle",
      screenId,
      preBreakTrackId: null,
      preBreakPlaylistId: null,
      breakStartedAtMs: null,
      isIntroSong: false,
      isChallengeSong: false,
      challengeType: null,
      challengeBonusPoints: DEFAULT_CHALLENGE_BONUS_POINTS,
      advanceTriggeredForTrackId: null,
      extensionMs: 0,
    }));

    // Half-time standings is still part of the interval beat, so the break
    // playlist plays on underneath the reveal. Everything else ends the break,
    // and gotoScreen stops the music when the show leaves standings.
    if (screenId !== "standings" && runtimeRef.current.spotifyControlAvailable) {
      void sendCommand("pause", undefined, { modeOnSuccess: "idle" });
    }
  }

  function resumeFromBreak() {
    const currentId = normalizeScreenId(runtimeRef.current.screenId, deriveScreenId(runtimeRef.current));
    // Off the show (an overlay or system screen), carry on from the interval.
    const fromId = SHOW_STEPS.some((s) => s.id === currentId) ? currentId : "break";
    leaveBreakToScreen(adjacentShowStep(SHOW_SCREENS, fromId, 1));
  }

  /** The game a mid-game break interrupted, or null when there is nothing to resume. */
  function breakResumeGameNumber(): 1 | 2 | null {
    // Reads render state (not runtimeRef) so the button appears/disappears in
    // the same render as the break state change.
    const playlistId = runtime.preBreakPlaylistId;
    const trackId = runtime.preBreakTrackId;
    if (!playlistId || !trackId) return null;
    return session?.games.find((g) => g.playlistId === playlistId)?.gameNumber ?? null;
  }

  /** Resume the interrupted game from the song it was on (restarts that song). */
  async function resumeGameFromBreak() {
    const playlistId = runtimeRef.current.preBreakPlaylistId;
    const trackId = runtimeRef.current.preBreakTrackId;
    const game = session?.games.find((g) => g.playlistId === playlistId);
    if (!session || !game || !playlistId || !trackId) return;

    const backToGame = (prev: LiveRuntimeState): LiveRuntimeState => ({
      ...prev,
      mode: "running",
      activeGameNumber: game.gameNumber,
      screenId: (game.gameNumber === 1 ? "game1" : "game2") as ScreenId,
      preBreakTrackId: null,
      preBreakPlaylistId: null,
      breakStartedAtMs: null,
      advanceTriggeredForTrackId: null,
      isIntroSong: false,
      extensionMs: 0,
      freePlay: false,
    });

    const ok = await sendCommand(
      "resume_from_track",
      { playlistId, trackId },
      { modeOnSuccess: "running" }
    );
    if (ok) {
      commitRuntime(backToGame);
      setNoticeVariant("success");
      setNotice(`Resumed Game ${game.gameNumber} from where it left off.`);
    } else {
      // Spotify unavailable: return the TV to the game screen anyway and let
      // the host drive playback by hand (manual host control mode).
      commitRuntime((prev) => ({
        ...backToGame(prev),
        spotifyControlAvailable: false,
        warningMessage: prev.warningMessage || "Manual host control mode active.",
      }));
      setNoticeVariant("warning");
      setNotice("Spotify control unavailable. Restart the game playlist in the Spotify app.");
    }
  }

  function openClaimScreen() {
    commitRuntime((prev) => ({
      ...prev,
      mode: "paused",
      screenId: "claim" as ScreenId,
    }));

    if (runtimeRef.current.spotifyControlAvailable) {
      void sendCommand("pause", undefined, { modeOnSuccess: "paused" });
    }
  }

  function returnFromClaimScreen() {
    const gameNumber = runtimeRef.current.activeGameNumber;
    if (!gameNumber) return;
    const screenId = (gameNumber === 2 ? "game2" : "game1") as ScreenId;

    commitRuntime((prev) => ({
      ...prev,
      mode: "running",
      screenId,
    }));

    if (runtimeRef.current.spotifyControlAvailable) {
      void sendCommand("resume", undefined, { modeOnSuccess: "running" });
    }
  }

  function restartSong() {
    const current = runtimeRef.current;
    const screenId = normalizeScreenId(current.screenId, deriveScreenId(current));
    const trackId = current.currentTrack?.trackId ?? null;
    const gamePlaylistId = current.activeGameNumber
      ? session?.games.find((g) => g.gameNumber === current.activeGameNumber)?.playlistId ?? null
      : null;
    // The welcome and intro songs play on their own, not from a game
    // playlist, so restart them as single tracks. Restarting them inside the
    // game playlist asks Spotify for a song that playlist may not hold, which
    // it refuses ("Restriction violated").
    if (screenId === "welcome" && !current.isIntroSong) {
      void playWelcomeSong();
      return;
    }
    commitRuntime((prev) => ({
      ...prev,
      extensionMs: 0,
      revealState: { showAlbum: false, showTitle: false, showArtist: false, shouldAdvance: false },
      advanceTriggeredForTrackId: null,
    }));
    // A restarted song with a start time jumps to it again.
    songStartSeekedTrackRef.current = null;
    if (current.isIntroSong && trackId) {
      void sendCommand("play_track", { trackId });
      return;
    }
    // Off the game screens (break, standings and so on) the song belongs to
    // whatever Spotify is playing, so restart it where it is, without
    // switching the show into running mode.
    const onGameScreen = screenId === "game1" || screenId === "game2" || screenId === "claim";
    if (!onGameScreen && trackId) {
      void sendCommand("seek", { positionMs: 0 });
      return;
    }
    void sendCommand(
      "resume_from_track",
      {
        ...(trackId ? { trackId } : {}),
        ...(gamePlaylistId ? { playlistId: gamePlaylistId } : {}),
      },
      { modeOnSuccess: "running" }
    );
  }

  async function saveSongTiming(inputs = {
    albumSeconds: albumRevealSecondsInput,
    titleSeconds: titleRevealSecondsInput,
    artistSeconds: artistRevealSecondsInput,
    songPlaySeconds: songPlaySecondsInput,
  }) {
    if (!session || !isController) return;
    const revealConfig = parseRevealConfigInputs(inputs);
    if (!revealConfig) {
      setError(
        `Timing must be ordered as album, title, artist, next song, with song play time between ${Math.floor(MIN_SONG_PLAY_MS / 1000)} and ${Math.floor(MAX_SONG_PLAY_MS / 1000)} seconds.`
      );
      return;
    }
    const updatedSession: LiveSessionV1 = {
      ...session,
      revealConfig,
    };
    setTimingSaving(true);
    setError("");
    try {
      await upsertLiveSession(updatedSession);
      setSession(updatedSession);
      commitRuntime((prev) => ({
        ...prev,
        revealConfig,
      }));
      setNoticeVariant("success");
      setNotice(`Song play time updated to ${formatTimingMs(revealConfig.nextMs)}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update song timing.");
    } finally {
      setTimingSaving(false);
    }
  }

  async function reconnectSpotify() {
    setError("");
    try {
      const popup = window.open("/api/spotify/authorize", "spotify_auth", "popup,width=520,height=720");
      if (!popup) {
        setError("Popup blocked. Allow popups for this site and try again.");
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          window.removeEventListener("message", onMessage);
          window.clearInterval(timer);
        };
        const onMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          const data = event.data as { type?: string; ok?: boolean; error?: string } | null;
          if (!data || data.type !== "spotify-auth") return;
          cleanup();
          if (data.ok) resolve();
          else reject(new Error(data.error || "Spotify auth failed."));
        };
        const timer = window.setInterval(() => {
          if (popup.closed) { cleanup(); reject(new Error("Spotify auth window was closed.")); }
        }, 500);
        window.addEventListener("message", onMessage);
      });
      // Success — reset circuit-breaker and resume polling.
      spotifyDisconnectedRef.current = false;
      setSpotifyDisconnected(false);
      commitRuntime((prev) => ({ ...prev, warningMessage: null }));
      void pollStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reconnect Spotify.");
    }
  }

  // ---- Screen navigation (Change 2) ----
  // The navigable show: excludes system (sys-*) and on-demand overlay screens
  // (e.g. Bingo Claim), so Prev/Next and the run-of-show list skip over them.
  // A game with no warm-up song has no warm-up step: the TV never shows an
  // empty dance-along or sing-along screen (Peter, 13 November 2026).
  const SHOW_SCREENS = showStepsFor((n) =>
    hasPlayableWarmup(session?.games.find((g) => g.gameNumber === n))
  );

  function hasAwardedTeams(): boolean {
    return runtimeRef.current.teamScores.some((team) => team.name.trim());
  }

  function requireScoredTeamsBeforeThanks(): boolean {
    if (hasAwardedTeams()) return true;
    setNoticeVariant("warning");
    setNotice("Add teams and scores in Award Points before moving to the thank you screen.");
    return false;
  }

  function requireScoredTeamsBeforeWinners(): boolean {
    if (hasAwardedTeams()) return true;
    setNoticeVariant("warning");
    setNotice("Add teams and scores in Award Points before revealing the winners screen.");
    return false;
  }

  function gotoScreen(id: ScreenId): void {
    const currentId = normalizeScreenId(runtimeRef.current.screenId, deriveScreenId(runtimeRef.current));
    if (currentId !== "winners" && id === "winners" && !requireScoredTeamsBeforeWinners()) {
      return;
    }
    if (currentId === "winners" && id === "thanks" && !requireScoredTeamsBeforeThanks()) {
      return;
    }
    // Every path to the break screen — Prev/Next, the run-of-show list, or the
    // dedicated button — must also enter break mode and start the break playlist
    // (when one is configured and Spotify is controllable). openBreakScreen owns
    // that; route break here so no path leaves the game silently advancing.
    if (id === "break") {
      openBreakScreen();
      return;
    }
    if (id === "winner-entry" || id === "winners" || id === "thanks") {
      showClosingScreen(id);
      return;
    }
    if (runtimeRef.current.mode === "break") {
      leaveBreakToScreen(id);
      return;
    }
    // Standings runs with the break playlist still going (see leaveBreakToScreen),
    // so stop it on the way out. The screens that want their own music route
    // above this and start it themselves.
    if (currentId === "standings" && runtimeRef.current.spotifyControlAvailable) {
      void sendCommand("pause", undefined, { modeOnSuccess: "idle" });
    }
    commitRuntime((prev) => ({ ...prev, screenId: id }));
  }

  function stepScreen(delta: 1 | -1): void {
    const currentId = normalizeScreenId(runtime.screenId, deriveScreenId(runtime));
    if (currentId === "winners") {
      const visibleCount = getWinnersRevealCount(runtimeRef.current);
      const revealTotal = getWinnersRevealTotal(runtimeRef.current);
      if (delta === 1 && visibleCount < revealTotal) {
        commitRuntime((prev) => ({
          ...prev,
          winnersRevealCount: Math.min(getWinnersRevealTotal(prev), getWinnersRevealCount(prev) + 1),
        }));
        return;
      }
      if (delta === -1 && visibleCount > 0) {
        commitRuntime((prev) => ({
          ...prev,
          winnersRevealCount: Math.max(0, getWinnersRevealCount(prev) - 1),
        }));
        return;
      }
    }
    gotoScreen(adjacentShowStep(SHOW_SCREENS, currentId, delta));
  }

  if (error && !session) {
    return (
      <div className="host-root">
        <div className="host-bar">
          <div className="brandlock">
            <AnchorLogo height={40} priority />
            <div className="host-title">
              Music Bingo
              <small>Host controller</small>
            </div>
          </div>
        </div>
        <main className="mx-auto max-w-2xl px-4 py-8">
          <Card className="flex flex-col gap-4 p-5">
            <Banner tone="danger">{error}</Banner>
            <Link href="/host" className={buttonClass({ variant: "outline", size: "sm", className: "self-start" })}>
              Back to the games list
            </Link>
          </Card>
        </main>
      </div>
    );
  }

  const activeGame = runtime.activeGameNumber
    ? session?.games.find((g) => g.gameNumber === runtime.activeGameNumber) ?? null
    : null;

  // ---- Derived values ----
  const localChallengeType = matchChallengeSong(runtime.currentTrack, activeGame);
  const isChallenge = runtime.isChallengeSong || localChallengeType !== null;
  const normalRevealConfig = runtime.revealConfig ?? session?.revealConfig ?? DEFAULT_REVEAL_CONFIG;
  // ---- After Hours console derived values ----
  const effectiveBrand = brand ?? DEFAULT_BRAND_CONFIG;
  const currentScreenId = normalizeScreenId(runtime.screenId, deriveScreenId(runtime));

  // Why songs are not auto-advancing right now, shown on the Now Playing panel
  // so a stalled game engine is never a silent surprise mid-show.
  const autoAdvanceOff =
    currentScreenId !== "game1" && currentScreenId !== "game2"
      ? null
      : !isController
        ? "Auto-advance off: another tab has control"
        : runtime.mode !== "running"
          ? "Auto-advance off: paused"
          : !runtime.spotifyControlAvailable
            ? "Auto-advance off: no Spotify control"
            : null;

  // EditContext value — Change 3
  const editValue: EditContextValue = {
    editing,
    get: (key: string, fallback?: string): string =>
      getContent(key as ContentKey, { runtime, session, brand: effectiveBrand }) || (fallback ?? ""),
    set: (key: string, value: string): void => {
      // Write into runtime.content so the TV sees it immediately, and persist via upsertLiveSession.
      commitRuntime((prev) => ({
        ...prev,
        content: { ...(prev.content ?? {}), [key as ContentKey]: value },
      }));
      // Persist onto the session record (functional updater reads the latest
      // session, avoiding a stale closure if a poll/timing-save mutated it).
      setSession((prevSession) => {
        if (!prevSession) return prevSession;
        const updatedSession = {
          ...prevSession,
          content: { ...(prevSession.content ?? {}), [key as ContentKey]: value },
        };
        void upsertLiveSession(updatedSession).catch(() => {});
        return updatedSession;
      });
    },
  };

  // ---- Welcome Song handlers ----
  // Resolve a pasted Spotify track link, push the song text to the TV (introTitle/
  // introArtist content keys) and store the resolved track on the runtime so the
  // Play button always has the URI and the choice survives a refresh.
  const setWelcomeSongFromLink = async (url: string): Promise<void> => {
    setWelcomeSongBusy(true);
    setWelcomeSongError(null);
    try {
      const res = await fetch("/api/spotify/resolve-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json().catch(() => null)) as
        | { trackId: string; uri: string; title: string; artist: string; error?: string }
        | null;
      if (!res.ok || !data || data.error) {
        setWelcomeSongError(data?.error ?? "Could not resolve that Spotify track.");
        return;
      }
      // Update the live on-screen display (Welcome screen reads these keys).
      editValue.set("introTitle", data.title);
      editValue.set("introArtist", data.artist);
      // Back the Play button with the resolved track.
      commitRuntime((prev) => ({
        ...prev,
        welcomeSong: {
          trackId: data.trackId,
          uri: data.uri,
          title: data.title,
          artist: data.artist,
        },
      }));
    } catch (err) {
      setWelcomeSongError(err instanceof Error ? err.message : "Could not resolve that Spotify track.");
    } finally {
      setWelcomeSongBusy(false);
    }
  };

  const playWelcomeSong = async (): Promise<void> => {
    const song = runtimeRef.current.welcomeSong ?? DEFAULT_WELCOME_SONG;
    const ok = await sendCommand("play_track", { trackId: song.trackId }, { modeOnSuccess: "idle" });
    if (!ok) return;
    commitRuntime((prev) => ({
      ...prev,
      mode: "idle",
      activeGameNumber: null,
      screenId: "welcome" as ScreenId,
      welcomeSong: song,
      isIntroSong: false,
      introPlayed: false,
      isChallengeSong: false,
      challengeType: null,
      challengeBonusPoints: DEFAULT_CHALLENGE_BONUS_POINTS,
      advanceTriggeredForTrackId: null,
      extensionMs: 0,
      freePlay: false,
    }));
  };

  const pauseWelcomeSong = async (): Promise<void> => {
    await sendCommand("pause");
  };

  // Disable Play only when Spotify is disconnected. With no active device the
  // command route sends the song to the one Spotify app that is open, or says
  // which app to press play in, so the button must stay usable to do that.
  const welcomeSongPlayDisabled = spotifyDisconnected;

  // Prefer the resolved track's labels; fall back to the live content keys.
  const welcomeSong = runtime.welcomeSong ?? DEFAULT_WELCOME_SONG;
  const welcomeSongTitle = welcomeSong.title || editValue.get("introTitle", "");
  const welcomeSongArtist = welcomeSong.artist || editValue.get("introArtist", "");
  const isWelcomeScreen = currentScreenId === "welcome";
  const isWelcomeSongCurrent = runtime.currentTrack?.trackId === welcomeSong.trackId;
  const isWelcomeSongPlaying = Boolean(isWelcomeSongCurrent && runtime.currentTrack?.isPlaying);
  const panelTrack = isWelcomeScreen && !isWelcomeSongCurrent
    ? {
      title: welcomeSongTitle || DEFAULT_WELCOME_SONG.title,
      artist: welcomeSongArtist || DEFAULT_WELCOME_SONG.artist,
      albumImageUrl: null,
    }
    : {
      title: runtime.currentTrack?.title ?? "—",
      artist: runtime.currentTrack?.artist ?? "",
      albumImageUrl: runtime.currentTrack?.albumImageUrl ?? null,
    };
  const panelPlaying = isWelcomeScreen
    ? isWelcomeSongPlaying
    : (runtime.currentTrack?.isPlaying ?? false);

  // Playlist current index (0-based)
  const currentTrackIdx = (() => {
    if (!runtime.currentTrack?.trackId || playlistTracks.length === 0) return 0;
    const idx = playlistTracks.findIndex((t) => t.trackId === runtime.currentTrack?.trackId);
    return idx >= 0 ? idx : 0;
  })();

  // Base reveal config in SECONDS for NowPlayingPanel. The panel applies the
  // +30s extension itself (via `extendedMs`), so pass the UN-extended config
  // here — otherwise the host readout would double-count the extension.
  const baseCfgForPanel = isChallenge ? CHALLENGE_REVEAL_CONFIG : normalRevealConfig;
  const timingForPanel = {
    song: Math.round(baseCfgForPanel.nextMs / 1000),
    album: Math.round(baseCfgForPanel.albumMs / 1000),
    title: Math.round(baseCfgForPanel.titleMs / 1000),
    artist: Math.round(baseCfgForPanel.artistMs / 1000),
  };

  // Current step is a play screen
  const currentStep = SHOW_SCREENS.find((s) => s.id === currentScreenId);
  const isOnPlayScreen = currentStep?.play === true;
  const hasScoreTeams = runtime.teamScores.some((team) => team.name.trim());
  const isAtLastScreen = SHOW_SCREENS.findIndex((s) => s.id === currentScreenId) === SHOW_SCREENS.length - 1;
  const nextScreenBlocked =
    (currentScreenId === "winner-entry" || currentScreenId === "winners") && !hasScoreTeams;
  const nextScreenBlockedTitle = currentScreenId === "winner-entry"
    ? "Add at least one team in Award Points before revealing the winners screen."
    : "Add at least one team in Award Points before continuing.";
  const winnersRevealTotal = currentScreenId === "winners" ? getWinnersRevealTotal(runtime) : 0;
  const winnersVisibleCount = currentScreenId === "winners" ? getWinnersRevealCount(runtime) : 0;
  const nextWinnerRank = winnersRevealTotal > winnersVisibleCount
    ? winnersRevealTotal - winnersVisibleCount
    : null;
  const claimAvailable =
    runtime.mode === "running" &&
    runtime.activeGameNumber != null &&
    isOnPlayScreen &&
    !runtime.isIntroSong;

  // Game 1 / Game 2 theme for PlaylistPanel
  const gameThemeKey = (runtime.activeGameNumber === 2 ? "g2theme" : "g1theme") as ContentKey;
  const gameThemeLabel = getContent(gameThemeKey, { runtime, session, brand: effectiveBrand });

  return (
    <EditContext.Provider value={editValue}>
        <div className="host-root pb-[calc(110px+env(safe-area-inset-bottom))]">

          {/* ---- Top bar ---- */}
          <div className="host-bar">
            <div className="brandlock">
              <AnchorLogo height={40} priority />
              <div className="host-title">
                Music Bingo
                <small>{session?.name ?? effectiveBrand.name} · Host Controller</small>
              </div>
            </div>
            <div className="right">
              {/* Spotify status pill */}
              <span className={`statuspill${spotifyDisconnected || !runtime.spotifyControlAvailable ? " warn" : ""}`}>
                <span className="led" />
                {spotifyDisconnected
                  ? "Spotify Offline"
                  : !runtime.spotifyControlAvailable
                  ? "Manual Mode"
                  : "Spotify Connected"}
              </span>
              {/* Award points */}
              <button
                type="button"
                className={buttonClass({ variant: "outline", size: "sm" })}
                onClick={() => setAwardModalOpen(true)}
                disabled={!isController}
                title={!isController ? "Take control before awarding points." : undefined}
              >
                Award Points
              </button>
              {/* Open private display */}
              <button
                type="button"
                className={buttonClass({ variant: "outline", size: "sm" })}
                onClick={openPrivateDisplay}
              >
                Open Display
              </button>
              {/* Back to sessions */}
              <Link href="/host" className={buttonClass({ variant: "outline", size: "sm" })}>
                Back to Sessions
              </Link>
            </div>
          </div>

          {/* ---- System-state banners (the kit Banner) ---- */}
          <div className="mx-auto flex max-w-[1560px] flex-col gap-3 px-4 pt-4 sm:px-6">
            {control.state.status === "lost" && (
              <Banner
                tone="warning"
                title="Another device has control"
                action={
                  <button
                    type="button"
                    className={buttonClass({ variant: "primary", size: "sm" })}
                    disabled={!control.takeoverReady}
                    onClick={() => {
                      void takeOver().then((ok) => {
                        if (!ok) {
                          setError("Could not take over. The other device is still running this game.");
                          return;
                        }
                        setNoticeVariant("success");
                        setNotice("This device now has control of the game.");
                      });
                    }}
                  >
                    {control.takeoverReady ? "Take over" : `Take over in ${control.takeoverIn ?? TAKEOVER_AFTER_S}s`}
                  </button>
                }
              >
                {control.takeoverReady
                  ? "The device running this game has been quiet for 30 seconds. Take over to run it from here."
                  : "This screen is read only and follows the device running the game. Take over is offered once that device has been quiet for 30 seconds."}
              </Banner>
            )}
            {control.state.error ? (
              <Banner tone="warning" title="Cannot check who has control">
                {control.state.error} The console keeps trying.
              </Banner>
            ) : null}
            {spotifyDisconnected && (
              <Banner
                tone="danger"
                title="Spotify disconnected"
                action={
                  <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => void reconnectSpotify()}>
                    Reconnect Spotify
                  </button>
                }
              >
                {runtime.warningMessage || "Playback control is unavailable because your Spotify session expired. Reconnect to resume."}
              </Banner>
            )}
            {!spotifyDisconnected && !runtime.spotifyControlAvailable && (
              <>
                <Banner
                  tone="warning"
                  title="Manual host control mode"
                  action={
                    <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => void pollStatus()}>
                      Resync
                    </button>
                  }
                >
                  No active Spotify device detected. Control playback in the Spotify app while this screen drives the on-screen reveals.
                </Banner>
                <Banner tone="success">Reveal timing is still running, so the TV will advance on schedule.</Banner>
              </>
            )}
            {syncState.status === "retrying" ? (
              <Banner tone="warning" title="Not saved yet: retrying">
                {syncState.message}
              </Banner>
            ) : null}
            {syncState.status === "refused" ? (
              <Banner
                tone="danger"
                title={syncState.title}
                action={<DismissButton onClick={() => setSyncState({ status: "saved" })} />}
              >
                {syncState.message}
              </Banner>
            ) : null}
            {notice ? (
              <Banner
                tone={noticeVariant === "warning" ? "warning" : "info"}
                action={<DismissButton onClick={() => setNotice("")} />}
              >
                {notice}
              </Banner>
            ) : null}
            {playbackWarning ? (
              <Banner tone="warning" action={<DismissButton onClick={() => setPlaybackWarning("")} />}>
                {playbackWarning}
              </Banner>
            ) : null}
            {error ? (
              <Banner tone="danger" action={<DismissButton onClick={() => setError("")} />}>
                {error}
              </Banner>
            ) : null}
          </div>

          {/* ---- Main 2-col layout ----
              Read only without control (spec M-9): every control in the
              columns is disabled until this device takes over. */}
          <fieldset disabled={!isController} className="contents">
          <div className="host-main">

            {/* LEFT — TV preview + run of show */}
            <div className="host-col">

              {/* TV preview panel */}
              <div className="panel tv-wrap">
                <h2>
                  On The TV Now{" "}
                  <span className="meta">
                    {SHOW_SCREENS.find((s) => s.id === currentScreenId)?.short ?? currentScreenId}
                  </span>
                </h2>
                <div className="tv-frame" ref={tvFrameRef}>
                  <div className="tv-live">
                    <span className="led" />
                    Live
                  </div>
                  <div
                    className="tv-canvas"
                    style={{ transform: `scale(${previewScale})` }}
                  >
                    {/* Render the current screen from the registry */}
                    <div className={editing ? "editing" : ""} style={{ position: "absolute", inset: 0 }}>
                      {SCREEN_REGISTRY[currentScreenId]({
                        brand: effectiveBrand,
                        runtime,
                        eventDateInput: session?.eventDateInput ?? null,
                        songTotal: gameSongTotal(session, runtime.activeGameNumber),
                      })}
                      <ScoreToastOverlay toast={runtime.scoreToast} />
                      <TvCornerLogo brand={effectiveBrand} />
                    </div>
                  </div>
                </div>

              </div>

              {/* Run Of Show panel */}
              <div className="panel">
                <h2>
                  Run Of Show{" "}
                  <span className="meta">
                    {SHOW_SCREENS.findIndex((s) => s.id === currentScreenId) + 1} / {SHOW_SCREENS.length}
                  </span>
                </h2>
                <div className="ros">
                  {SHOW_SCREENS.map((step, i) => {
                    const isCurrent = step.id === currentScreenId;
                    const currentIdx2 = SHOW_SCREENS.findIndex((s) => s.id === currentScreenId);
                    const isDone = i < currentIdx2;
                    return (
                      <button
                        key={step.id}
                        type="button"
                        className={`ros-step${isCurrent ? " live" : isDone ? " done" : ""}`}
                        onClick={() => gotoScreen(step.id)}
                      >
                        <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                        <span>
                          <span className="lbl">{step.short}</span>
                          <br />
                          <span className="sub">{step.sub}</span>
                        </span>
                        {isCurrent && <span className="nowtag">● On TV</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT — control panels */}
            <div className="host-col">

              {/* Now Playing panel */}
              <NowPlayingPanel
                track={panelTrack}
                playing={panelPlaying}
                progressMs={songProgressMs(runtime.currentTrack?.progressMs ?? 0, runtime.songStartMs)}
                timing={timingForPanel}
                isIntro={runtime.isIntroSong}
                isChallenge={isChallenge}
                freePlay={runtime.freePlay}
                autoAdvanceOff={autoAdvanceOff}
                extendedMs={runtime.extensionMs}
                onTransport={(action) => {
                  if (action === "pause" || action === "resume") {
                    void sendCommand(action, undefined, {
                      modeOnSuccess: action === "pause" ? "paused" : "running",
                    });
                  } else if (action === "next" || action === "previous") {
                    // Skipping by hand on a bingo screen means the game is live,
                    // so clear any stale "paused" at the same time. Without this
                    // a host who paused, then kept the show moving with Next,
                    // never got the auto-advance engine back.
                    const onGameScreen =
                      currentScreenId === "game1" || currentScreenId === "game2";
                    void sendCommand(
                      action,
                      undefined,
                      onGameScreen ? { modeOnSuccess: "running" } : undefined
                    );
                  }
                }}
                welcomeIntroActive={isWelcomeScreen}
                welcomeIntroDisabled={welcomeSongPlayDisabled}
                onWelcomeIntro={() => void playWelcomeSong()}
                onPreShow={() => void startPreShowMusic()}
                preShowDisabled={spotifyDisconnected || !sessionBreakPlaylist(session)}
                preShowDisabledReason={
                  spotifyDisconnected
                    ? "Reconnect Spotify first."
                    : "Add a break playlist to this game in Event Setup to use pre-show music."
                }
                onFree={() => commitRuntime((prev) => ({ ...prev, freePlay: !prev.freePlay }))}
                onExtend={() =>
                  commitRuntime((prev) => ({
                    ...prev,
                    extensionMs: Math.min(prev.extensionMs + 30_000, MAX_SONG_EXTENSION_MS),
                    advanceTriggeredForTrackId: null,
                  }))
                }
                onSkip={() => {
                  const progressMs = runtime.currentTrack?.progressMs ?? 0;
                  const durationMs = runtime.currentTrack?.durationMs ?? 0;
                  const requestedPos = progressMs + 30_000;
                  const maxSeekPos = durationMs > 1_000 ? Math.max(0, durationMs - 1_000) : requestedPos;
                  const newPos = Math.max(progressMs, Math.min(requestedPos, maxSeekPos));
                  const skippedMs = Math.max(0, newPos - progressMs);
                  if (skippedMs === 0) return;
                  commitRuntime((prev) => ({
                    ...prev,
                    extensionMs: Math.min(prev.extensionMs + skippedMs, MAX_SONG_EXTENSION_MS),
                    advanceTriggeredForTrackId: null,
                  }));
                  void sendCommand("seek", { positionMs: newPos });
                }}
                onRestart={restartSong}
              />

              {/* Game Flow panel */}
              <GameFlowPanel
                mode={runtime.mode}
                activeGame={runtime.activeGameNumber}
                onIntro={(n) => void playIntroSong(n)}
                warmups={{
                  1: SHOW_SCREENS.some((s) => s.id === "dance"),
                  2: SHOW_SCREENS.some((s) => s.id === "sing"),
                }}
                onStart={(n) => void startGame(n)}
                onBreak={openBreakScreen}
                onResume={resumeFromBreak}
                resumeGameNumber={breakResumeGameNumber()}
                onResumeGame={() => void resumeGameFromBreak()}
                onClaim={openClaimScreen}
                onBackToGame={returnFromClaimScreen}
                claimAvailable={claimAvailable}
                claimCount={runtime.playedTracks?.length ?? 0}
                claimActive={runtime.screenId === "claim"}
                onEnd={() => {
                  // Refused without control, so the hold never shows done.
                  if (!isControllerRef.current) return false;
                  showClosingScreen("winner-entry");
                  return true;
                }}
                onReset={() => {
                  if (!isControllerRef.current) return false;
                  commitRuntime((prev) => ({
                    ...prev,
                    mode: "idle",
                    screenId: "welcome" as ScreenId,
                    activeGameNumber: null,
                    currentTrack: null,
                    playedTracks: [],
                    revealState: { showAlbum: false, showTitle: false, showArtist: false, shouldAdvance: false },
                    advanceTriggeredForTrackId: null,
                    isChallengeSong: false,
                    challengeType: null,
                    challengeBonusPoints: DEFAULT_CHALLENGE_BONUS_POINTS,
                    teamScores: [],
                    scoreToast: null,
                    winnersRevealCount: 0,
                    isIntroSong: false,
                    introPlayed: false,
                    extensionMs: 0,
                    freePlay: false,
                  }));
                  return true;
                }}
              />

              {/* Content panel */}
              <ContentPanel
                get={editValue.get}
                set={editValue.set}
                collapsed={contentCollapsed}
                onToggle={() => setContentCollapsed((c) => !c)}
              />

              {/* Welcome Song panel — sets the idle-screen song line + manual play */}
              <WelcomeSongPanel
                title={welcomeSongTitle}
                artist={welcomeSongArtist}
                busy={welcomeSongBusy}
                playDisabled={welcomeSongPlayDisabled}
                error={welcomeSongError}
                onSetSong={(url) => void setWelcomeSongFromLink(url)}
                onPlay={() => void playWelcomeSong()}
                onPause={() => void pauseWelcomeSong()}
              />

              {/* Timing panel — converts ms ↔ seconds */}
              <TimingPanel
                key={[
                  normalRevealConfig.nextMs,
                  normalRevealConfig.albumMs,
                  normalRevealConfig.titleMs,
                  normalRevealConfig.artistMs,
                ].join(":")}
                timing={{
                  song: Math.round(normalRevealConfig.nextMs / 1000),
                  album: Math.round(normalRevealConfig.albumMs / 1000),
                  title: Math.round(normalRevealConfig.titleMs / 1000),
                  artist: Math.round(normalRevealConfig.artistMs / 1000),
                }}
                setTiming={(t) => {
                  // Convert seconds back to ms and run through the existing save path.
                  const inputs = {
                    songPlaySeconds: String(t.song),
                    albumSeconds: String(t.album),
                    titleSeconds: String(t.title),
                    artistSeconds: String(t.artist),
                  };
                  setSongPlaySecondsInput(inputs.songPlaySeconds);
                  setAlbumRevealSecondsInput(inputs.albumSeconds);
                  setTitleRevealSecondsInput(inputs.titleSeconds);
                  setArtistRevealSecondsInput(inputs.artistSeconds);
                  void saveSongTiming(inputs);
                }}
              />

              {/* Playlist panel — only on play screens */}
              {isOnPlayScreen && (
                <PlaylistPanel
                  playlist={playlistTracks.map((t) => ({ title: t.title, artist: t.artist }))}
                  currentIdx={currentTrackIdx}
                  activeGame={runtime.activeGameNumber}
                  theme={gameThemeLabel}
                />
              )}
            </div>
          </div>
          </fieldset>

          {/* ---- TVs: pair the pub screen, or hand out a TV link (spec M-9) ----
              Outside the read-only fieldset: pairing and links never change the game. */}
          <section className="mx-auto grid max-w-[1560px] gap-[22px] px-4 pb-6 sm:px-6 lg:grid-cols-2" aria-label="TVs">
            <div className="panel">
              <PairTvForm action={pairTv} bare />
            </div>
            <div className="panel flex flex-col gap-3">
              <h2>
                TV Links <span className="meta">24 hours</span>
              </h2>
              <p className="text-base text-fg-muted">
                For a screen that cannot be paired. A link opens this game only, works for 24 hours, and stops at once if you cancel links.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={buttonClass({ variant: "outline", size: "sm" })}
                  onClick={() => void copyTvLink()}
                  disabled={linksBusy !== null}
                >
                  {linksBusy === "copy" ? "Copying..." : "Copy a TV link"}
                </button>
                <button
                  type="button"
                  className={buttonClass({ variant: "outline", size: "sm" })}
                  onClick={() => void cancelLinks()}
                  disabled={linksBusy !== null}
                >
                  {linksBusy === "cancel" ? "Cancelling..." : "Cancel links"}
                </button>
              </div>
              {linksNotice ? <p className="text-base text-fg" role="status">{linksNotice}</p> : null}
            </div>
          </section>

          {/* ---- The dock: move the show on, always in the same place (spec S4.1) ---- */}
          <Dock widthClassName="max-w-[1560px]">
            <div className="flex flex-wrap gap-[10px]">
              <button
                type="button"
                className={buttonClass({ variant: "outline", size: "lg", className: "flex-1" })}
                onClick={() => stepScreen(-1)}
                disabled={!isController || SHOW_SCREENS.findIndex((s) => s.id === currentScreenId) === 0}
              >
                {currentScreenId === "winners" && winnersVisibleCount > 0
                  ? "‹ Hide Last Reveal"
                  : "‹ Previous Screen"}
              </button>
              <button
                type="button"
                className={buttonClass({ variant: editing ? "primary" : "outline", size: "sm" })}
                style={{ minHeight: 46, padding: "0 18px" }}
                onClick={() => setEditing((e) => !e)}
                disabled={!isController}
                title="Toggle click-to-edit mode for TV content"
              >
                ✎ Edit
              </button>
              <button
                type="button"
                className={buttonClass({ variant: "primary", size: "lg", className: "flex-1" })}
                onClick={() => stepScreen(1)}
                disabled={!isController || isAtLastScreen || nextScreenBlocked}
                title={nextScreenBlocked ? nextScreenBlockedTitle : undefined}
              >
                {nextScreenBlocked
                  ? currentScreenId === "winner-entry"
                    ? "Add Winners To Reveal"
                    : "Add Winners To Continue"
                  : nextWinnerRank !== null
                    ? `Reveal #${nextWinnerRank} Place`
                  : "Next Screen ›"}
              </button>
            </div>
          </Dock>
          <AwardPointsModal
            open={awardModalOpen}
            teams={runtime.teamScores}
            presets={AWARD_PRESETS}
            defaultBonusPoints={activeGame ? getChallengeBonusPoints(activeGame) : undefined}
            onClose={() => setAwardModalOpen(false)}
            onAddTeam={addTeamScore}
            onRemoveTeam={removeTeamScore}
            onAward={awardTeamPoints}
          />
        </div>
    </EditContext.Provider>
  );
}

/** Clears a host banner. */
function DismissButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label="Dismiss"
      className={buttonClass({ variant: "ghost", size: "sm", className: "w-11 px-0" })}
      onClick={onClick}
    >
      ✕
    </button>
  );
}
