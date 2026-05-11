"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { subscribeLiveChannel } from "@/lib/live/channel";
import { getLiveSession } from "@/lib/live/sessionApi";
import { readRuntimeState, validateRuntimeState } from "@/lib/live/storage";
import {
  CHALLENGE_REVEAL_CONFIG,
  DEFAULT_REVEAL_CONFIG,
  makeEmptyRuntimeState,
  type LiveRuntimeState,
  type LiveSessionV1,
  type RevealConfig,
} from "@/lib/live/types";
import { computeRevealState } from "@/lib/live/reveal";
import { useWakeLock } from "@/hooks/useWakeLock";
import { BrandProvider } from "@/components/brand/BrandProvider";
import type { BrandConfig } from "@/lib/brands/types";

function formatSeconds(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
  return `${Math.floor(safeMs / 1000)}s`;
}

/**
 * Interpolates progressMs locally between server updates so the UI ticks
 * smoothly every second rather than jumping every 2s when a new poll arrives.
 * Stores the server-provided anchor point and a local tick counter.
 */
function useInterpolatedProgress(runtime: LiveRuntimeState): number {
  const serverProgress = runtime.currentTrack?.progressMs ?? 0;
  const isPlaying = runtime.currentTrack?.isPlaying ?? false;
  const trackId = runtime.currentTrack?.trackId ?? null;
  const updatedAt = runtime.updatedAtMs;

  // Anchor: the last known server state. Memoised so it only recalculates
  // when the server actually sends new data (trackId or updatedAt changes).
  const anchor = useMemo(
    () => ({ progress: serverProgress, updatedAt, trackId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updatedAt, trackId]
  );

  // Tick counter to drive re-renders every second.
  // Synchronous reset on anchor change prevents stale-tick flash during track transitions.
  const [tick, setTick] = useState(0);
  const [lastAnchor, setLastAnchor] = useState(anchor);
  if (anchor !== lastAnchor) {
    setLastAnchor(anchor);
    setTick(0);
  }

  useEffect(() => {
    if (!isPlaying || !trackId) return;
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isPlaying, trackId, anchor]);

  if (!isPlaying) return anchor.progress;
  return anchor.progress + tick * 1000;
}

export default function GuestDisplayPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = useMemo(
    () => (typeof params?.sessionId === "string" ? params.sessionId : ""),
    [params?.sessionId]
  );

  useWakeLock();

  const [session, setSession] = useState<LiveSessionV1 | null>(null);
  const [sessionLoading, setSessionLoading] = useState<boolean>(true);
  const sessionLoadedRef = useRef<boolean>(false);
  const [brand, setBrand] = useState<BrandConfig | null>(null);
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
          // Fetch the brand config from the full session API response
          if (loaded) {
            fetch(`/api/sessions/${encodeURIComponent(sessionId)}`)
              .then((res) => res.ok ? res.json() : null)
              .then((data) => { if (data?.brand && !cancelled) setBrand(data.brand); })
              .catch(() => {});
          }
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
      if (message.type === "brand_update") {
        setBrand(message.brand);
      }
    });
    const id = window.setInterval(() => {
      const persisted = readRuntimeState(sessionId);
      if (persisted) setRuntime((prev) => persisted.updatedAtMs > prev.updatedAtMs ? persisted : prev);
    }, 2_000);
    return () => {
      unsubscribe();
      window.clearInterval(id);
    };
  }, [sessionId]);

  // Cross-device sync: poll server-side runtime state every 2s so guests on
  // a different device (e.g. laptop) receive updates from the host's phone.
  useEffect(() => {
    if (!sessionId) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/runtime`, { cache: "no-store" });
        if (res.ok) {
          const data: unknown = await res.json();
          const validated = validateRuntimeState(data);
          if (validated) setRuntime((prev) => validated.updatedAtMs > prev.updatedAtMs ? validated : prev);
        }
      } catch {
        // best-effort — local state remains until next successful poll
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 2_000);
    return () => window.clearInterval(id);
  }, [sessionId]);

  const interpolatedProgress = useInterpolatedProgress(runtime);

  if (sessionLoading) {
    return (
      <BrandProvider brand={brand}>
        <div className="guest-projection-shell min-h-screen w-screen text-white flex flex-col items-center justify-center p-8">
          <div className="bg-brand-green/80 border border-brand-gold/60 rounded-3xl p-8 max-w-lg text-center">
            <p className="text-white/80 text-lg animate-pulse">Loading session…</p>
          </div>
        </div>
      </BrandProvider>
    );
  }

  if (error) {
    return (
      <BrandProvider brand={brand}>
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
      </BrandProvider>
    );
  }

  const activeGame = runtime.activeGameNumber
    ? session?.games.find((game) => game.gameNumber === runtime.activeGameNumber) ?? null
    : null;

  const effectiveCfg: RevealConfig = runtime.isChallengeSong
    ? CHALLENGE_REVEAL_CONFIG
    : (session?.revealConfig ?? DEFAULT_REVEAL_CONFIG);

  // Include host-side extensions in the config so guest matches host timing
  const effectiveNextCfg: RevealConfig = runtime.extensionMs > 0
    ? { ...effectiveCfg, nextMs: effectiveCfg.nextMs + runtime.extensionMs }
    : effectiveCfg;

  // Use locally interpolated progress for smooth reveal transitions
  const localRevealState = (runtime.isIntroSong || runtime.freePlay)
    ? { showAlbum: true, showTitle: true, showArtist: true, shouldAdvance: false }
    : computeRevealState(interpolatedProgress, effectiveNextCfg);

  const showWaiting =
    runtime.mode === "idle" || (!runtime.currentTrack && runtime.mode === "running");
  const showBreak = runtime.mode === "break";
  const showPaused = runtime.mode === "paused";
  const showEnded = runtime.mode === "ended";
  const showRunning = runtime.mode === "running" && Boolean(runtime.currentTrack);

  return (
    <BrandProvider brand={brand}>
    <div className="guest-projection-shell min-h-screen w-screen text-white flex flex-col overflow-x-hidden">
      {/* Header */}
      <header className="flex items-center justify-between gap-5 px-6 py-4 border-b border-brand-gold/50 bg-brand-green/90 backdrop-blur-sm">
        <div className="flex items-center gap-3.5">
          <img
            src={brand?.logo_dark_url ?? "/the-anchor-pub-logo-white-transparent.png"}
            alt={brand?.name ?? "Logo"}
            width={140}
            height={44}
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
              Keep your cards ready — we&apos;ll resume shortly.
            </p>
            {brand?.break_message ? (
              <p className="mt-4 text-[clamp(1rem,2vw,1.5rem)] text-brand-gold font-semibold">
                {brand.break_message}
              </p>
            ) : null}
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
              That&apos;s A Wrap!
            </p>
            <h2 className="mt-2.5 mb-2 uppercase text-[clamp(2rem,6vw,5rem)] font-black text-white">
              Thanks For Playing
            </h2>
            <p className="m-0 text-[clamp(1rem,2vw,1.6rem)] text-white/90">
              We hope you had a great time!
            </p>
            {brand?.end_message ? (
              <div className="mt-6">
                <p className="text-[clamp(1rem,2vw,1.5rem)] text-brand-gold font-semibold">
                  {brand.end_message}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {showRunning && runtime.currentTrack ? (
          <div className="w-[min(1400px,96vw)] flex flex-col gap-5">
            {/* Intro layout takes priority over challenge banner */}
            {runtime.isIntroSong ? (
              activeGame?.gameNumber === 2 ? (
                /* ── Sing Along intro (Game 2) ── */
                <div className="w-full flex flex-col items-center gap-6">
                  <div className="w-full bg-brand-gold/90 border-2 border-white/60 rounded-2xl py-5 px-8 text-center">
                    <p className="m-0 uppercase tracking-[0.2em] text-white/80 text-[clamp(0.7rem,1.4vw,1rem)]">
                      Get Ready for Game 2
                    </p>
                    <h2 className="m-0 mt-1 uppercase font-black text-white text-[clamp(2rem,5vw,4.5rem)] leading-none tracking-wide">
                      Sing Along!
                    </h2>
                  </div>

                  {/* Song title EXTRA LARGE - the main focus */}
                  <div className="text-center">
                    <h3 className="m-0 text-[clamp(2rem,5vw,5rem)] uppercase font-black tracking-wide text-white">
                      {runtime.currentTrack.title}
                    </h3>
                    <p className="m-0 mt-2 text-[clamp(1.2rem,2.5vw,2.2rem)] text-white/80 uppercase tracking-wide">
                      {runtime.currentTrack.artist}
                    </p>
                  </div>

                  {/* Album art - secondary, smaller */}
                  {runtime.currentTrack.albumImageUrl && (
                    <img
                      src={runtime.currentTrack.albumImageUrl}
                      alt="Album cover"
                      className="w-[min(35vh,50vw)] max-w-[320px] aspect-square rounded-[18px] border-3 border-white/70 shadow-xl object-cover bg-black"
                    />
                  )}
                </div>
              ) : (
                /* ── Dance Along intro (Game 1, default) ── */
                <div className="w-full flex flex-col items-center gap-6">
                  <div className="w-full bg-brand-gold/90 border-2 border-white/60 rounded-2xl py-5 px-8 text-center">
                    <p className="m-0 uppercase tracking-[0.2em] text-white/80 text-[clamp(0.7rem,1.4vw,1rem)]">
                      Get Ready for Game 1
                    </p>
                    <h2 className="m-0 mt-1 uppercase font-black text-white text-[clamp(2rem,5vw,4.5rem)] leading-none tracking-wide">
                      Dance Along!
                    </h2>
                  </div>

                  {/* Large album art */}
                  {runtime.currentTrack.albumImageUrl && (
                    <img
                      src={runtime.currentTrack.albumImageUrl}
                      alt="Album cover"
                      className="w-[min(60vh,80vw)] max-w-[500px] aspect-square rounded-[22px] border-4 border-white/90 shadow-2xl object-cover bg-black"
                    />
                  )}

                  {/* Song info - shown immediately, no reveal phases */}
                  <div className="text-center">
                    <h3 className="m-0 text-[clamp(1.4rem,3.5vw,3rem)] uppercase font-black tracking-wide text-white">
                      {runtime.currentTrack.title}
                    </h3>
                    <p className="m-0 mt-1 text-[clamp(1rem,2vw,1.8rem)] text-white/80 uppercase tracking-wide">
                      {runtime.currentTrack.artist}
                    </p>
                  </div>
                </div>
              )
            ) : runtime.isChallengeSong ? (
              /* ── Challenge banner (non-intro) ── */
              <div className="w-full bg-brand-gold/90 border-2 border-white/60 rounded-2xl py-4 px-6 text-center">
                <p className="m-0 uppercase tracking-[0.2em] text-white/80 text-[clamp(0.65rem,1.2vw,0.9rem)]">
                  {runtime.challengeType === 'dance-along' ? "Dancing Challenge" : "Sing-Along Challenge"}
                </p>
                <h2 className="m-0 mt-1 uppercase font-black text-white text-[clamp(1.6rem,4vw,3.5rem)] leading-none tracking-wide">
                  {runtime.challengeType === 'dance-along' ? "Get Up and Dance!" : "Sing Along!"}
                </h2>
              </div>
            ) : null}

            {/* Normal running layout (album art + metadata grid) — hidden during intro */}
            {!runtime.isIntroSong && (
          <div className="grid grid-cols-1 lg:[grid-template-columns:minmax(260px,560px)_minmax(0,1fr)] gap-7 items-center">
            {/* Album art */}
            <div className="flex items-center justify-center">
              {(runtime.isIntroSong || runtime.freePlay || localRevealState.showAlbum) ? (
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
                  Album reveals at {Math.floor(effectiveCfg.albumMs / 1000)}s
                </div>
              )}
            </div>

            {/* Track metadata */}
            <div className="grid gap-3.5 lg:text-left text-center">
              {(runtime.isIntroSong || runtime.freePlay || localRevealState.showTitle) ? (
                <h2 className="m-0 text-[clamp(1.6rem,4.5vw,4.2rem)] uppercase font-black tracking-wide text-white">
                  {runtime.currentTrack.title || "Unknown Title"}
                </h2>
              ) : (
                <h2 className="m-0 text-[clamp(1.6rem,4.5vw,4.2rem)] uppercase font-black tracking-wide text-white/75">
                  Title reveals at {Math.floor(effectiveCfg.titleMs / 1000)}s
                </h2>
              )}

              {(runtime.isIntroSong || runtime.freePlay || localRevealState.showArtist) ? (
                <p className="m-0 text-[clamp(1.3rem,3vw,2.8rem)] font-bold text-white">
                  {runtime.currentTrack.artist || "Unknown Artist"}
                </p>
              ) : (
                <p className="m-0 text-[clamp(1.3rem,3vw,2.8rem)] font-bold text-white/75">
                  Artist reveals at {Math.floor(effectiveCfg.artistMs / 1000)}s
                </p>
              )}

              {runtime.freePlay ? (
                <p className="mt-1.5 text-white/70 text-[clamp(1rem,2vw,1.7rem)] uppercase tracking-[0.05em]">
                  Free Play
                </p>
              ) : localRevealState.shouldAdvance ? (
                <p className="mt-1.5 text-white/90 text-[clamp(1rem,2vw,1.7rem)] uppercase tracking-[0.05em]">
                  Advancing to next song...
                </p>
              ) : (
                <p className="mt-1.5 text-white/90 text-[clamp(1rem,2vw,1.7rem)] uppercase tracking-[0.05em]">
                  Next song at {Math.floor((effectiveCfg.nextMs + runtime.extensionMs) / 1000)}s
                </p>
              )}
            </div>
          </div>
            )}
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
            Progress: {formatSeconds(interpolatedProgress)}
          </p>
        </div>
      </footer>
    </div>
    </BrandProvider>
  );
}
