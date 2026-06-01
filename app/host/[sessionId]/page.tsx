"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useWakeLock } from "@/hooks/useWakeLock";
import { AppHeader } from "@/components/layout/AppHeader";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { publishLiveMessage } from "@/lib/live/channel";
import { NowPlayingPanel } from "@/components/host/NowPlayingPanel";
import { GameFlowPanel } from "@/components/host/GameFlowPanel";
import { TimingPanel } from "@/components/host/TimingPanel";
import { ContentPanel } from "@/components/host/ContentPanel";
import { WelcomeSongPanel } from "@/components/host/WelcomeSongPanel";
import { PlaylistPanel } from "@/components/host/PlaylistPanel";
import { SCREEN_REGISTRY } from "@/components/screens/registry";
import { EditContext, type EditContextValue } from "@/components/motifs/EditContext";
import { BrandProvider } from "@/components/brand/BrandProvider";
import { SHOW_STEPS, normalizeScreenId, type ScreenId } from "@/lib/live/runOfShow";
import { deriveScreenId } from "@/lib/live/deriveScreen";
import { getContent, type ContentKey } from "@/lib/live/content";
import { DEFAULT_BRAND_CONFIG } from "@/lib/brands/defaultBrand";
import type { BrandConfig } from "@/lib/brands/types";
import { computeRevealState, shouldTriggerNextForTrack, updateAdvanceTrackMarker } from "@/lib/live/reveal";
import { getLiveSession, upsertLiveSession } from "@/lib/live/sessionApi";
import {
  formatSecondsInput,
  formatTimingMs,
  parseRevealConfigInputs,
} from "@/lib/live/timing";
import {
  acquireControlLock,
  isControlLockStale,
  readControlLock,
  readRuntimeState,
  releaseControlLock,
  updateControlHeartbeat,
  writeRuntimeState,
} from "@/lib/live/storage";
import { matchChallengeSong } from "@/lib/live/challenge";
import {
  CHALLENGE_REVEAL_CONFIG,
  DEFAULT_WELCOME_SONG,
  DEFAULT_REVEAL_CONFIG,
  MAX_SONG_EXTENSION_MS,
  MAX_SONG_PLAY_MS,
  MIN_SONG_PLAY_MS,
  LIVE_RUNTIME_VERSION,
  getRevealConfigWithExtension,
  getChallengeSongs,
  getIntroSongs,
  makeEmptyRuntimeState,
  withDefaultWelcomeSong,
  type LiveRuntimeState,
  type LiveSessionV1,
  type LiveTrackSnapshot,
  type RevealConfig,
} from "@/lib/live/types";

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
};

function makeTabId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `host-tab-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
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

export default function HostSessionControllerPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = useMemo(
    () => (typeof params?.sessionId === "string" ? params.sessionId : ""),
    [params?.sessionId]
  );

  useWakeLock();

  const tabIdRef = useRef<string>(makeTabId());
  const runtimeRef = useRef<LiveRuntimeState>(makeEmptyRuntimeState(sessionId || "pending"));
  const pollAbortRef = useRef<AbortController | null>(null);
  // Circuit-breaker: stop polling after a 401 until the user reconnects Spotify.
  const spotifyDisconnectedRef = useRef<boolean>(false);
  // Throttle for cross-device runtime sync: push at most once per 2s.
  const lastRuntimePushMsRef = useRef<number>(0);

  const [session, setSession] = useState<LiveSessionV1 | null>(null);
  const [runtime, setRuntime] = useState<LiveRuntimeState>(
    makeEmptyRuntimeState(sessionId || "pending")
  );
  const [notice, setNotice] = useState<string>("");
  const [noticeVariant, setNoticeVariant] = useState<"success" | "warning">("success");
  const pollFailCountRef = useRef<number>(0);
  const [error, setError] = useState<string>("");
  const [isController, setIsController] = useState<boolean>(false);
  const [spotifyDisconnected, setSpotifyDisconnected] = useState<boolean>(false);
  const [lockOwnerLabel, setLockOwnerLabel] = useState<string>("");
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
  const [_timingSaving, setTimingSaving] = useState<boolean>(false);
  // Resolved Spotify track IDs for all challenge songs of the active game.
  const challengeTrackIdsRef = useRef<Set<string>>(new Set());
  // Resolved Spotify track ID for the intro song (first track in playlist when introSongArtist is set).
  const introTrackIdRef = useRef<string | null>(null);

  // ---- After Hours console additions ----
  const [brand, setBrand] = useState<BrandConfig | null>(null);
  const [editing, setEditing] = useState<boolean>(false);
  const [contentCollapsed, setContentCollapsed] = useState<boolean>(false);
  // TV preview scale (ResizeObserver on the frame container)
  const [previewScale, setPreviewScale] = useState<number>(0.27);
  const tvFrameRef = useRef<HTMLDivElement | null>(null);

  // Load brand from the session API (mirrors guest page pattern).
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

  // Push runtime state to the server so guests on other devices can poll it.
  // Leading throttle: fires immediately, then blocks for 2s.
  useEffect(() => {
    if (!sessionId || !isController) return;
    const now = Date.now();
    if (now - lastRuntimePushMsRef.current < 2_000) return;
    lastRuntimePushMsRef.current = now;
    void fetch(`/api/sessions/${encodeURIComponent(sessionId)}/runtime`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(runtime),
    }).catch(() => {}); // best-effort: cross-device sync, not critical path
  }, [runtime, sessionId, isController]);

  const persistAndBroadcastRuntime = useCallback(
    (next: LiveRuntimeState) => {
      if (!sessionId) return;
      writeRuntimeState(sessionId, next);
      publishLiveMessage(sessionId, { type: "runtime_update", runtime: next });
    },
    [sessionId]
  );

  const commitRuntime = useCallback(
    (updater: LiveRuntimeState | ((prev: LiveRuntimeState) => LiveRuntimeState)) => {
      if (!sessionId) return;
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

        // --- Intro song detection (derived every tick, not sticky) ---
        const isIntroSong = !prev.introPlayed
          && introTrackIdRef.current != null
          && track?.trackId === introTrackIdRef.current;
        // Flip introPlayed on first track change after intro was playing.
        const introPlayed = prev.introPlayed || (prev.isIntroSong && trackChanged);

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

        // When intro or free play is active, show all metadata immediately (no timed reveal).
        const computedRevealState = (isIntroSong || prev.freePlay)
          ? { showAlbum: true, showTitle: true, showArtist: true, shouldAdvance: false }
          : computeRevealState(track?.progressMs ?? 0, cfg);
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
        const playedTracks =
          trackChanged && track?.trackId && !prevPlayed.some((t) => t.trackId === track.trackId)
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
          isIntroSong,
          introPlayed,
          extensionMs,
          advanceTriggeredForTrackId: marker,
          warningMessage: warnings[0] ?? (payload.error?.message ?? null),
        };
      });
    },
    [commitRuntime, session]
  );

  const acquireLock = useCallback(
    (force = false) => {
      if (!sessionId) return false;
      const attempt = acquireControlLock({
        sessionId,
        tabId: tabIdRef.current,
        force,
      });
      setIsController(attempt.acquired);
      if (!attempt.acquired && attempt.lock) {
        const stale = isControlLockStale(attempt.lock);
        setLockOwnerLabel(
          stale
            ? "Another tab may have stale control."
            : "Another host tab controls this session."
        );
      } else {
        setLockOwnerLabel("");
      }
      return attempt.acquired;
    },
    [sessionId]
  );

  useEffect(() => {
    const tabId = tabIdRef.current;
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
            serverRuntime = (await runtimeRes.json()) as LiveRuntimeState;
          }
        } catch {}
        const persistedRuntime = readRuntimeState(sessionId);
        const initial = withDefaultWelcomeSong({
          ...(serverRuntime ?? persistedRuntime ?? makeEmptyRuntimeState(sessionId)),
          revealConfig: loaded.revealConfig,
        });
        setRuntime(initial);
        runtimeRef.current = initial;
        acquireLock(false);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Failed to load session.");
      }
    })();
    // Release lock on tab close/refresh so another tab can take over immediately.
    const handleUnload = () => releaseControlLock(sessionId, tabId);
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", handleUnload);
      releaseControlLock(sessionId, tabId);
    };
  }, [acquireLock, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const tabId = tabIdRef.current;
    const interval = window.setInterval(() => {
      if (isController) {
        updateControlHeartbeat(sessionId, tabId);
        publishLiveMessage(sessionId, {
          type: "host_heartbeat",
          hostId: tabId,
          timestampMs: Date.now(),
        });
      } else {
        const lock = readControlLock(sessionId);
        if (!lock || isControlLockStale(lock)) {
          setLockOwnerLabel("");
        } else {
          setLockOwnerLabel("Another host tab controls this session.");
        }
      }
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [isController, sessionId]);

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
      const revealState = computeRevealState(track?.progressMs ?? 0, cfg);

      if (
        isController &&
        Boolean(data.canControlPlayback) &&
        !runtimeRef.current.freePlay &&
        !runtimeRef.current.isIntroSong &&
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
          commitRuntime((prev) => ({ ...prev, mode: "ended", screenId: "winners" as ScreenId }));
          await fetch("/api/spotify/live/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "pause" }),
          }).catch(() => {});
          return;
        }
        if (trackId) {
          commitRuntime((prev) => ({
            ...prev,
            advanceTriggeredForTrackId: trackId,
          }));
        }
        const nextRes = await fetch("/api/spotify/live/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "next" }),
        });
        if (!nextRes.ok) {
          const nextError = await nextRes
            .text()
            .catch(() => "Failed to advance to next song.");
          setError(nextError || "Failed to advance to next song.");
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

  const sendCommand = useCallback(
    async (
      action: "play_game" | "play_track" | "pause" | "resume" | "next" | "previous" | "seek" | "play_break" | "resume_from_track",
      payload?: Record<string, unknown>,
      opts?: { modeOnSuccess?: LiveRuntimeState["mode"] }
    ): Promise<boolean> => {
      setCommandBusy(true);
      setError("");
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

  async function startGame(gameNumber: 1 | 2) {
    if (!session || !isController) return;
    const game = session.games.find((item) => item.gameNumber === gameNumber);
    if (!game) {
      setError(`Game ${gameNumber} playlist not found in this session.`);
      return;
    }
    setNotice("");
    const ok = await sendCommand(
      "play_game",
      { playlistId: game.playlistId },
      { modeOnSuccess: "running" }
    );
    if (ok) {
      commitRuntime((prev) => ({
        ...prev,
        mode: "running",
        activeGameNumber: gameNumber,
        screenId: (gameNumber === 1 ? "game1" : "game2") as ScreenId,
        advanceTriggeredForTrackId: null,
        // Fresh game → start a new played-songs list for the Bingo Claim screen.
        playedTracks: [],
        isIntroSong: false,
        introPlayed: false,
        freePlay: false,
        extensionMs: 0,
      }));
      setNoticeVariant("success");
      setNotice(`Started Game ${gameNumber}: ${game.theme}`);
    } else {
      commitRuntime((prev) => ({
        ...prev,
        mode: "running",
        activeGameNumber: gameNumber,
        spotifyControlAvailable: false,
        // Fresh game → start a new played-songs list for the Bingo Claim screen.
        playedTracks: [],
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
      commitRuntime((prev) => ({
        ...prev,
        mode: "running",
        activeGameNumber: gameNumber,
        screenId: (gameNumber === 1 ? "dance" : "sing") as ScreenId,
        isIntroSong: true,
        introPlayed: false,
      }));
      const label = intros[0].type === "dance-along" ? "Dance Along" : "Sing Along";
      setNoticeVariant("success");
      setNotice(`Playing ${label}: ${intros[0].artist} — ${intros[0].title}`);
    }
  }

  function openBreakScreen() {
    const trackId = runtimeRef.current.currentTrack?.trackId ?? null;
    const gamePlaylistId = runtimeRef.current.activeGameNumber
      ? session?.games.find((g) => g.gameNumber === runtimeRef.current.activeGameNumber)?.playlistId ?? null
      : null;
    const spotifyAvailable = runtimeRef.current.spotifyControlAvailable;

    commitRuntime((prev) => ({
      ...prev,
      mode: "break",
      screenId: "break" as ScreenId,
      preBreakTrackId: trackId,
      preBreakPlaylistId: gamePlaylistId,
    }));

    if (spotifyAvailable) {
      if (session?.breakPlaylistId) {
        void sendCommand("play_break", { playlistId: session.breakPlaylistId });
      } else {
        // No break playlist configured — pause Spotify so the game doesn't
        // keep advancing silently while the guest display shows the break screen.
        void sendCommand("pause");
      }
    }
  }

  function resumeFromBreak() {
    const trackId = runtimeRef.current.preBreakTrackId;
    const playlistId = runtimeRef.current.preBreakPlaylistId;

    commitRuntime((prev) => ({
      ...prev,
      mode: "running",
      screenId: (prev.activeGameNumber === 2 ? "game2" : "game1") as ScreenId,
      preBreakTrackId: null,
      preBreakPlaylistId: null,
    }));

    void sendCommand(
      "resume_from_track",
      {
        ...(trackId ? { trackId } : {}),
        ...(playlistId ? { playlistId } : {}),
      },
      { modeOnSuccess: "running" }
    );
  }

  function restartSong() {
    const trackId = runtimeRef.current.currentTrack?.trackId ?? null;
    const gamePlaylistId = runtimeRef.current.activeGameNumber
      ? session?.games.find((g) => g.gameNumber === runtimeRef.current.activeGameNumber)?.playlistId ?? null
      : null;
    commitRuntime((prev) => ({
      ...prev,
      extensionMs: 0,
      revealState: { showAlbum: false, showTitle: false, showArtist: false, shouldAdvance: false },
      advanceTriggeredForTrackId: null,
    }));
    void sendCommand(
      "resume_from_track",
      {
        ...(trackId ? { trackId } : {}),
        ...(gamePlaylistId ? { playlistId: gamePlaylistId } : {}),
      },
      { modeOnSuccess: "running" }
    );
  }

  async function saveSongTiming() {
    if (!session || !isController) return;
    const revealConfig = parseRevealConfigInputs({
      albumSeconds: albumRevealSecondsInput,
      titleSeconds: titleRevealSecondsInput,
      artistSeconds: artistRevealSecondsInput,
      songPlaySeconds: songPlaySecondsInput,
    });
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
  const SHOW_SCREENS = SHOW_STEPS;

  function gotoScreen(id: ScreenId): void {
    // Every path to the break screen — Prev/Next, the run-of-show list, or the
    // dedicated button — must also enter break mode and start the break playlist
    // (when one is configured and Spotify is controllable). openBreakScreen owns
    // that; route break here so no path leaves the game silently advancing.
    if (id === "break") {
      openBreakScreen();
      return;
    }
    commitRuntime((prev) => ({ ...prev, screenId: id }));
  }

  function stepScreen(delta: 1 | -1): void {
    const currentId = normalizeScreenId(runtime.screenId, deriveScreenId(runtime));
    const currentIdx = SHOW_SCREENS.findIndex((s) => s.id === currentId);
    const baseIdx = currentIdx >= 0 ? currentIdx : 0;
    const nextIdx = Math.max(0, Math.min(SHOW_SCREENS.length - 1, baseIdx + delta));
    gotoScreen(SHOW_SCREENS[nextIdx].id);
  }

  function setWelcomeVariant(v: "A" | "B" | "C"): void {
    commitRuntime((prev) => ({ ...prev, welcomeVariant: v }));
  }

  function setTitleVariant(v: "A" | "B" | "C"): void {
    commitRuntime((prev) => ({ ...prev, titleVariant: v }));
  }

  if (error && !session) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader title="Live Host Controller" variant="light" />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <Card>
            <Notice variant="error" className="mb-4">{error}</Notice>
            <Button as="link" href="/host" variant="secondary">
              Back to Host Dashboard
            </Button>
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
      advanceTriggeredForTrackId: null,
      extensionMs: 0,
      freePlay: false,
    }));
  };

  const pauseWelcomeSong = async (): Promise<void> => {
    await sendCommand("pause");
  };

  // Disable Play when no welcome song is set, or Spotify control is unavailable
  // (mirrors how the transport buttons gate on spotifyControlAvailable/disconnected).
  const welcomeSongPlayDisabled =
    spotifyDisconnected || !runtime.spotifyControlAvailable;

  // Prefer the resolved track's labels; fall back to the live content keys.
  const welcomeSong = runtime.welcomeSong ?? DEFAULT_WELCOME_SONG;
  const welcomeSongTitle = welcomeSong.title || editValue.get("introTitle", "");
  const welcomeSongArtist = welcomeSong.artist || editValue.get("introArtist", "");

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

  // Game 1 / Game 2 theme for PlaylistPanel
  const gameThemeKey = (runtime.activeGameNumber === 2 ? "g2theme" : "g1theme") as ContentKey;
  const gameThemeLabel = getContent(gameThemeKey, { runtime, session, brand: effectiveBrand });

  return (
    <BrandProvider brand={brand}>
      <EditContext.Provider value={editValue}>
        <div className="host-root">

          {/* ---- Top bar ---- */}
          <div className="host-bar">
            <div className="brandlock">
              {effectiveBrand.logo_dark_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="logo" src={effectiveBrand.logo_dark_url} alt={effectiveBrand.name} />
              )}
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
              {/* Open guest screen */}
              <button
                type="button"
                className="hbtn"
                onClick={() => window.open(`/guest/${sessionId}`)}
              >
                Open Guest Screen ↗
              </button>
              {/* Back to sessions */}
              <Link href="/host" className="hbtn">
                Back to Sessions
              </Link>
            </div>
          </div>

          {/* ---- System-state banners ---- */}
          <div style={{ maxWidth: 1560, margin: "0 auto", padding: "18px 26px 0" }}>
            {!isController && (
              <div className="banner banner--warn">
                <span className="bi">🔒</span>
                <div className="bx">
                  <b>Read-only mode</b>
                  <p>{lockOwnerLabel || "Another host tab is controlling this session — your controls are disabled."}</p>
                </div>
                <button
                  type="button"
                  className="hbtn hbtn--primary"
                  onClick={() => {
                    const ok = acquireLock(true);
                    if (!ok) {
                      setError("Unable to take control right now.");
                      return;
                    }
                    setNoticeVariant("success");
                    setNotice("Controller lock transferred to this tab.");
                  }}
                >
                  Take Control
                </button>
              </div>
            )}
            {spotifyDisconnected && (
              <div className="banner banner--danger">
                <span className="bi">⚠</span>
                <div className="bx">
                  <b>Spotify disconnected</b>
                  <p>{runtime.warningMessage || "Playback control is unavailable — your Spotify session expired. Reconnect to resume."}</p>
                </div>
                <button type="button" className="hbtn" onClick={() => void reconnectSpotify()}>
                  Reconnect Spotify
                </button>
              </div>
            )}
            {!spotifyDisconnected && !runtime.spotifyControlAvailable && (
              <>
                <div className="banner banner--warn">
                  <span className="bi">🎛</span>
                  <div className="bx">
                    <b>Manual host control mode</b>
                    <p>No active Spotify device detected — control playback in the Spotify app while this screen drives the on-screen reveals.</p>
                  </div>
                  <button type="button" className="hbtn" onClick={() => void pollStatus()}>
                    Resync
                  </button>
                </div>
                <div className="notice notice--ok">
                  <span>✓</span>
                  <span>Reveal timing is still running — the TV will advance on schedule.</span>
                </div>
              </>
            )}
            {notice ? (
              <div className={`banner ${noticeVariant === "warning" ? "banner--warn" : "banner--info"}`} style={{ marginBottom: 0 }}>
                <span className="bi">{noticeVariant === "warning" ? "⚠" : "✓"}</span>
                <div className="bx"><p>{notice}</p></div>
                <button type="button" className="hbtn" onClick={() => setNotice("")}>✕</button>
              </div>
            ) : null}
            {error ? (
              <div className="banner banner--danger" style={{ marginBottom: 0 }}>
                <span className="bi">⚠</span>
                <div className="bx"><p>{error}</p></div>
                <button type="button" className="hbtn" onClick={() => setError("")}>✕</button>
              </div>
            ) : null}
          </div>

          {/* ---- Main 2-col layout ---- */}
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
                    <div className={editing ? "editing" : ""}>
                      {SCREEN_REGISTRY[currentScreenId]({
                        brand: effectiveBrand,
                        runtime,
                      })}
                    </div>
                  </div>
                </div>

                {/* Variant pickers for welcome / title screens */}
                {currentScreenId === "welcome" && (
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    <span style={{ fontSize: 12, opacity: 0.6, marginRight: 6 }}>Variant:</span>
                    {(["A", "B", "C"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`hbtn${runtime.welcomeVariant === v ? " hbtn--primary" : ""}`}
                        style={{ minHeight: 34, padding: "0 12px", fontSize: 13 }}
                        onClick={() => setWelcomeVariant(v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
                {currentScreenId === "title" && (
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    <span style={{ fontSize: 12, opacity: 0.6, marginRight: 6 }}>Variant:</span>
                    {(["A", "B", "C"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`hbtn${runtime.titleVariant === v ? " hbtn--primary" : ""}`}
                        style={{ minHeight: 34, padding: "0 12px", fontSize: 13 }}
                        onClick={() => setTitleVariant(v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}

                {/* Prev / Next + Edit toggle */}
                <div className="bignav">
                  <button
                    type="button"
                    className="hbtn grow hbtn--lg"
                    onClick={() => stepScreen(-1)}
                    disabled={SHOW_SCREENS.findIndex((s) => s.id === currentScreenId) === 0}
                  >
                    ‹ Previous Screen
                  </button>
                  <button
                    type="button"
                    className={`hbtn${editing ? " hbtn--primary" : ""}`}
                    style={{ minHeight: 46, padding: "0 18px" }}
                    onClick={() => setEditing((e) => !e)}
                    title="Toggle click-to-edit mode for TV content"
                  >
                    ✎ Edit
                  </button>
                  <button
                    type="button"
                    className="hbtn grow hbtn--lg hbtn--primary"
                    onClick={() => stepScreen(1)}
                    disabled={SHOW_SCREENS.findIndex((s) => s.id === currentScreenId) === SHOW_SCREENS.length - 1}
                  >
                    Next Screen ›
                  </button>
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
                track={{
                  title: runtime.currentTrack?.title ?? "—",
                  artist: runtime.currentTrack?.artist ?? "",
                }}
                playing={runtime.currentTrack?.isPlaying ?? false}
                progressMs={runtime.currentTrack?.progressMs ?? 0}
                timing={timingForPanel}
                isIntro={runtime.isIntroSong}
                isChallenge={isChallenge}
                freePlay={runtime.freePlay}
                extendedMs={runtime.extensionMs}
                onTransport={(action) => {
                  if (action === "pause" || action === "resume") {
                    void sendCommand(action, undefined, {
                      modeOnSuccess: action === "pause" ? "paused" : "running",
                    });
                  } else if (action === "next") {
                    void sendCommand("next");
                  } else if (action === "previous") {
                    void sendCommand("previous");
                  }
                }}
                onFree={() => commitRuntime((prev) => ({ ...prev, freePlay: !prev.freePlay }))}
                onExtend={() =>
                  commitRuntime((prev) => ({
                    ...prev,
                    extensionMs: Math.min(prev.extensionMs + 30_000, MAX_SONG_EXTENSION_MS),
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
                  }));
                  void sendCommand("seek", { positionMs: newPos });
                }}
                onRestart={restartSong}
              />

              {/* Game Flow panel */}
              <GameFlowPanel
                mode={runtime.mode}
                activeGame={runtime.activeGameNumber}
                onWelcomeIntro={() => void playWelcomeSong()}
                welcomeIntroDisabled={welcomeSongPlayDisabled}
                onIntro={(n) => void playIntroSong(n)}
                onStart={(n) => void startGame(n)}
                onBreak={openBreakScreen}
                onResume={resumeFromBreak}
                onClaim={() => gotoScreen("claim")}
                onBackToGame={() => gotoScreen((runtime.activeGameNumber === 2 ? "game2" : "game1") as ScreenId)}
                claimCount={runtime.playedTracks?.length ?? 0}
                claimActive={runtime.screenId === "claim"}
                onEnd={() =>
                  commitRuntime((prev) => ({
                    ...prev,
                    mode: "ended",
                    screenId: "winners" as ScreenId,
                  }))
                }
                onReset={() =>
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
                    isIntroSong: false,
                    introPlayed: false,
                    extensionMs: 0,
                    freePlay: false,
                  }))
                }
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
                timing={{
                  song: Math.round(normalRevealConfig.nextMs / 1000),
                  album: Math.round(normalRevealConfig.albumMs / 1000),
                  title: Math.round(normalRevealConfig.titleMs / 1000),
                  artist: Math.round(normalRevealConfig.artistMs / 1000),
                }}
                setTiming={(t) => {
                  // Convert seconds back to ms and run through the existing save path.
                  setSongPlaySecondsInput(String(t.song));
                  setAlbumRevealSecondsInput(String(t.album));
                  setTitleRevealSecondsInput(String(t.title));
                  setArtistRevealSecondsInput(String(t.artist));
                  void saveSongTiming();
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
        </div>
      </EditContext.Provider>
    </BrandProvider>
  );
}
