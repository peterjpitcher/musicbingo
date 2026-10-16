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
import { isNewerRuntime, nextProgressAnchor, progressAt, type ProgressAnchor } from "@/lib/live/displayClock";
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
  const lastAppliedUpdatedAtRef = useRef<number | null>(null);
  // The TV's song clock: re-anchored when a new host save arrives, counted
  // up locally in between (see lib/live/displayClock).
  const [songClock, setSongClock] = useState<{ anchor: ProgressAnchor; now: number } | null>(null);
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
        // A slow network can store an older host save after a newer one;
        // never let the TV step back to it.
        const incomingUpdatedAt = data.runtime?.updatedAtMs ?? 0;
        const previousUpdatedAt = lastAppliedUpdatedAtRef.current;
        if (isNewerRuntime(incomingUpdatedAt, previousUpdatedAt)) {
          lastAppliedUpdatedAtRef.current = incomingUpdatedAt;
          setRuntime(data.runtime);
          // Re-anchor only on a new save. Re-reading the same save while the
          // host is briefly silent must not drag the clock back to it.
          if (incomingUpdatedAt !== previousUpdatedAt) {
            const nowMs = Date.now();
            const track = data.runtime?.currentTrack ?? null;
            setSongClock((previous) => ({
              anchor: nextProgressAnchor({
                previous: previous?.anchor ?? null,
                incoming: { trackId: track?.trackId ?? null, progressMs: track?.progressMs ?? 0 },
                isPlaying: Boolean(track?.isPlaying),
                nowMs,
              }),
              now: nowMs,
            }));
          }
        }
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

  const songIsPlaying = runtime.currentTrack?.isPlaying ?? false;
  const songTrackId = runtime.currentTrack?.trackId ?? null;
  useEffect(() => {
    if (!songIsPlaying || !songTrackId) return;
    const id = window.setInterval(
      () => setSongClock((current) => (current ? { ...current, now: Date.now() } : current)),
      250
    );
    return () => window.clearInterval(id);
  }, [songIsPlaying, songTrackId]);
  const interpolatedProgress = songClock
    ? progressAt(songClock.anchor, songIsPlaying, songClock.now)
    : runtime.currentTrack?.progressMs ?? 0;
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
                {renderScreen({ brand: effectiveBrand, runtime: screenRuntime, progressMs: interpolatedProgress })}
                <ScoreToastOverlay toast={screenRuntime.scoreToast} />
              </div>
            </div>
          </div>
        </div>
      </EditContext.Provider>
    </BrandProvider>
  );
}
