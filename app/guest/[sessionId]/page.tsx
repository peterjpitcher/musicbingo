"use client";
/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { subscribeLiveChannel } from "@/lib/live/channel";
import { getLiveSession } from "@/lib/live/sessionApi";
import { readRuntimeState } from "@/lib/live/storage";
import {
  makeEmptyRuntimeState,
  type LiveRuntimeState,
  type LiveSessionV1,
} from "@/lib/live/types";

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

  const [session, setSession] = useState<LiveSessionV1 | null>(null);
  const [sessionLoading, setSessionLoading] = useState<boolean>(true);
  const sessionLoadedRef = useRef<boolean>(false);

  const error = useMemo(() => {
    if (!sessionId) return "Invalid guest session id.";
    if (!sessionLoading && !session)
      return "Live session not found. Open /host on this device and create or import a session first.";
    return "";
  }, [session, sessionId, sessionLoading]);

  const [runtime, setRuntime] = useState<LiveRuntimeState>(() => {
    if (!sessionId) return makeEmptyRuntimeState("pending");
    return readRuntimeState(sessionId) ?? makeEmptyRuntimeState(sessionId);
  });

  useEffect(() => {
    if (!sessionId || sessionLoadedRef.current) return;
    sessionLoadedRef.current = true;
    let cancelled = false;
    getLiveSession(sessionId)
      .then((loaded) => {
        if (!cancelled) {
          setSession(loaded);
          setSessionLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setSessionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

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
      <div className="guest-projection-shell min-h-screen w-screen text-white flex flex-col items-center justify-center p-8">
        <div className="bg-brand-green/80 border border-brand-gold/60 rounded-3xl p-8 max-w-lg text-center">
          <h1 className="text-2xl font-extrabold uppercase tracking-wide mb-4">
            Guest Display
          </h1>
          <p className="text-red-300 mb-6">{error}</p>
          <Link
            href="/host"
            className="inline-flex items-center justify-center bg-brand-gold text-white rounded-xl px-5 py-2.5 font-bold text-sm"
          >
            Open Host Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const activeGame = runtime.activeGameNumber
    ? session?.games.find((game) => game.gameNumber === runtime.activeGameNumber) ?? null
    : null;

  const showWaiting =
    runtime.mode === "idle" || (!runtime.currentTrack && runtime.mode === "running");
  const showBreak = runtime.mode === "break";
  const showPaused = runtime.mode === "paused";
  const showEnded = runtime.mode === "ended";
  const showRunning = runtime.mode === "running" && Boolean(runtime.currentTrack);

  return (
    <div className="guest-projection-shell min-h-screen w-screen text-white flex flex-col overflow-x-hidden">
      {/* Header */}
      <header className="flex items-center justify-between gap-5 px-6 py-4 border-b border-brand-gold/50 bg-brand-green/90 backdrop-blur-sm">
        <div className="flex items-center gap-3.5">
          <Image
            src="/the-anchor-pub-logo-white-transparent.png"
            alt="The Anchor"
            width={140}
            height={44}
            priority
            className="max-h-11 w-auto object-contain"
          />
          <div>
            <h1 className="m-0 text-xl font-extrabold uppercase tracking-wide text-white leading-tight">
              {session?.name ?? "Music Bingo"}
            </h1>
            <p className="m-0 mt-0.5 text-xs uppercase tracking-widest text-white/70">
              Guest Display
            </p>
          </div>
        </div>
        {!runtime.spotifyControlAvailable ? (
          <div className="rounded-xl bg-amber-800/50 border border-amber-400/60 px-3 py-1.5 text-xs font-semibold text-amber-200">
            Manual host control mode
          </div>
        ) : null}
      </header>

      {/* Main stage */}
      <section className="flex-1 flex items-center justify-center p-7">
        {showWaiting ? (
          <div className="w-[min(980px,95vw)] bg-brand-green/88 border border-brand-gold/70 rounded-3xl p-8 text-center">
            <p className="uppercase tracking-[0.18em] text-white/84 text-[clamp(0.7rem,1.4vw,1.1rem)] m-0">
              Music Bingo Night
            </p>
            <h2 className="mt-2.5 mb-2 uppercase text-[clamp(2rem,6vw,5rem)] font-black text-white">
              Waiting To Start
            </h2>
            <p className="m-0 text-[clamp(1rem,2vw,1.6rem)] text-white/90">
              The host will start Game 1 or Game 2 shortly.
            </p>
          </div>
        ) : null}

        {showBreak ? (
          <div className="w-[min(980px,95vw)] bg-brand-green/88 border border-brand-gold/70 rounded-3xl p-8 text-center">
            <p className="uppercase tracking-[0.18em] text-white/84 text-[clamp(0.7rem,1.4vw,1.1rem)] m-0">
              Break
            </p>
            <h2 className="mt-2.5 mb-2 uppercase text-[clamp(2rem,6vw,5rem)] font-black text-white">
              Interval In Progress
            </h2>
            <p className="m-0 text-[clamp(1rem,2vw,1.6rem)] text-white/90">
              Keep your cards ready. We&apos;ll resume shortly.
            </p>
          </div>
        ) : null}

        {showPaused ? (
          <div className="w-[min(980px,95vw)] bg-brand-green/88 border border-brand-gold/70 rounded-3xl p-8 text-center">
            <p className="uppercase tracking-[0.18em] text-white/84 text-[clamp(0.7rem,1.4vw,1.1rem)] m-0">
              Paused
            </p>
            <h2 className="mt-2.5 mb-2 uppercase text-[clamp(2rem,6vw,5rem)] font-black text-white">
              Playback Paused
            </h2>
            <p className="m-0 text-[clamp(1rem,2vw,1.6rem)] text-white/90">
              Host is paused. We&apos;ll continue in a moment.
            </p>
          </div>
        ) : null}

        {showEnded ? (
          <div className="w-[min(980px,95vw)] bg-brand-green/88 border border-brand-gold/70 rounded-3xl p-8 text-center">
            <p className="uppercase tracking-[0.18em] text-white/84 text-[clamp(0.7rem,1.4vw,1.1rem)] m-0">
              Thanks For Playing
            </p>
            <h2 className="mt-2.5 mb-2 uppercase text-[clamp(2rem,6vw,5rem)] font-black text-white">
              Session Complete
            </h2>
            <p className="m-0 text-[clamp(1rem,2vw,1.6rem)] text-white/90">
              Ask the bar team about the next Music Bingo date.
            </p>
          </div>
        ) : null}

        {showRunning && runtime.currentTrack ? (
          <div className="w-[min(1400px,96vw)] grid grid-cols-1 lg:[grid-template-columns:minmax(260px,560px)_minmax(0,1fr)] gap-7 items-center">
            {/* Album art */}
            <div className="flex items-center justify-center">
              {runtime.revealState.showAlbum ? (
                runtime.currentTrack.albumImageUrl ? (
                  <img
                    src={runtime.currentTrack.albumImageUrl}
                    alt="Album cover"
                    className="w-[min(68vh,88vw)] max-w-[560px] aspect-square rounded-[22px] border-4 border-white/90 shadow-2xl object-cover bg-black"
                  />
                ) : (
                  <div className="w-[min(68vh,88vw)] max-w-[560px] aspect-square rounded-[22px] border-4 border-white/90 flex items-center justify-center text-[clamp(1rem,2vw,1.7rem)] uppercase tracking-[0.08em] bg-brand-green/72">
                    Album Cover
                  </div>
                )
              ) : (
                <div className="w-[min(68vh,88vw)] max-w-[560px] aspect-square rounded-[22px] border-4 border-dashed border-white/50 flex items-center justify-center text-[clamp(1rem,2vw,1.7rem)] uppercase tracking-[0.08em] bg-brand-green/72 opacity-50">
                  Album reveals at 10s
                </div>
              )}
            </div>

            {/* Track metadata */}
            <div className="grid gap-3.5 lg:text-left text-center">
              {runtime.revealState.showTitle ? (
                <h2 className="m-0 text-[clamp(1.6rem,4.5vw,4.2rem)] uppercase font-black tracking-wide text-white">
                  {runtime.currentTrack.title || "Unknown Title"}
                </h2>
              ) : (
                <h2 className="m-0 text-[clamp(1.6rem,4.5vw,4.2rem)] uppercase font-black tracking-wide text-white/50">
                  Title reveals at 20s
                </h2>
              )}

              {runtime.revealState.showArtist ? (
                <p className="m-0 text-[clamp(1.3rem,3vw,2.8rem)] font-bold text-white">
                  {runtime.currentTrack.artist || "Unknown Artist"}
                </p>
              ) : (
                <p className="m-0 text-[clamp(1.3rem,3vw,2.8rem)] font-bold text-white/50">
                  Artist reveals at 25s
                </p>
              )}

              {runtime.revealState.shouldAdvance ? (
                <p className="mt-1.5 text-white/90 text-[clamp(1rem,2vw,1.7rem)] uppercase tracking-[0.05em]">
                  Advancing to next song...
                </p>
              ) : (
                <p className="mt-1.5 text-white/90 text-[clamp(1rem,2vw,1.7rem)] uppercase tracking-[0.05em]">
                  Next song at 30s
                </p>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {/* Footer */}
      <footer className="flex justify-between items-center gap-4 px-6 py-4 border-t border-brand-green-light/60 bg-brand-green/94">
        <div>
          <p className="m-0 text-[clamp(0.85rem,1.4vw,1.2rem)] text-white/92">
            Mode: {runtime.mode.toUpperCase()}
          </p>
          <p className="m-0 text-[clamp(0.85rem,1.4vw,1.2rem)] text-white/92">
            Active:{" "}
            {runtime.activeGameNumber
              ? `Game ${runtime.activeGameNumber}${activeGame ? ` — ${activeGame.theme}` : ""}`
              : "Not started"}
          </p>
        </div>
        <div className="text-right">
          <p className="m-0 text-[clamp(0.85rem,1.4vw,1.2rem)] text-white/92">
            Progress: {formatSeconds(runtime.currentTrack?.progressMs ?? 0)}
          </p>
          <p className="m-0 text-[clamp(0.85rem,1.4vw,1.2rem)] text-white/92">
            Updated: {new Date(runtime.updatedAtMs).toLocaleTimeString()}
          </p>
        </div>
      </footer>
    </div>
  );
}
