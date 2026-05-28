"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useWakeLock } from "@/hooks/useWakeLock";
import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { publishLiveMessage } from "@/lib/live/channel";
import { computeRevealState, shouldTriggerNextForTrack, updateAdvanceTrackMarker } from "@/lib/live/reveal";
import { getLiveSession, upsertLiveSession } from "@/lib/live/sessionApi";
import {
  formatSecondsInput,
  formatTimingMs,
  getDefaultRevealConfigForSongInput,
  parseRevealConfigInputs,
  revealConfigsEqual,
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
  DEFAULT_REVEAL_CONFIG,
  MAX_SONG_EXTENSION_MS,
  MAX_SONG_PLAY_MS,
  MIN_SONG_PLAY_MS,
  LIVE_RUNTIME_VERSION,
  getRevealConfigWithExtension,
  getChallengeSongs,
  getIntroSongs,
  makeEmptyRuntimeState,
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
  const [commandBusy, setCommandBusy] = useState<boolean>(false);
  const [playedTrackIds, setPlayedTrackIds] = useState<Set<string>>(new Set());
  const lastPlayedTrackIdRef = useRef<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<{ trackId: string; title: string; artist: string }[]>([]);
  const playlistTracksRef = useRef<{ trackId: string; title: string; artist: string }[]>([]);
  const loadedPlaylistIdRef = useRef<string | null>(null);
  // Guards against concurrent in-flight fetches for the same playlist.
  const fetchingPlaylistIdRef = useRef<string | null>(null);
  const [playlistLoadError, setPlaylistLoadError] = useState<boolean>(false);
  const [playlistRetryCount, setPlaylistRetryCount] = useState<number>(0);
  const [songPlaySecondsInput, setSongPlaySecondsInput] = useState<string>("");
  const [albumRevealSecondsInput, setAlbumRevealSecondsInput] = useState<string>("");
  const [titleRevealSecondsInput, setTitleRevealSecondsInput] = useState<string>("");
  const [artistRevealSecondsInput, setArtistRevealSecondsInput] = useState<string>("");
  const [timingSaving, setTimingSaving] = useState<boolean>(false);
  // Resolved Spotify track IDs for all challenge songs of the active game.
  const challengeTrackIdsRef = useRef<Set<string>>(new Set());
  // Resolved Spotify track ID for the intro song (first track in playlist when introSongArtist is set).
  const introTrackIdRef = useRef<string | null>(null);

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
        return {
          ...prev,
          mode: opts?.mode ?? prev.mode,
          spotifyControlAvailable: Boolean(payload.canControlPlayback),
          currentTrack: track,
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
        const persistedRuntime = readRuntimeState(sessionId);
        const initial = {
          ...(persistedRuntime ?? makeEmptyRuntimeState(sessionId)),
          revealConfig: loaded.revealConfig,
        };
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
          commitRuntime((prev) => ({ ...prev, mode: "ended" }));
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
        advanceTriggeredForTrackId: null,
        isIntroSong: false,
        introPlayed: false,
      }));
      setNoticeVariant("success");
      setNotice(`Started Game ${gameNumber}: ${game.theme}`);
    } else {
      commitRuntime((prev) => ({
        ...prev,
        mode: "running",
        activeGameNumber: gameNumber,
        spotifyControlAvailable: false,
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

  function resetRevealTimingToDefaults() {
    const fallback = runtimeRef.current.revealConfig ?? session?.revealConfig ?? DEFAULT_REVEAL_CONFIG;
    const revealConfig = getDefaultRevealConfigForSongInput(songPlaySecondsInput, fallback);
    setSongPlaySecondsInput(formatSecondsInput(revealConfig.nextMs));
    setAlbumRevealSecondsInput(formatSecondsInput(revealConfig.albumMs));
    setTitleRevealSecondsInput(formatSecondsInput(revealConfig.titleMs));
    setArtistRevealSecondsInput(formatSecondsInput(revealConfig.artistMs));
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

  function openGuestDisplay() {
    if (!sessionId) return;
    window.open(`/guest/${sessionId}`, "music_bingo_guest", "noopener,noreferrer");
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

  const activeGameTheme = runtime.activeGameNumber
    ? session?.games.find((g) => g.gameNumber === runtime.activeGameNumber)?.theme ?? ""
    : "";

  const activeGame = runtime.activeGameNumber
    ? session?.games.find((g) => g.gameNumber === runtime.activeGameNumber) ?? null
    : null;

  const localChallengeType = matchChallengeSong(runtime.currentTrack, activeGame);
  const isChallenge = runtime.isChallengeSong || localChallengeType !== null;
  const challengeType = runtime.challengeType ?? localChallengeType;
  const normalRevealConfig = runtime.revealConfig ?? session?.revealConfig ?? DEFAULT_REVEAL_CONFIG;
  const parsedRevealConfig = parseRevealConfigInputs({
    albumSeconds: albumRevealSecondsInput,
    titleSeconds: titleRevealSecondsInput,
    artistSeconds: artistRevealSecondsInput,
    songPlaySeconds: songPlaySecondsInput,
  });
  const timingInputInvalid = parsedRevealConfig === null;
  const songTimingChanged = parsedRevealConfig !== null && !revealConfigsEqual(parsedRevealConfig, normalRevealConfig);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title={session?.name ?? "Live Host"}
        subtitle="Host Controller"
        variant="light"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={openGuestDisplay}>
              Open Guest Screen
            </Button>
            <Button as="link" href="/host" variant="secondary" size="sm">
              Back to Sessions
            </Button>
          </>
        }
      />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {notice ? <Notice variant={noticeVariant}>{notice}</Notice> : null}
        {error ? <Notice variant="error">{error}</Notice> : null}
        {spotifyDisconnected ? (
          <Card className="border-red-300 bg-red-50">
            <h2 className="text-base font-bold text-red-800 mb-1">Spotify disconnected</h2>
            <p className="text-sm text-red-700 mb-3">
              {runtime.warningMessage || "Spotify auth expired. Reconnect to restore playback control."}
            </p>
            <Button variant="primary" size="sm" onClick={() => void reconnectSpotify()}>
              Reconnect Spotify
            </Button>
          </Card>
        ) : runtime.warningMessage ? (
          <Notice variant="warning">{runtime.warningMessage}</Notice>
        ) : null}

        {!isController ? (
          <Card className="border-amber-300 bg-amber-50">
            <h2 className="text-base font-bold text-amber-800 mb-1">Read-only mode</h2>
            <p className="text-sm text-amber-700 mb-3">
              {lockOwnerLabel || "Another host tab may be in control."}
            </p>
            <Button
              variant="primary"
              size="sm"
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
            </Button>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card as="article">
            <h2 className="text-base font-bold text-slate-800 mb-3 uppercase tracking-wide">
              Game Control
            </h2>
            <p className="text-sm text-slate-500 mb-1">
              Mode: <strong className="text-slate-700">{runtime.mode.toUpperCase()}</strong>
            </p>
            <p className="text-sm text-slate-500 mb-4">
              Active game:{" "}
              {runtime.activeGameNumber
                ? `Game ${runtime.activeGameNumber}${activeGameTheme ? ` (${activeGameTheme})` : ""}`
                : "None"}
            </p>

            <div className="flex flex-wrap gap-2.5 mb-3">
              {session?.games.find((g) => g.gameNumber === 1) && getIntroSongs(session.games.find((g) => g.gameNumber === 1)!).length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!isController || commandBusy}
                  onClick={() => void playIntroSong(1)}
                >
                  Play Dance Along
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                disabled={!isController || commandBusy}
                onClick={() => void startGame(1)}
              >
                Start Game 1
              </Button>
              {session?.games.find((g) => g.gameNumber === 2) && getIntroSongs(session.games.find((g) => g.gameNumber === 2)!).length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!isController || commandBusy}
                  onClick={() => void playIntroSong(2)}
                >
                  Play Sing Along
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                disabled={!isController || commandBusy}
                onClick={() => void startGame(2)}
              >
                Start Game 2
              </Button>
            </div>

            {runtime.mode === "break" ? (
              /* Break mode — prominent resume button, hide irrelevant game controls */
              <div className="flex flex-wrap gap-2.5 mb-3">
                <Button
                  variant="success"
                  size="sm"
                  disabled={!isController || commandBusy}
                  onClick={resumeFromBreak}
                >
                  ▶ Resume Game
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={commandBusy}
                  title="Click if guest display stops updating"
                  onClick={() => void pollStatus()}
                >
                  Resync State
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    commitRuntime((prev) => ({ ...prev, mode: "ended" }))
                  }
                >
                  End Session
                </Button>
              </div>
            ) : (
              /* Normal mode — full game controls */
              <>
                <div className="flex flex-wrap gap-2.5 mb-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!isController || commandBusy}
                    onClick={() =>
                      void sendCommand(
                        runtime.currentTrack?.isPlaying ? "pause" : "resume",
                        undefined,
                        {
                          modeOnSuccess: runtime.currentTrack?.isPlaying
                            ? "paused"
                            : "running",
                        }
                      )
                    }
                  >
                    {runtime.currentTrack?.isPlaying ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!isController || commandBusy}
                    onClick={() => void sendCommand("previous")}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!isController || commandBusy}
                    onClick={() => void sendCommand("next")}
                  >
                    Next
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={commandBusy}
                    title="Click if guest display stops updating"
                    onClick={() => void pollStatus()}
                  >
                    Resync State
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!isController || commandBusy}
                    onClick={openBreakScreen}
                  >
                    Show Break Screen
                  </Button>
                  <Button
                    variant={runtime.freePlay ? "primary" : "secondary"}
                    size="sm"
                    disabled={!isController}
                    title="Songs play in full with no auto-advance — useful after bingo is called"
                    onClick={() => commitRuntime((prev) => ({ ...prev, freePlay: !prev.freePlay }))}
                  >
                    {runtime.freePlay ? "Free Play ON" : "Free Play"}
                  </Button>
                  {runtime.mode === "ended" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!isController}
                      onClick={() =>
                        commitRuntime((prev) => ({
                          ...prev,
                          mode: "idle",
                          activeGameNumber: null,
                          currentTrack: null,
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
                    >
                      Reset to Lobby
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      commitRuntime((prev) => ({ ...prev, mode: "ended" }))
                    }
                  >
                    End Session
                  </Button>
                </div>
              </>
            )}
          </Card>

          <Card as="article">
            <h2 className="text-base font-bold text-slate-800 mb-3 uppercase tracking-wide">
              Track + Reveal
            </h2>
            <p className="text-sm text-slate-500 mb-1">
              Spotify API:{" "}
              <strong className="text-slate-700">
                {runtime.spotifyControlAvailable
                  ? "Available"
                  : "Manual host control mode"}
              </strong>
            </p>
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="text-sm font-semibold text-slate-700">
                  Song length
                  <input
                    type="number"
                    min={Math.floor(MIN_SONG_PLAY_MS / 1000)}
                    max={Math.floor(MAX_SONG_PLAY_MS / 1000)}
                    step={0.25}
                    value={songPlaySecondsInput}
                    onChange={(event) => setSongPlaySecondsInput(event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
                    disabled={!isController || timingSaving}
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Album reveal
                  <input
                    type="number"
                    min={0}
                    max={Math.floor(MAX_SONG_PLAY_MS / 1000)}
                    step={0.25}
                    value={albumRevealSecondsInput}
                    onChange={(event) => setAlbumRevealSecondsInput(event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
                    disabled={!isController || timingSaving}
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Title reveal
                  <input
                    type="number"
                    min={0}
                    max={Math.floor(MAX_SONG_PLAY_MS / 1000)}
                    step={0.25}
                    value={titleRevealSecondsInput}
                    onChange={(event) => setTitleRevealSecondsInput(event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
                    disabled={!isController || timingSaving}
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Artist reveal
                  <input
                    type="number"
                    min={0}
                    max={Math.floor(MAX_SONG_PLAY_MS / 1000)}
                    step={0.25}
                    value={artistRevealSecondsInput}
                    onChange={(event) => setArtistRevealSecondsInput(event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
                    disabled={!isController || timingSaving}
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!isController || timingSaving || timingInputInvalid || !songTimingChanged}
                  onClick={() => void saveSongTiming()}
                >
                  {timingSaving ? "Saving..." : "Save Timing"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!isController || timingSaving}
                  onClick={resetRevealTimingToDefaults}
                >
                  Use Default Reveals
                </Button>
              </div>
              <p className={["mt-1 text-xs", timingInputInvalid ? "text-red-600" : "text-slate-500"].join(" ")}>
                Defaults scale to the full clip; custom values must stay in order before the next-song time.
              </p>
            </div>
            <p className="text-sm text-slate-500 mb-2">
              Current track:{" "}
              <strong className="text-slate-700">
                {runtime.currentTrack?.title
                  ? `${runtime.currentTrack.title} — ${runtime.currentTrack.artist}`
                  : "No track detected"}
              </strong>
              {runtime.isIntroSong && runtime.mode !== "break" && (
                <span className="ml-2 inline-flex items-center rounded-full bg-purple-100 border border-purple-300 px-2 py-0.5 text-xs font-bold text-purple-800">
                  INTRO SONG
                </span>
              )}
              {isChallenge && !runtime.isIntroSong && runtime.mode !== "break" && (
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 border border-brand-gold px-2 py-0.5 text-xs font-bold text-amber-800">
                  {challengeType === 'dance-along' ? 'DANCE CHALLENGE' : 'SING-ALONG CHALLENGE'}
                </span>
              )}
            </p>

            {runtime.mode === "break" ? (
              /* Break mode — context-rich indicator showing what we'll resume to */
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 mb-3">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-sm font-semibold text-emerald-700">Break playlist playing</span>
                  {runtime.currentTrack?.progressMs != null && (
                    <span className="text-2xl font-black text-emerald-800 tabular-nums">
                      {Math.floor(runtime.currentTrack.progressMs / 1000)}s
                    </span>
                  )}
                </div>
                {runtime.activeGameNumber && (
                  <p className="text-xs text-emerald-600 mt-1">
                    Will resume: Game {runtime.activeGameNumber}
                    {activeGameTheme ? ` (${activeGameTheme})` : ""}
                    {playlistTracks.length > 0 && ` — track ${playedTrackIds.size} of ${playlistTracks.length}`}
                  </p>
                )}
              </div>
            ) : (
              /* Game mode — countdown, reveal badges, and controls */
              <>
                {/* Countdown / intro elapsed display */}
                {(() => {
                  const progressMs = runtime.currentTrack?.progressMs ?? 0;
                  const progressSec = Math.floor(progressMs / 1000);
                  // Intro mode: show elapsed time only, no countdown to next song.
                  if (runtime.isIntroSong) {
                    return (
                      <div className="rounded-xl bg-purple-50 border border-purple-200 px-3 py-2 mb-3">
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <span className="text-2xl font-black text-purple-800 tabular-nums">{progressSec}s</span>
                          <span className="text-sm font-semibold text-purple-600">
                            {runtime.activeGameNumber === 1 ? "Dance Along" : "Sing Along"}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  const baseCfg = isChallenge ? CHALLENGE_REVEAL_CONFIG : normalRevealConfig;
                  const effectiveCfg = getRevealConfigWithExtension(baseCfg, runtime.extensionMs);
                  const effectiveNextMs = effectiveCfg.nextMs;
                  const timeUntilNextSec = Math.max(0, Math.ceil((effectiveNextMs - progressMs) / 1000));
                  return (
                    <div className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-2 mb-3">
                      <div className="flex items-baseline gap-3 flex-wrap">
                        <span className="text-2xl font-black text-slate-800 tabular-nums">{progressSec}s</span>
                        <span className="text-sm text-slate-500">of {formatTimingMs(effectiveNextMs)}</span>
                        {runtime.revealState.shouldAdvance ? (
                          <span className="text-sm font-bold text-brand-gold">Advancing...</span>
                        ) : (
                          <span className="text-sm text-slate-500">
                            Next song in <strong className="text-slate-700">{timeUntilNextSec}s</strong>
                          </span>
                        )}
                        {runtime.extensionMs > 0 && (
                          <span className="text-xs text-brand-gold font-semibold">+{Math.floor(runtime.extensionMs / 1000)}s extended</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {(() => {
                  const baseBadgeCfg = isChallenge ? CHALLENGE_REVEAL_CONFIG : normalRevealConfig;
                  const badgeCfg = getRevealConfigWithExtension(baseBadgeCfg, runtime.extensionMs);
                  return (
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge active={runtime.revealState.showAlbum}>Album @{formatTimingMs(badgeCfg.albumMs)}</Badge>
                      <Badge active={runtime.revealState.showTitle}>Title @{formatTimingMs(badgeCfg.titleMs)}</Badge>
                      <Badge active={runtime.revealState.showArtist}>Artist @{formatTimingMs(badgeCfg.artistMs)}</Badge>
                      <Badge active={runtime.revealState.shouldAdvance}>
                        Next @{formatTimingMs(badgeCfg.nextMs)}
                      </Badge>
                    </div>
                  );
                })()}

                <div className="flex flex-wrap gap-2 mb-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!isController || commandBusy || runtime.mode !== "running" || runtime.extensionMs >= MAX_SONG_EXTENSION_MS}
                    title="Extend current song by 30 seconds (max 5 minutes extra)"
                    onClick={() => commitRuntime((prev) => ({ ...prev, extensionMs: Math.min(prev.extensionMs + 30_000, MAX_SONG_EXTENSION_MS) }))}
                  >
                    +30s
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!isController || commandBusy || !runtime.currentTrack}
                    title="Skip forward 30 seconds in the current song"
                    onClick={() => {
                      const progressMs = runtime.currentTrack?.progressMs ?? 0;
                      const durationMs = runtime.currentTrack?.durationMs ?? 0;
                      const requestedPos = progressMs + 30_000;
                      const maxSeekPos = durationMs > 1_000 ? Math.max(0, durationMs - 1_000) : requestedPos;
                      const newPos = Math.max(progressMs, Math.min(requestedPos, maxSeekPos));
                      const skippedMs = Math.max(0, newPos - progressMs);
                      if (skippedMs === 0) return;
                      // Also extend the reveal schedule by the amount skipped so
                      // seeking ahead preserves the remaining clip time.
                      commitRuntime((prev) => ({ ...prev, extensionMs: Math.min(prev.extensionMs + skippedMs, MAX_SONG_EXTENSION_MS) }));
                      void sendCommand("seek", { positionMs: newPos });
                    }}
                  >
                    Skip 30s
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!isController || commandBusy || !runtime.currentTrack}
                    onClick={restartSong}
                  >
                    Restart Song
                  </Button>
                </div>
              </>
            )}

            {activeGame && runtime.mode !== "break" && (() => {
              const songs = getChallengeSongs(activeGame);
              if (songs.length === 0) return null;
              return (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 mb-3">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">
                    {songs.length === 1 ? "Challenge Song" : `Challenge Songs (${songs.length})`} — Game {activeGame.gameNumber}
                  </p>
                  {songs.map((cs, i) => (
                    <p key={i} className="text-sm font-semibold text-amber-900">
                      {cs.artist} — {cs.title}
                    </p>
                  ))}
                  <p className="text-xs text-amber-600 mt-0.5">Plays for {formatTimingMs(CHALLENGE_REVEAL_CONFIG.nextMs)} instead of {formatTimingMs(normalRevealConfig.nextMs)}</p>
                </div>
              );
            })()}
            {(() => {
              if (!activeGame || runtime.mode === "break") return null;
              const intros = getIntroSongs(activeGame);
              if (intros.length === 0) return null;
              const intro = intros[0];
              return (
                <div className="rounded-xl bg-purple-50 border border-purple-200 px-3 py-2 mb-3">
                  <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-0.5">
                    {intro.type === "dance-along" ? "Dance Along" : "Sing Along"} — Game {activeGame.gameNumber}
                  </p>
                  <p className="text-sm font-semibold text-purple-900">
                    {intro.artist} — {intro.title}
                  </p>
                  <p className="text-xs text-purple-600 mt-0.5">
                    Plays before game — no auto-advance
                  </p>
                </div>
              );
            })()}
            <p className="text-xs text-slate-400">
              TV screen:{" "}
              <Link
                href={`/guest/${sessionId}`}
                target="_blank"
                className="underline underline-offset-2"
              >
                Open TV display
              </Link>
            </p>
          </Card>
        </div>

        {/* Playlist track listing */}
        <Card as="article">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-base font-bold text-slate-800 uppercase tracking-wide">
              {activeGame ? `Game ${activeGame.gameNumber} — ${activeGame.theme}` : "Playlist"}
            </h2>
            {playlistTracks.length > 0 && (
              <span className="text-xs text-slate-400 tabular-nums">
                {playedTrackIds.size} / {playlistTracks.length} played
              </span>
            )}
          </div>

          {playlistTracks.length === 0 ? (
            <div className="mt-3">
              {!runtime.activeGameNumber ? (
                <p className="text-sm text-slate-400 italic">Start a game to see the full track listing here.</p>
              ) : playlistLoadError ? (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-red-500">Failed to load playlist.</p>
                  <button
                    type="button"
                    className="text-sm text-brand-gold underline hover:no-underline"
                    onClick={() => {
                      loadedPlaylistIdRef.current = null;
                      fetchingPlaylistIdRef.current = null;
                      setPlaylistRetryCount((n) => n + 1);
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">Loading playlist…</p>
              )}
            </div>
          ) : (
            <ol className="mt-3 space-y-0.5 max-h-[480px] overflow-y-auto pr-1">
              {playlistTracks.map((track, index) => {
                const isCurrent = track.trackId === runtime.currentTrack?.trackId;
                const hasPlayed = playedTrackIds.has(track.trackId) && !isCurrent;
                return (
                  <li
                    key={track.trackId}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                      isCurrent
                        ? "bg-brand-green text-white font-semibold"
                        : hasPlayed
                        ? "bg-slate-50 text-slate-400"
                        : "text-slate-700"
                    }`}
                  >
                    <span className={`w-6 text-center text-xs font-bold tabular-nums shrink-0 ${isCurrent ? "text-white/80" : "text-slate-400"}`}>
                      {index + 1}
                    </span>
                    <span className={`truncate ${hasPlayed ? "line-through" : ""}`}>
                      {track.title || "Unknown"}
                      <span className={`font-normal ${isCurrent ? "text-white/80" : "text-slate-400"}`}>
                        {" "}— {track.artist || "Unknown"}
                      </span>
                    </span>
                    {isCurrent && (
                      <span className="ml-auto shrink-0 text-xs bg-white/20 rounded-full px-2 py-0.5">
                        Now playing
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </main>
    </div>
  );
}
