"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { BrandProvider } from "@/components/brand/BrandProvider";
import { EditContext } from "@/components/motifs/EditContext";
import { SCREEN_REGISTRY } from "@/components/screens/registry";
import { ScoreToastOverlay } from "@/components/screens/ScoreToastOverlay";
import { useWakeLock } from "@/hooks/useWakeLock";
import { DEFAULT_BRAND_CONFIG } from "@/lib/brands/defaultBrand";
import type { BrandConfig } from "@/lib/brands/types";
import { matchChallengeSong } from "@/lib/live/challenge";
import { getContent, type ContentKey } from "@/lib/live/content";
import { deriveScreenId } from "@/lib/live/deriveScreen";
import { computeRevealState } from "@/lib/live/reveal";
import { normalizeScreenId, type ScreenId } from "@/lib/live/runOfShow";
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

type DisplaySnapshot = {
  session: LiveSessionV1;
  runtime: LiveRuntimeState;
  brand: BrandConfig | null;
};

function useInterpolatedProgress(runtime: LiveRuntimeState): number {
  const serverProgress = runtime.currentTrack?.progressMs ?? 0;
  const isPlaying = runtime.currentTrack?.isPlaying ?? false;
  const trackId = runtime.currentTrack?.trackId ?? null;
  const updatedAt = runtime.updatedAtMs;
  const anchor = useMemo(
    () => ({ progress: serverProgress, updatedAt, trackId }),
    [serverProgress, updatedAt, trackId]
  );
  const [tick, setTick] = useState(0);
  const [lastAnchor, setLastAnchor] = useState(anchor);

  if (anchor !== lastAnchor) {
    setLastAnchor(anchor);
    setTick(0);
  }

  useEffect(() => {
    if (!isPlaying || !trackId) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [isPlaying, trackId, anchor]);

  return isPlaying ? anchor.progress + tick * 1000 : anchor.progress;
}

function useStageScale(): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

export default function PrivateDisplayPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = useMemo(
    () => (typeof params?.sessionId === "string" ? params.sessionId : ""),
    [params?.sessionId]
  );

  useWakeLock();

  const [session, setSession] = useState<LiveSessionV1 | null>(null);
  const [brand, setBrand] = useState<BrandConfig | null>(null);
  const [runtime, setRuntime] = useState<LiveRuntimeState>(() =>
    makeEmptyRuntimeState(sessionId || "pending")
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectionWarning, setConnectionWarning] = useState("");
  const hasSnapshotRef = useRef(false);
  const scale = useStageScale();

  useEffect(() => {
    if (!sessionId) {
      setError("Invalid display session id.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    let failedPolls = 0;

    async function poll() {
      try {
        const res = await fetch(`/api/display/${encodeURIComponent(sessionId)}/snapshot`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("This private display link is missing or expired.");
          }
          throw new Error("Display sync failed.");
        }
        const data = await res.json() as DisplaySnapshot;
        if (cancelled) return;
        failedPolls = 0;
        hasSnapshotRef.current = true;
        setSession(data.session);
        setRuntime(data.runtime);
        setBrand(data.brand);
        setError("");
        setConnectionWarning("");
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        failedPolls += 1;
        setLoading(false);
        if (!hasSnapshotRef.current) {
          setError(err instanceof Error ? err.message : "Display sync failed.");
          return;
        }
        if (failedPolls >= 2) {
          setConnectionWarning("Connection is flaky. Showing the last good display state.");
        }
      }
    }

    void poll();
    const id = window.setInterval(() => void poll(), runtime.mode === "idle" ? 5000 : 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [runtime.mode, sessionId]);

  const interpolatedProgress = useInterpolatedProgress(runtime);
  const activeGame = runtime.activeGameNumber
    ? session?.games.find((game) => game.gameNumber === runtime.activeGameNumber) ?? null
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
  const effectiveNextCfg = getRevealConfigWithExtension(effectiveCfg, runtime.extensionMs);
  const computedReveal = runtime.isIntroSong || runtime.freePlay
    ? { showAlbum: true, showTitle: true, showArtist: true, shouldAdvance: false }
    : computeRevealState(interpolatedProgress, effectiveNextCfg);
  const screenRuntime: LiveRuntimeState = {
    ...runtime,
    revealState: {
      showAlbum: runtime.revealState.showAlbum || computedReveal.showAlbum,
      showTitle: runtime.revealState.showTitle || computedReveal.showTitle,
      showArtist: runtime.revealState.showArtist || computedReveal.showArtist,
      shouldAdvance: runtime.revealState.shouldAdvance || computedReveal.shouldAdvance,
    },
    isChallengeSong: isChallenge,
    challengeType,
    challengeBonusPoints,
  };

  const effectiveBrand = brand ?? DEFAULT_BRAND_CONFIG;
  const screenId: ScreenId = loading
    ? "sys-load"
    : error
      ? "sys-none"
      : normalizeScreenId(runtime.screenId, deriveScreenId(runtime));
  const renderScreen = SCREEN_REGISTRY[screenId];
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

  return (
    <BrandProvider brand={brand}>
      <EditContext.Provider value={editValue}>
        <div className="viewport">
          {connectionWarning ? (
            <div style={{
              position: "fixed",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 20,
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(0,0,0,0.78)",
              color: "#fff",
              fontSize: 14,
            }}>
              {connectionWarning}
            </div>
          ) : null}
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
