"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { publishLiveMessage } from "@/lib/live/channel";
import { computeRevealState, shouldTriggerNextForTrack, updateAdvanceTrackMarker } from "@/lib/live/reveal";
import { getLiveSession } from "@/lib/live/sessionApi";
import {
  acquireControlLock,
  isControlLockStale,
  readControlLock,
  readRuntimeState,
  releaseControlLock,
  updateControlHeartbeat,
  writeRuntimeState,
} from "@/lib/live/storage";
import {
  CHALLENGE_REVEAL_CONFIG,
  LIVE_RUNTIME_VERSION,
  makeEmptyRuntimeState,
  type LiveGameConfig,
  type LiveRuntimeState,
  type LiveSessionV1,
  type LiveTrackSnapshot,
  type RevealConfig,
} from "@/lib/live/types";

/** True if the Spotify track matches the stored challenge song (case-insensitive contains). */
function matchesChallengeSong(
  track: { title: string; artist: string } | null,
  game: LiveGameConfig | null | undefined
): boolean {
  if (!track || !game?.challengeSongTitle || !game?.challengeSongArtist) return false;
  const norm = (s: string) => s.trim().toLowerCase();
  const t = norm(track.title);
  const a = norm(track.artist);
  const ct = norm(game.challengeSongTitle);
  const ca = norm(game.challengeSongArtist);
  return (t.includes(ct) || ct.includes(t)) && (a.includes(ca) || ca.includes(a));
}

function getRevealConfig(
  session: LiveSessionV1,
  activeGameNumber: 1 | 2 | null,
  track: { title: string; artist: string } | null
): RevealConfig {
  const game = activeGameNumber
    ? session.games.find((g) => g.gameNumber === activeGameNumber) ?? null
    : null;
  return matchesChallengeSong(track, game) ? CHALLENGE_REVEAL_CONFIG : session.revealConfig;
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

  const tabIdRef = useRef<string>(makeTabId());
  const runtimeRef = useRef<LiveRuntimeState>(makeEmptyRuntimeState(sessionId || "pending"));
  const pollAbortRef = useRef<AbortController | null>(null);

  const [session, setSession] = useState<LiveSessionV1 | null>(null);
  const [runtime, setRuntime] = useState<LiveRuntimeState>(
    makeEmptyRuntimeState(sessionId || "pending")
  );
  const [notice, setNotice] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isController, setIsController] = useState<boolean>(false);
  const [lockOwnerLabel, setLockOwnerLabel] = useState<string>("");
  const [commandBusy, setCommandBusy] = useState<boolean>(false);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

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
        const isChallengeSong = matchesChallengeSong(track, game);
        const cfg = isChallengeSong ? CHALLENGE_REVEAL_CONFIG : session.revealConfig;
        const revealState = computeRevealState(track?.progressMs ?? 0, cfg);
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
          isChallengeSong,
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
        const initial = persistedRuntime ?? makeEmptyRuntimeState(sessionId);
        setRuntime(initial);
        runtimeRef.current = initial;
        acquireLock(false);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Failed to load session.");
      }
    })();
    return () => {
      cancelled = true;
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
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [isController, sessionId]);

  const pollStatus = useCallback(async () => {
    if (!session) return;
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;
    try {
      const res = await fetch("/api/spotify/live/status", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (res.status === 401) {
        commitRuntime((prev) => ({
          ...prev,
          spotifyControlAvailable: false,
          warningMessage:
            "Spotify is disconnected. Reconnect Spotify on the prep page.",
        }));
        return;
      }
      if (!res.ok) {
        const msg = await res
          .text()
          .catch(() => "Failed to fetch live Spotify status.");
        setError(msg || "Failed to fetch live Spotify status.");
        return;
      }
      const data = (await res.json()) as LiveStatusResponse;
      applyStatusSnapshot(data);

      if (runtimeRef.current.mode !== "running") return;
      const track = normalizeTrackSnapshot(data.playback);
      const cfg = getRevealConfig(session, runtimeRef.current.activeGameNumber, track);
      const revealState = computeRevealState(track?.progressMs ?? 0, cfg);

      if (
        isController &&
        Boolean(data.canControlPlayback) &&
        shouldTriggerNextForTrack({
          trackId: track?.trackId ?? null,
          revealState,
          advanceTriggeredForTrackId: runtimeRef.current.advanceTriggeredForTrackId,
        })
      ) {
        const trackId = track?.trackId ?? null;
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
        setNotice(
          "Manual host control mode active: control playback in Spotify app while this screen drives reveals."
        );
      }
    } catch (err: any) {
      if ((err as Error)?.name === "AbortError") return;
      setError(err?.message ?? "Failed to poll live status.");
    }
  }, [applyStatusSnapshot, commitRuntime, isController, session]);

  useEffect(() => {
    if (!session) return;
    void pollStatus();
    const id = window.setInterval(() => void pollStatus(), 1_000);
    return () => {
      window.clearInterval(id);
      pollAbortRef.current?.abort();
    };
  }, [pollStatus, session]);

  const sendCommand = useCallback(
    async (
      action: "play_game" | "pause" | "resume" | "next" | "previous" | "seek" | "play_break" | "resume_from_track",
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
          commitRuntime((prev) => ({
            ...prev,
            spotifyControlAvailable: false,
            warningMessage:
              "Spotify is disconnected. Reconnect Spotify on the prep page.",
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
      }));
      setNotice(`Started Game ${gameNumber}: ${game.theme}`);
    } else {
      commitRuntime((prev) => ({
        ...prev,
        mode: "running",
        activeGameNumber: gameNumber,
        spotifyControlAvailable: false,
        warningMessage: prev.warningMessage || "Manual host control mode active.",
      }));
      setNotice(
        "Spotify control unavailable. Continue in manual host control mode."
      );
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

  const isChallenge = matchesChallengeSong(runtime.currentTrack, activeGame);

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
        {notice ? <Notice variant="success">{notice}</Notice> : null}
        {error ? <Notice variant="error">{error}</Notice> : null}
        {runtime.warningMessage ? (
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
              <Button
                variant="primary"
                size="sm"
                disabled={!isController || commandBusy}
                onClick={() => void startGame(1)}
              >
                Start Game 1
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!isController || commandBusy}
                onClick={() => void startGame(2)}
              >
                Start Game 2
              </Button>
            </div>

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
                variant="secondary"
                size="sm"
                disabled={!isController || commandBusy}
                onClick={resumeFromBreak}
              >
                Resume Display
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
            <p className="text-sm text-slate-500 mb-1">
              Current track:{" "}
              <strong className="text-slate-700">
                {runtime.currentTrack?.title
                  ? `${runtime.currentTrack.title} — ${runtime.currentTrack.artist}`
                  : "No track detected"}
              </strong>
              {isChallenge && (
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 border border-brand-gold px-2 py-0.5 text-xs font-bold text-amber-800">
                  CHALLENGE SONG — 60s
                </span>
              )}
            </p>
            <p className="text-sm text-slate-500 mb-4">
              Progress:{" "}
              <strong className="text-slate-700">
                {Math.floor((runtime.currentTrack?.progressMs ?? 0) / 1000)}s
              </strong>
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge active={runtime.revealState.showAlbum}>Album @10s</Badge>
              <Badge active={runtime.revealState.showTitle}>Title @20s</Badge>
              <Badge active={runtime.revealState.showArtist}>Artist @25s</Badge>
              <Badge active={runtime.revealState.shouldAdvance}>
                {isChallenge ? "Next @90s" : "Next @30s"}
              </Badge>
            </div>
            {activeGame?.challengeSongTitle ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 mb-3">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">
                  Challenge Song — Game {activeGame.gameNumber}
                </p>
                <p className="text-sm font-semibold text-amber-900">
                  {activeGame.challengeSongArtist} — {activeGame.challengeSongTitle}
                </p>
                <p className="text-xs text-amber-600 mt-0.5">Plays for 90s instead of 30s</p>
              </div>
            ) : null}
            <p className="text-xs text-slate-400">
              Guest screen:{" "}
              <Link
                href={`/guest/${sessionId}`}
                target="_blank"
                className="underline underline-offset-2"
              >
                /guest/{sessionId}
              </Link>
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
