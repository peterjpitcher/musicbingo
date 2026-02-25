"use client";
/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { subscribeLiveChannel } from "@/lib/live/channel";
import { getLiveSession, readRuntimeState } from "@/lib/live/storage";
import { makeEmptyRuntimeState, type LiveRuntimeState, type LiveSessionV1 } from "@/lib/live/types";

function formatSeconds(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
  return `${Math.floor(safeMs / 1000)}s`;
}

export default function GuestDisplayPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = useMemo(
    () => (typeof params?.sessionId === "string" ? params.sessionId : ""),
    [params?.sessionId]
  );

  const session: LiveSessionV1 | null = useMemo(
    () => (sessionId ? getLiveSession(sessionId) : null),
    [sessionId]
  );
  const error = useMemo(() => {
    if (!sessionId) return "Invalid guest session id.";
    if (!session) return "Live session not found. The guest display only works in the same browser as the host — it uses browser storage, not a network connection. Open /host on this device and create or import a session first.";
    return "";
  }, [session, sessionId]);
  const [runtime, setRuntime] = useState<LiveRuntimeState>(() => {
    if (!sessionId) return makeEmptyRuntimeState("pending");
    return readRuntimeState(sessionId) ?? makeEmptyRuntimeState(sessionId);
  });

  useEffect(() => {
    if (!sessionId) return;

    const unsubscribe = subscribeLiveChannel(sessionId, (message) => {
      if (message.type === "runtime_update") {
        setRuntime(message.runtime);
      }
    });

    const id = window.setInterval(() => {
      const persisted = readRuntimeState(sessionId);
      if (persisted) setRuntime(persisted);
    }, 2_000);

    return () => {
      unsubscribe();
      window.clearInterval(id);
    };
  }, [sessionId]);

  if (error) {
    return (
      <div className="music-live-shell">
        <section className="music-live-content">
          <div className="music-live-card">
            <h1 className="music-live-card-title">Guest Display</h1>
            <p className="music-live-error">{error}</p>
            <div className="music-live-row-actions">
              <Link href="/host" className="music-live-primary-btn">Open Host Dashboard</Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const activeGame = runtime.activeGameNumber
    ? session?.games.find((game) => game.gameNumber === runtime.activeGameNumber) ?? null
    : null;

  const showWaiting = runtime.mode === "idle" || (!runtime.currentTrack && runtime.mode === "running");
  const showBreak = runtime.mode === "break";
  const showPaused = runtime.mode === "paused";
  const showEnded = runtime.mode === "ended";
  const showRunning = runtime.mode === "running" && Boolean(runtime.currentTrack);

  return (
    <div className="music-live-shell music-live-guest-shell">
      <header className="music-live-header music-live-guest-header">
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
            <h1 className="music-live-title">{session?.name ?? "Music Bingo"}</h1>
            <p className="music-live-subtitle">Guest Display</p>
          </div>
        </div>
        {!runtime.spotifyControlAvailable ? (
          <div className="music-live-warning">Manual host control mode</div>
        ) : null}
      </header>

      <section className="music-live-guest-main">
        {showWaiting ? (
          <div className="music-live-stage-card">
            <p className="music-live-stage-kicker">Music Bingo Night</p>
            <h2 className="music-live-stage-title">Waiting To Start</h2>
            <p className="music-live-stage-text">The host will start Game 1 or Game 2 shortly.</p>
          </div>
        ) : null}

        {showBreak ? (
          <div className="music-live-stage-card">
            <p className="music-live-stage-kicker">Break</p>
            <h2 className="music-live-stage-title">Interval In Progress</h2>
            <p className="music-live-stage-text">Keep your cards ready. We’ll resume shortly.</p>
          </div>
        ) : null}

        {showPaused ? (
          <div className="music-live-stage-card">
            <p className="music-live-stage-kicker">Paused</p>
            <h2 className="music-live-stage-title">Playback Paused</h2>
            <p className="music-live-stage-text">Host is paused. We’ll continue in a moment.</p>
          </div>
        ) : null}

        {showEnded ? (
          <div className="music-live-stage-card">
            <p className="music-live-stage-kicker">Thanks For Playing</p>
            <h2 className="music-live-stage-title">Session Complete</h2>
            <p className="music-live-stage-text">Ask the bar team about the next Music Bingo date.</p>
          </div>
        ) : null}

        {showRunning && runtime.currentTrack ? (
          <div className="music-live-track-layout">
            <div className="music-live-album-wrap">
              {runtime.revealState.showAlbum ? (
                runtime.currentTrack.albumImageUrl ? (
                  <img
                    src={runtime.currentTrack.albumImageUrl}
                    alt="Album cover"
                    className="music-live-album-art"
                  />
                ) : (
                  <div className="music-live-album-placeholder">Album Cover</div>
                )
              ) : (
                <div className="music-live-album-placeholder music-live-album-hidden">Album reveals at 10s</div>
              )}
            </div>

            <div className="music-live-track-meta">
              {runtime.revealState.showTitle ? (
                <h2 className="music-live-track-title">{runtime.currentTrack.title || "Unknown Title"}</h2>
              ) : (
                <h2 className="music-live-track-title music-live-muted-text">Title reveals at 20s</h2>
              )}

              {runtime.revealState.showArtist ? (
                <p className="music-live-track-artist">{runtime.currentTrack.artist || "Unknown Artist"}</p>
              ) : (
                <p className="music-live-track-artist music-live-muted-text">Artist reveals at 25s</p>
              )}

              {runtime.revealState.shouldAdvance ? (
                <p className="music-live-track-next">Advancing to next song...</p>
              ) : (
                <p className="music-live-track-next">Next song at 30s</p>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <footer className="music-live-guest-footer">
        <div>
          <p className="music-live-footer-line">Mode: {runtime.mode.toUpperCase()}</p>
          <p className="music-live-footer-line">
            Active: {runtime.activeGameNumber ? `Game ${runtime.activeGameNumber}${activeGame ? ` - ${activeGame.theme}` : ""}` : "Not started"}
          </p>
          <p className="music-live-footer-line" style={{ opacity: 0.5 }}>
            Must be open in the same browser as the host
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p className="music-live-footer-line">
            Progress: {formatSeconds(runtime.currentTrack?.progressMs ?? 0)}
          </p>
          <p className="music-live-footer-line">Updated: {new Date(runtime.updatedAtMs).toLocaleTimeString()}</p>
        </div>
      </footer>
    </div>
  );
}
