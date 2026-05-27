"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { matchChallengeSong } from "@/lib/live/challenge";
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

  const localChallengeType = matchChallengeSong(runtime.currentTrack, activeGame);
  const isChallenge = runtime.isChallengeSong || localChallengeType !== null;
  const challengeType = runtime.challengeType ?? localChallengeType;

  const effectiveCfg: RevealConfig = isChallenge
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
  const challengeActive = showRunning && !runtime.isIntroSong && isChallenge;

  return (
    <BrandProvider brand={brand}>
    <div
      className={[
        "guest-projection-shell h-dvh min-h-screen w-screen text-white flex flex-col overflow-hidden",
        challengeActive ? "challenge-projection-shell" : "",
      ].join(" ")}
    >
      {/* Header */}
      <header
        className={[
          "shrink-0 flex items-center justify-between gap-4 px-4 py-2.5 border-b backdrop-blur-sm",
          challengeActive
            ? "border-yellow-200/60 bg-amber-800/90"
            : "border-brand-gold/50 bg-brand-green/90",
        ].join(" ")}
      >
        <div className="flex items-center gap-3.5">
          <img
            src={brand?.logo_dark_url ?? "/the-anchor-pub-logo-white-transparent.png"}
            alt={brand?.name ?? "Logo"}
            width={140}
            height={44}
            className="max-h-10 w-auto object-contain"
          />
          <div>
            <h1 className="m-0 text-[clamp(1rem,1.8vw,1.6rem)] font-extrabold uppercase tracking-wide text-white leading-tight">
              {session?.name ?? "Music Bingo"}
            </h1>
            <p className="m-0 text-[clamp(0.62rem,0.9vw,0.8rem)] uppercase tracking-widest text-white/70">
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
      <section
        className={[
          "flex-1 min-h-0 flex justify-center px-[clamp(0.75rem,1.3vw,1.6rem)] py-[clamp(0.5rem,1.1vh,1rem)]",
          showRunning ? "items-stretch" : "items-center",
        ].join(" ")}
      >
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
          <div className="w-full h-full flex flex-col justify-center gap-[clamp(0.75rem,1.3vh,1.25rem)]">
            {/* Intro layout takes priority */}
            {runtime.isIntroSong ? (
              activeGame?.gameNumber === 2 ? (
                /* ── Sing Along intro (Game 2) ── */
                <div className="w-full h-full flex flex-col items-center justify-center gap-[clamp(1rem,2.2vh,2rem)]">
                  <div className="w-full bg-brand-gold/90 border-2 border-white/60 rounded-2xl py-5 px-8 text-center">
                    <p className="m-0 uppercase tracking-[0.2em] text-white/80 text-[clamp(0.7rem,1.4vw,1rem)]">
                      Get Ready for Game 2
                    </p>
                    <h2 className="m-0 mt-1 uppercase font-black text-white text-[clamp(2.6rem,7vw,7rem)] leading-none tracking-wide">
                      Sing Along!
                    </h2>
                  </div>
                  <div className="text-center">
                    <h3 className="m-0 text-[clamp(2.4rem,6vw,6.5rem)] uppercase font-black tracking-wide text-white leading-[0.95]">
                      {runtime.currentTrack.title}
                    </h3>
                    <p className="m-0 mt-2 text-[clamp(1.4rem,3vw,3.2rem)] text-white/80 uppercase tracking-wide">
                      {runtime.currentTrack.artist}
                    </p>
                  </div>
                  {runtime.currentTrack.albumImageUrl && (
                    <img
                      src={runtime.currentTrack.albumImageUrl}
                      alt="Album cover"
                      className="w-[min(42dvh,52vw)] max-w-[520px] aspect-square rounded-[18px] border-3 border-white/70 shadow-xl object-cover bg-black"
                    />
                  )}
                </div>
              ) : (
                /* ── Dance Along intro (Game 1, default) ── */
                <div className="w-full h-full flex flex-col items-center justify-center gap-[clamp(1rem,2vh,1.8rem)]">
                  <div className="w-full bg-brand-gold/90 border-2 border-white/60 rounded-2xl py-5 px-8 text-center">
                    <p className="m-0 uppercase tracking-[0.2em] text-white/80 text-[clamp(0.7rem,1.4vw,1rem)]">
                      Get Ready for Game 1
                    </p>
                    <h2 className="m-0 mt-1 uppercase font-black text-white text-[clamp(2.6rem,7vw,7rem)] leading-none tracking-wide">
                      Dance Along!
                    </h2>
                  </div>
                  {runtime.currentTrack.albumImageUrl && (
                    <img
                      src={runtime.currentTrack.albumImageUrl}
                      alt="Album cover"
                      className="w-[min(58dvh,72vw)] max-w-[720px] aspect-square rounded-[22px] border-4 border-white/90 shadow-2xl object-cover bg-black"
                    />
                  )}
                  <div className="text-center">
                    <h3 className="m-0 text-[clamp(1.7rem,4.4vw,4.2rem)] uppercase font-black tracking-wide text-white leading-[0.95]">
                      {runtime.currentTrack.title}
                    </h3>
                    <p className="m-0 mt-1 text-[clamp(1.2rem,2.5vw,2.5rem)] text-white/80 uppercase tracking-wide">
                      {runtime.currentTrack.artist}
                    </p>
                  </div>
                </div>
              )
            ) : isChallenge ? (
              <div className="w-full h-full min-h-0 grid grid-rows-[auto_minmax(0,1fr)_auto] gap-[clamp(0.65rem,1.6vh,1.2rem)] text-center overflow-hidden py-[clamp(0.35rem,1vh,0.9rem)]">
                <div className="min-h-0">
                  <p className="m-0 uppercase tracking-[0.28em] text-yellow-100 text-[clamp(0.8rem,1.5vw,1.3rem)] font-black">
                    {challengeType === "dance-along" ? "Dance Challenge" : "Sing Challenge"}
                  </p>
                  <h2 className="m-0 mt-1 uppercase font-black text-white text-[clamp(3rem,8.6vw,7.8rem)] leading-[0.84] tracking-wide drop-shadow-[0_6px_20px_rgba(0,0,0,0.35)]">
                    {challengeType === "dance-along" ? (
                      <>
                        <span>Get Up And Dance</span>
                      </>
                    ) : (
                      <>
                        <span>Sing Along</span>
                      </>
                    )}
                  </h2>
                </div>

                <div className="min-h-0 grid grid-cols-1 lg:[grid-template-columns:minmax(0,0.78fr)_minmax(0,1.22fr)] items-center gap-[clamp(0.75rem,2.6vw,3rem)]">
                  <div className="min-h-0 flex items-center justify-center lg:justify-end">
                    {(runtime.freePlay || localRevealState.showAlbum) && runtime.currentTrack.albumImageUrl ? (
                      <img
                        src={runtime.currentTrack.albumImageUrl}
                        alt="Album cover"
                        className="w-[min(48dvh,34vw)] max-w-none aspect-square rounded-[22px] border-4 border-yellow-200/90 shadow-2xl object-cover bg-black"
                      />
                    ) : (
                      <div className="w-[min(48dvh,34vw)] max-w-none aspect-square rounded-[22px] border-4 border-dashed border-yellow-200/70 flex items-center justify-center text-[clamp(1rem,2vw,1.8rem)] uppercase tracking-[0.08em] bg-amber-900/35 text-white/80">
                        Album reveals at {Math.floor(CHALLENGE_REVEAL_CONFIG.albumMs / 1000)}s
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex flex-col items-center lg:items-start justify-center gap-[clamp(0.45rem,1.1vh,0.85rem)]">
                    <p className="m-0 text-white/95 text-[clamp(1rem,2vw,2rem)] font-bold leading-tight">
                      {challengeType === "dance-along"
                        ? "Dancing challenge song"
                        : "Singing challenge song"}
                    </p>
                    {(runtime.freePlay || localRevealState.showTitle) ? (
                      <h3 className="m-0 max-w-[min(56rem,94vw)] lg:text-left text-center text-[clamp(1.7rem,4.6vw,5rem)] uppercase font-black tracking-wide text-white leading-[0.92] break-words">
                        {runtime.currentTrack.title || "Unknown Title"}
                      </h3>
                    ) : (
                      <p className="m-0 text-[clamp(1.25rem,2.7vw,2.8rem)] uppercase tracking-[0.08em] text-white/90">
                        Title reveals at {Math.floor(CHALLENGE_REVEAL_CONFIG.titleMs / 1000)}s
                      </p>
                    )}
                    {(runtime.freePlay || localRevealState.showArtist) ? (
                      <p className="m-0 max-w-[min(56rem,94vw)] lg:text-left text-center text-[clamp(1.25rem,2.8vw,3.1rem)] font-bold text-white/90 leading-tight break-words">
                        {runtime.currentTrack.artist || "Unknown Artist"}
                      </p>
                    ) : localRevealState.showTitle ? (
                      <p className="m-0 text-[clamp(1rem,2vw,1.8rem)] uppercase tracking-[0.08em] text-white/80">
                        Artist reveals at {Math.floor(CHALLENGE_REVEAL_CONFIG.artistMs / 1000)}s
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="min-h-0">
                  {runtime.freePlay ? (
                    <p className="m-0 text-white/85 text-[clamp(1rem,2vw,2rem)] uppercase tracking-[0.05em]">
                      Free Play
                    </p>
                  ) : localRevealState.shouldAdvance ? (
                    <p className="m-0 text-white/95 text-[clamp(1rem,2vw,2rem)] uppercase tracking-[0.05em]">
                      Advancing to next song...
                    </p>
                  ) : (
                    <div className="inline-flex items-center justify-center rounded-xl border border-yellow-200/55 bg-amber-900/30 px-[clamp(1rem,2vw,2rem)] py-[clamp(0.4rem,0.9vh,0.7rem)]">
                      <p className="m-0 text-white/95 text-[clamp(1rem,2vw,2rem)] uppercase tracking-[0.05em]">
                        Next song at {Math.floor((effectiveCfg.nextMs + runtime.extensionMs) / 1000)}s
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full grid grid-cols-1 lg:[grid-template-columns:minmax(0,0.9fr)_minmax(0,1.1fr)] gap-[clamp(1rem,3vw,4rem)] items-center">
                {/* Album art */}
                <div className="min-h-0 flex items-center justify-center">
                  {(runtime.freePlay || localRevealState.showAlbum) ? (
                    runtime.currentTrack.albumImageUrl ? (
                      <img
                        src={runtime.currentTrack.albumImageUrl}
                        alt="Album cover"
                        className="w-[min(74dvh,44vw)] max-w-none aspect-square rounded-[22px] border-4 border-white/90 shadow-2xl object-cover bg-black"
                      />
                    ) : (
                      <div className="w-[min(74dvh,44vw)] max-w-none aspect-square rounded-[22px] border-4 border-white/90 flex items-center justify-center text-[clamp(1.2rem,2.4vw,2.2rem)] uppercase tracking-[0.08em] bg-brand-green/72">
                        Album Cover
                      </div>
                    )
                  ) : (
                    <div className="w-[min(74dvh,44vw)] max-w-none aspect-square rounded-[22px] border-4 border-dashed border-white/50 flex items-center justify-center text-[clamp(1.2rem,2.4vw,2.2rem)] uppercase tracking-[0.08em] bg-brand-green/72 opacity-50">
                      Album reveals at {Math.floor(effectiveCfg.albumMs / 1000)}s
                    </div>
                  )}
                </div>

                {/* Track metadata */}
                <div className="min-w-0 grid gap-[clamp(0.7rem,1.5vh,1.25rem)] lg:text-left text-center">
                  {(runtime.freePlay || localRevealState.showTitle) ? (
                    <h2 className="m-0 text-[clamp(2.2rem,6.1vw,7rem)] uppercase font-black tracking-wide text-white leading-[0.96]">
                      {runtime.currentTrack.title || "Unknown Title"}
                    </h2>
                  ) : (
                    <h2 className="m-0 text-[clamp(2.2rem,6.1vw,7rem)] uppercase font-black tracking-wide text-white/75 leading-[0.96]">
                      Title reveals at {Math.floor(effectiveCfg.titleMs / 1000)}s
                    </h2>
                  )}

                  {(runtime.freePlay || localRevealState.showArtist) ? (
                    <p className="m-0 text-[clamp(1.7rem,3.9vw,4.4rem)] font-bold text-white leading-tight">
                      {runtime.currentTrack.artist || "Unknown Artist"}
                    </p>
                  ) : (
                    <p className="m-0 text-[clamp(1.7rem,3.9vw,4.4rem)] font-bold text-white/75 leading-tight">
                      Artist reveals at {Math.floor(effectiveCfg.artistMs / 1000)}s
                    </p>
                  )}

                  {runtime.freePlay ? (
                    <p className="mt-1 text-white/70 text-[clamp(1.2rem,2.5vw,2.8rem)] uppercase tracking-[0.05em]">
                      Free Play
                    </p>
                  ) : localRevealState.shouldAdvance ? (
                    <p className="mt-1 text-white/90 text-[clamp(1.2rem,2.5vw,2.8rem)] uppercase tracking-[0.05em]">
                      Advancing to next song...
                    </p>
                  ) : (
                    <p className="mt-1 text-white/90 text-[clamp(1.2rem,2.5vw,2.8rem)] uppercase tracking-[0.05em]">
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
      <footer
        className={[
          "shrink-0 flex justify-between items-center gap-4 px-4 py-2 border-t",
          challengeActive
            ? "border-yellow-200/60 bg-amber-800/90"
            : "border-brand-green-light/60 bg-brand-green/94",
        ].join(" ")}
      >
        <div>
          <p className="m-0 text-[clamp(0.78rem,1.15vw,1rem)] text-white/92 leading-tight">
            Mode: {runtime.mode.toUpperCase()}
          </p>
          <p className="m-0 text-[clamp(0.78rem,1.15vw,1rem)] text-white/92 leading-tight">
            Active:{" "}
            {runtime.activeGameNumber
              ? `Game ${runtime.activeGameNumber}${activeGame ? ` — ${activeGame.theme}` : ""}`
              : "Not started"}
          </p>
        </div>
        <div className="text-right">
          <p className="m-0 text-[clamp(0.78rem,1.15vw,1rem)] text-white/92 leading-tight">
            Progress: {formatSeconds(interpolatedProgress)}
          </p>
        </div>
      </footer>
    </div>
    </BrandProvider>
  );
}
