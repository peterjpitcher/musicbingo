"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { publishLiveMessage } from "@/lib/live/channel";
import { computeRevealState, shouldTriggerNextForTrack, updateAdvanceTrackMarker } from "@/lib/live/reveal";
import {
  acquireControlLock,
  getLiveSession,
  isControlLockStale,
  readControlLock,
  readRuntimeState,
  releaseControlLock,
  updateControlHeartbeat,
  writeRuntimeState,
} from "@/lib/live/storage";
import {
  LIVE_RUNTIME_VERSION,
  makeEmptyRuntimeState,
  type LiveRuntimeState,
  type LiveSessionV1,
  type LiveTrackSnapshot,
} from "@/lib/live/types";

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

function normalizeTrackSnapshot(playback: LiveStatusResponse["playback"]): LiveTrackSnapshot | null {
  if (!playback || typeof playback !== "object") return null;
  return {
    trackId: typeof playback.trackId === "string" ? playback.trackId : null,
    title: typeof playback.title === "string" ? playback.title : "",
    artist: typeof playback.artist === "string" ? playback.artist : "",
    albumImageUrl: typeof playback.albumImageUrl === "string" ? playback.albumImageUrl : null,
    progressMs: typeof playback.progressMs === "number" && Number.isFinite(playback.progressMs) ? playback.progressMs : 0,
    durationMs: typeof playback.durationMs === "number" && Number.isFinite(playback.durationMs) ? playback.durationMs : 0,
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
  const [runtime, setRuntime] = useState<LiveRuntimeState>(makeEmptyRuntimeState(sessionId || "pending"));
  const [notice, setNotice] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isController, setIsController] = useState<boolean>(false);
  const [lockOwnerLabel, setLockOwnerLabel] = useState<string>("");
  const [commandBusy, setCommandBusy] = useState<boolean>(false);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  const persistAndBroadcastRuntime = useCallback((next: LiveRuntimeState) => {
    if (!sessionId) return;
    writeRuntimeState(sessionId, next);
    publishLiveMessage(sessionId, { type: "runtime_update", runtime: next });
  }, [sessionId]);

  const commitRuntime = useCallback((updater: LiveRuntimeState | ((prev: LiveRuntimeState) => LiveRuntimeState)) => {
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
  }, [persistAndBroadcastRuntime, sessionId]);

  const applyStatusSnapshot = useCallback((payload: LiveStatusResponse, opts?: { mode?: LiveRuntimeState["mode"] }) => {
    if (!session) return;

    const warnings = normalizeWarnings(payload.warnings);
    const track = normalizeTrackSnapshot(payload.playback);
    const revealState = computeRevealState(track?.progressMs ?? 0, session.revealConfig);

    commitRuntime((prev) => {
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
        advanceTriggeredForTrackId: marker,
        warningMessage: warnings[0] ?? (payload.error?.message ?? null),
      };
    });
  }, [commitRuntime, session]);

  const acquireLock = useCallback((force = false) => {
    if (!sessionId) return false;
    const attempt = acquireControlLock({
      sessionId,
      tabId: tabIdRef.current,
      force,
    });

    setIsController(attempt.acquired);
    if (!attempt.acquired && attempt.lock) {
      const stale = isControlLockStale(attempt.lock);
      setLockOwnerLabel(stale ? "Another tab may have stale control." : "Another host tab controls this session.");
    } else {
      setLockOwnerLabel("");
    }

    return attempt.acquired;
  }, [sessionId]);

  useEffect(() => {
    const tabId = tabIdRef.current;
    if (!sessionId) {
      setError("Invalid session id.");
      return;
    }

    const loaded = getLiveSession(sessionId);
    if (!loaded) {
      setError("Live session not found. Open /host and create/import a session first.");
      return;
    }

    setSession(loaded);
    setError("");

    const persistedRuntime = readRuntimeState(sessionId);
    const initial = persistedRuntime ?? makeEmptyRuntimeState(sessionId);
    setRuntime(initial);
    runtimeRef.current = initial;

    acquireLock(false);

    return () => {
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

    return () => {
      window.clearInterval(interval);
    };
  }, [isController, sessionId]);

  const pollStatus = useCallback(async () => {
    if (!session) return;

    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;

    try {
      const res = await fetch("/api/spotify/live/status", { cache: "no-store", signal: controller.signal });
      if (res.status === 401) {
        commitRuntime((prev) => ({
          ...prev,
          spotifyControlAvailable: false,
          warningMessage: "Spotify is disconnected. Reconnect Spotify on the prep page.",
        }));
        return;
      }

      if (!res.ok) {
        const msg = await res.text().catch(() => "Failed to fetch live Spotify status.");
        setError(msg || "Failed to fetch live Spotify status.");
        return;
      }

      const data = (await res.json()) as LiveStatusResponse;
      applyStatusSnapshot(data);

      if (runtimeRef.current.mode !== "running") return;

      const track = normalizeTrackSnapshot(data.playback);
      const revealState = computeRevealState(track?.progressMs ?? 0, session.revealConfig);

      if (
        isController
        && Boolean(data.canControlPlayback)
        && shouldTriggerNextForTrack({
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
          const nextError = await nextRes.text().catch(() => "Failed to advance to next song.");
          setError(nextError || "Failed to advance to next song.");
        }
      }

      if (!data.canControlPlayback && !runtimeRef.current.warningMessage) {
        setNotice("Manual host control mode active: control playback in Spotify app while this screen drives reveals.");
      }
    } catch (err: any) {
      if ((err as Error)?.name === "AbortError") return;
      setError(err?.message ?? "Failed to poll live status.");
    }
  }, [applyStatusSnapshot, commitRuntime, isController, session]);

  useEffect(() => {
    if (!session) return;

    void pollStatus();
    const id = window.setInterval(() => {
      void pollStatus();
    }, 1_000);

    return () => {
      window.clearInterval(id);
      pollAbortRef.current?.abort();
    };
  }, [pollStatus, session]);

  const sendCommand = useCallback(async (
    action: "play_game" | "pause" | "resume" | "next" | "previous" | "seek",
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
          warningMessage: "Spotify is disconnected. Reconnect Spotify on the prep page.",
        }));
        return false;
      }

      const data = (await res.json().catch(() => null)) as LiveCommandResponse | null;
      if (!res.ok || !data) {
        const msg = typeof data?.error?.message === "string" ? data.error.message : "Live command failed.";
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
  }, [applyStatusSnapshot, commitRuntime]);

  async function startGame(gameNumber: 1 | 2) {
    if (!session || !isController) return;

    const game = session.games.find((item) => item.gameNumber === gameNumber);
    if (!game) {
      setError(`Game ${gameNumber} playlist not found in this session.`);
      return;
    }

    setNotice("");
    const ok = await sendCommand("play_game", { playlistId: game.playlistId }, { modeOnSuccess: "running" });
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
      setNotice("Spotify control unavailable. Continue in manual host control mode.");
    }
  }

  function openGuestDisplay() {
    if (!sessionId) return;
    window.open(`/guest/${sessionId}`, "music_bingo_guest", "noopener,noreferrer");
  }

  if (error && !session) {
    return (
      <div className="music-live-shell">
        <section className="music-live-content">
          <div className="music-live-card">
            <h1 className="music-live-card-title">Live Host Controller</h1>
            <p className="music-live-error">{error}</p>
            <div className="music-live-row-actions">
              <Link href="/host" className="music-live-primary-btn">Back to Host Dashboard</Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const activeGameTheme = runtime.activeGameNumber
    ? session?.games.find((game) => game.gameNumber === runtime.activeGameNumber)?.theme ?? ""
    : "";

  return (
    <div className="music-live-shell">
      <header className="music-live-header">
        <div className="music-live-header-left">
          <Image
            src="/the-anchor-pub-logo-white-transparent.png"
            alt="The Anchor"
            className="music-live-logo"
            width={160}
            height={50}
            priority
          />
          <div>
            <h1 className="music-live-title">{session?.name ?? "Live Host"}</h1>
            <p className="music-live-subtitle">Host Controller</p>
          </div>
        </div>
        <div className="music-live-header-actions">
          <button type="button" className="music-live-secondary-btn" onClick={openGuestDisplay}>
            Open Guest Screen
          </button>
          <Link href="/host" className="music-live-secondary-btn">Back to Sessions</Link>
        </div>
      </header>

      <section className="music-live-content">
        {notice ? <div className="music-live-notice">{notice}</div> : null}
        {error ? <div className="music-live-error">{error}</div> : null}
        {runtime.warningMessage ? <div className="music-live-warning">{runtime.warningMessage}</div> : null}

        {!isController ? (
          <div className="music-live-card" style={{ marginBottom: 16 }}>
            <h2 className="music-live-card-title">Read-only mode</h2>
            <p className="music-live-muted">{lockOwnerLabel || "Another host tab may be in control."}</p>
            <div className="music-live-row-actions">
              <button
                type="button"
                className="music-live-primary-btn"
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
              </button>
            </div>
          </div>
        ) : null}

        <div className="music-live-grid">
          <article className="music-live-card">
            <h2 className="music-live-card-title">Game Control</h2>
            <p className="music-live-muted">Mode: <strong>{runtime.mode.toUpperCase()}</strong></p>
            <p className="music-live-muted">Active game: {runtime.activeGameNumber ? `Game ${runtime.activeGameNumber} (${activeGameTheme})` : "None"}</p>
            <div className="music-live-row-actions">
              <button type="button" className="music-live-primary-btn" disabled={!isController || commandBusy} onClick={() => void startGame(1)}>
                Start Game 1
              </button>
              <button type="button" className="music-live-primary-btn" disabled={!isController || commandBusy} onClick={() => void startGame(2)}>
                Start Game 2
              </button>
            </div>
            <div className="music-live-row-actions">
              <button
                type="button"
                className="music-live-secondary-btn"
                disabled={!isController || commandBusy}
                onClick={() => void sendCommand(runtime.currentTrack?.isPlaying ? "pause" : "resume", undefined, {
                  modeOnSuccess: runtime.currentTrack?.isPlaying ? "paused" : "running",
                })}
              >
                {runtime.currentTrack?.isPlaying ? "Pause" : "Resume"}
              </button>
              <button type="button" className="music-live-secondary-btn" disabled={!isController || commandBusy} onClick={() => void sendCommand("previous")}>
                Previous
              </button>
              <button type="button" className="music-live-secondary-btn" disabled={!isController || commandBusy} onClick={() => void sendCommand("next")}>
                Next
              </button>
              <button type="button" className="music-live-secondary-btn" disabled={commandBusy} onClick={() => void pollStatus()}>
                Resync State
              </button>
            </div>
            <div className="music-live-row-actions">
              <button
                type="button"
                className="music-live-secondary-btn"
                onClick={() => commitRuntime((prev) => ({ ...prev, mode: "break" }))}
              >
                Show Break Screen
              </button>
              <button
                type="button"
                className="music-live-secondary-btn"
                onClick={() => commitRuntime((prev) => ({ ...prev, mode: "running" }))}
              >
                Resume Display
              </button>
              <button
                type="button"
                className="music-live-danger-btn"
                onClick={() => commitRuntime((prev) => ({ ...prev, mode: "ended" }))}
              >
                End Session Screen
              </button>
            </div>
          </article>

          <article className="music-live-card">
            <h2 className="music-live-card-title">Track + Reveal</h2>
            <p className="music-live-muted">
              Spotify API control: {runtime.spotifyControlAvailable ? "Available" : "Manual host control mode"}
            </p>
            <p className="music-live-muted">
              Current track: {runtime.currentTrack?.title ? `${runtime.currentTrack.title} - ${runtime.currentTrack.artist}` : "No track detected"}
            </p>
            <p className="music-live-muted">
              Progress: {Math.floor((runtime.currentTrack?.progressMs ?? 0) / 1000)}s
            </p>
            <div className="music-live-tag-row">
              <span className={`music-live-tag ${runtime.revealState.showAlbum ? "music-live-tag-active" : ""}`}>Album @10s</span>
              <span className={`music-live-tag ${runtime.revealState.showTitle ? "music-live-tag-active" : ""}`}>Title @20s</span>
              <span className={`music-live-tag ${runtime.revealState.showArtist ? "music-live-tag-active" : ""}`}>Artist @25s</span>
              <span className={`music-live-tag ${runtime.revealState.shouldAdvance ? "music-live-tag-active" : ""}`}>Next @30s</span>
            </div>
            <p className="music-live-muted" style={{ marginTop: 12 }}>
              Guest screen: <code>/guest/{sessionId}</code>
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
