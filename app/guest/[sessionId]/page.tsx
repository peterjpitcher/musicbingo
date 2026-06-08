"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { matchChallengeSong } from "@/lib/live/challenge";
import { subscribeLiveChannel } from "@/lib/live/channel";
import { getLiveSession } from "@/lib/live/sessionApi";
import { readRuntimeState, validateRuntimeState } from "@/lib/live/storage";
import {
  CHALLENGE_REVEAL_CONFIG,
  DEFAULT_CHALLENGE_BONUS_POINTS,
  DEFAULT_REVEAL_CONFIG,
  getRevealConfigWithExtension,
  makeEmptyRuntimeState,
  sanitizeChallengeBonusPoints,
  type LiveRuntimeState,
  type LiveSessionV1,
  type RevealConfig,
} from "@/lib/live/types";
import { computeRevealState } from "@/lib/live/reveal";
import { normalizeScreenId, type ScreenId } from "@/lib/live/runOfShow";
import { deriveScreenId } from "@/lib/live/deriveScreen";
import { getContent, type ContentKey } from "@/lib/live/content";
import { useWakeLock } from "@/hooks/useWakeLock";
import { BrandProvider } from "@/components/brand/BrandProvider";
import { EditContext } from "@/components/motifs/EditContext";
import { SCREEN_REGISTRY } from "@/components/screens/registry";
import { ScoreToastOverlay } from "@/components/screens/ScoreToastOverlay";
import { DEFAULT_BRAND_CONFIG } from "@/lib/brands/defaultBrand";
import type { BrandConfig } from "@/lib/brands/types";

/**
 * Interpolates progressMs locally between server updates so reveal timing ticks
 * smoothly every second rather than jumping every 2s when a new poll arrives.
 */
function useInterpolatedProgress(runtime: LiveRuntimeState): number {
  const serverProgress = runtime.currentTrack?.progressMs ?? 0;
  const isPlaying = runtime.currentTrack?.isPlaying ?? false;
  const trackId = runtime.currentTrack?.trackId ?? null;
  const updatedAt = runtime.updatedAtMs;

  const anchor = useMemo(
    () => ({ progress: serverProgress, updatedAt, trackId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updatedAt, trackId]
  );

  const [tick, setTick] = useState(0);
  const [lastAnchor, setLastAnchor] = useState(anchor);
  if (anchor !== lastAnchor) {
    setLastAnchor(anchor);
    setTick(0);
  }

  useEffect(() => {
    if (!isPlaying || !trackId) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [isPlaying, trackId, anchor]);

  if (!isPlaying) return anchor.progress;
  return anchor.progress + tick * 1000;
}

/** Scales the fixed 1920×1080 stage to fit the viewport (the design's TV scaler). */
function useStageScale(): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
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
    if (!sessionLoading && !session) return "Live session not found.";
    return "";
  }, [session, sessionId, sessionLoading]);

  const [runtime, setRuntime] = useState<LiveRuntimeState>(() => {
    if (!sessionId) return makeEmptyRuntimeState("pending");
    return readRuntimeState(sessionId) ?? makeEmptyRuntimeState(sessionId);
  });

  const scale = useStageScale();

  // --- Load the session + its brand (once) ---
  useEffect(() => {
    if (!sessionId || sessionLoadedRef.current) return;
    sessionLoadedRef.current = true;
    let cancelled = false;
    getLiveSession(sessionId)
      .then((loaded) => {
        if (cancelled) return;
        setSession(loaded);
        setSessionLoading(false);
        if (loaded) {
          fetch(`/api/sessions/${encodeURIComponent(sessionId)}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data?.brand && !cancelled) setBrand(data.brand);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setSessionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // --- Same-device sync: BroadcastChannel + localStorage poll ---
  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = subscribeLiveChannel(sessionId, (message) => {
      if (message.type === "runtime_update") setRuntime(message.runtime);
      if (message.type === "brand_update") setBrand(message.brand);
    });
    const id = window.setInterval(() => {
      const persisted = readRuntimeState(sessionId);
      if (persisted)
        setRuntime((prev) =>
          persisted.updatedAtMs > prev.updatedAtMs ? persisted : prev
        );
    }, 2_000);
    return () => {
      unsubscribe();
      window.clearInterval(id);
    };
  }, [sessionId]);

  // --- Cross-device sync: poll server runtime every 2s ---
  useEffect(() => {
    if (!sessionId) return;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/sessions/${encodeURIComponent(sessionId)}/runtime`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const data: unknown = await res.json();
          const validated = validateRuntimeState(data);
          if (validated)
            setRuntime((prev) =>
              validated.updatedAtMs > prev.updatedAtMs ? validated : prev
            );
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

  // --- Reveal computation (unchanged from the previous projection) ---
  const activeGame = runtime.activeGameNumber
    ? session?.games.find((g) => g.gameNumber === runtime.activeGameNumber) ?? null
    : null;

  const localChallengeType = matchChallengeSong(runtime.currentTrack, activeGame);
  const isChallenge = runtime.isChallengeSong || localChallengeType !== null;
  const challengeType = runtime.challengeType ?? localChallengeType;
  const challengeBonusPoints = isChallenge
    ? sanitizeChallengeBonusPoints(activeGame?.challengeBonusPoints ?? runtime.challengeBonusPoints ?? DEFAULT_CHALLENGE_BONUS_POINTS)
    : DEFAULT_CHALLENGE_BONUS_POINTS;

  const effectiveCfg: RevealConfig = isChallenge
    ? CHALLENGE_REVEAL_CONFIG
    : runtime.revealConfig ?? session?.revealConfig ?? DEFAULT_REVEAL_CONFIG;
  const effectiveNextCfg: RevealConfig = getRevealConfigWithExtension(
    effectiveCfg,
    runtime.extensionMs
  );

  const computedReveal =
    runtime.isIntroSong || runtime.freePlay
      ? { showAlbum: true, showTitle: true, showArtist: true, shouldAdvance: false }
      : computeRevealState(interpolatedProgress, effectiveNextCfg);
  const localRevealState = {
    showAlbum: runtime.revealState.showAlbum || computedReveal.showAlbum,
    showTitle: runtime.revealState.showTitle || computedReveal.showTitle,
    showArtist: runtime.revealState.showArtist || computedReveal.showArtist,
    shouldAdvance: computedReveal.shouldAdvance || runtime.revealState.shouldAdvance,
  };

  // Runtime handed to the screen components: carries the interpolated reveal
  // state + resolved challenge flags so the screens render the live reveal.
  const screenRuntime: LiveRuntimeState = {
    ...runtime,
    revealState: localRevealState,
    isChallengeSong: isChallenge,
    challengeType,
    challengeBonusPoints,
  };

  const effectiveBrand = brand ?? DEFAULT_BRAND_CONFIG;

  // Which run-of-show screen to display. The host's explicit `screenId` wins;
  // otherwise derive one from the legacy runtime model (pre-Phase-3 host).
  const screenId: ScreenId = sessionLoading
    ? "sys-load"
    : error
      ? "sys-none"
      : normalizeScreenId(runtime.screenId, deriveScreenId(runtime));

  // Guest TV is read-only: `get` resolves content for `<Editable>`; `set` is a
  // no-op. The host preview (Phase 3) supplies an editing-enabled provider.
  const editValue = {
    editing: false,
    get: (key: string, fallback?: string) =>
      getContent(key as ContentKey, {
        runtime: screenRuntime,
        session,
        brand: effectiveBrand,
      }) || (fallback ?? ""),
    set: () => {},
  };

  const renderScreen = SCREEN_REGISTRY[screenId];

  return (
    <BrandProvider brand={brand}>
      <EditContext.Provider value={editValue}>
        <div className="viewport">
          <div
            className="stage-scaler"
            style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
          >
            <div className="stage">
              <div className="screen-wrap in" key={screenId}>
                {renderScreen({ brand: effectiveBrand, runtime: screenRuntime })}
                <ScoreToastOverlay toast={screenRuntime.scoreToast} />
              </div>
            </div>
          </div>
        </div>
      </EditContext.Provider>
    </BrandProvider>
  );
}
