"use client";

import { songProgressMs } from "@/lib/live/songStart";
import { useCallback, useEffect, useRef, useState } from "react";

import { Stage, useWakeLock } from "@anchor-nights/kit/tv";
import { EditContext } from "@/components/motifs/EditContext";
import { PromoLoop } from "@/components/promo/PromoLoop";
import { SCREEN_REGISTRY } from "@/components/screens/registry";
import { ScoreToastOverlay } from "@/components/screens/ScoreToastOverlay";
import { DEFAULT_BRAND_CONFIG } from "@/lib/brands/defaultBrand";
import type { BrandConfig } from "@/lib/brands/types";
import { matchChallengeSong } from "@/lib/live/challenge";
import { getContent, type ContentKey } from "@/lib/live/content";
import { deriveScreenId } from "@/lib/live/deriveScreen";
import { subscribeLiveChannel } from "@/lib/live/channel";
import { nextProgressAnchor, progressAt, type ProgressAnchor } from "@/lib/live/displayClock";
import { decideBroadcast, decidePoll, NOTHING_APPLIED, type AppliedMark } from "@/lib/live/snapshotOrder";
import { computeRevealState } from "@/lib/live/reveal";
import { normalizeScreenId, type ScreenId } from "@/lib/live/runOfShow";
import { readPromoHides, resolvePromoMode, sessionDateFor, type PromoLead } from "@/lib/promo/promoMode";
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
  /** live_sessions.runtime_version (spec M-9). */
  runtimeVersion?: number;
  brand: BrandConfig | null;
};

/** How long a paired TV waits before reloading when the server stops serving it this game. */
const TV_RELOAD_AFTER_ACCESS_LOSS_MS = 5_000;

export interface LiveDisplayProps {
  sessionId: string;
  /**
   * "link": /display/[id], opened from a TV link or the laptop.
   * "tv": a paired /tv. When the server stops serving this game to the TV
   * (removed, the night is over, the game was deleted) it reloads, so /tv
   * finds tonight's game again or shows the pairing code or idle screen.
   */
  mode?: "link" | "tv";
}

/**
 * The TV display (spec S3.3, M-9): the kit's 1920x1080 Stage, polling the
 * game's snapshot every 1.5 seconds while running (5 idle). On the laptop
 * that runs the console, the console's BroadcastChannel updates it at once.
 * Stale runtimes are dropped by version (lib/live/snapshotOrder.ts).
 */
export function LiveDisplay({ sessionId, mode = "link" }: LiveDisplayProps): React.JSX.Element {
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
  const appliedRef = useRef<AppliedMark>(NOTHING_APPLIED);
  // The TV's song clock: re-anchored when a new host save arrives, counted
  // up locally in between (see lib/live/displayClock).
  const [songClock, setSongClock] = useState<{ anchor: ProgressAnchor; now: number } | null>(null);

  const applyRuntime = useCallback(
    (incoming: LiveRuntimeState, source: "poll" | "broadcast", version: number | null) => {
      const nowMs = Date.now();
      const updatedAt = incoming?.updatedAtMs ?? 0;
      const previous = appliedRef.current;
      const decision = source === "poll"
        ? decidePoll(previous, version ?? 0, updatedAt, nowMs)
        : decideBroadcast(previous, updatedAt, nowMs);
      appliedRef.current = decision.mark;
      if (!decision.apply) return;
      setRuntime(incoming);
      // Re-anchor the song clock only on a new save. Re-reading the same save
      // while the host is briefly silent must not drag the clock back to it.
      if (updatedAt !== previous.updatedAtMs) {
        const track = incoming?.currentTrack ?? null;
        setSongClock((prior) => ({
          anchor: nextProgressAnchor({
            previous: prior?.anchor ?? null,
            incoming: { trackId: track?.trackId ?? null, progressMs: track?.progressMs ?? 0 },
            isPlaying: Boolean(track?.isPlaying),
            nowMs,
          }),
          now: nowMs,
        }));
      }
    },
    []
  );

  useEffect(() => {
    if (!sessionId) {
      setError("Invalid display session id.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    let failedPolls = 0;
    let accessLost = false;
    let reloadTimer: number | null = null;

    async function poll() {
      try {
        const res = await fetch(`/api/display/${encodeURIComponent(sessionId)}/snapshot`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (mode === "tv" && (res.status === 401 || res.status === 403 || res.status === 404)) {
            // This TV may no longer show this game: let /tv decide again.
            accessLost = true;
            throw new Error("Finding tonight's game...");
          }
          if (res.status === 401) {
            throw new Error("This private display link is missing, expired or cancelled.");
          }
          throw new Error("Display sync failed.");
        }
        const data = await res.json() as DisplaySnapshot;
        if (cancelled) return;
        failedPolls = 0;
        hasSnapshotRef.current = true;
        setSession(data.session);
        applyRuntime(data.runtime, "poll", typeof data.runtimeVersion === "number" ? data.runtimeVersion : 0);
        setBrand(data.brand);
        setError("");
        setConnectionWarning("");
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (accessLost && reloadTimer === null) {
          reloadTimer = window.setTimeout(() => window.location.reload(), TV_RELOAD_AFTER_ACCESS_LOSS_MS);
        }
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
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
    };
  }, [runtime.mode, sessionId, mode, applyRuntime]);

  // Same-device speed: the console on this browser posts each runtime here
  // as it happens; the poll still catches anything else.
  useEffect(() => {
    if (!sessionId) return;
    return subscribeLiveChannel(sessionId, (message) => {
      if (message.type === "runtime_update" && message.runtime.sessionId === sessionId) {
        applyRuntime(message.runtime, "broadcast", null);
      }
    });
  }, [sessionId, applyRuntime]);

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
  // Counted from the song's start time when it has one, as on the console.
  const interpolatedProgress = songProgressMs(
    songClock
      ? progressAt(songClock.anchor, songIsPlaying, songClock.now)
      : runtime.currentTrack?.progressMs ?? 0,
    runtime.songStartMs
  );
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
  // Welcome, the interval and the end of the night loop the management app's
  // upcoming events (spec M-7, S7.4 and S7.5); every other screen is drawn
  // on its own. The feed and the review link come from PromoProvider.
  const promoMode = loading || error ? null : resolvePromoMode(screenId, readPromoHides((key) => editValue.get(key, "")));
  const eventDateInput = session?.eventDateInput ?? null;
  const screenProps = { brand: effectiveBrand, runtime: screenRuntime, progressMs: interpolatedProgress, eventDateInput };
  const sessionDate = useCallback((nowMs: number) => sessionDateFor(eventDateInput, nowMs), [eventDateInput]);
  const renderLead = (lead: PromoLead) => SCREEN_REGISTRY[lead](screenProps);

  return (
    <EditContext.Provider value={editValue}>
      {/* The kit's 1920x1080 stage, scaled to the window (spec S3.3). Every
          screen is designed in canvas pixels. */}
      <Stage>
        <div className="screen-wrap in" key={screenId}>
          {promoMode ? (
            <PromoLoop mode={promoMode} brand={effectiveBrand} sessionDate={sessionDate} renderLead={renderLead} />
          ) : (
            renderScreen(screenProps)
          )}
          <ScoreToastOverlay toast={screenRuntime.scoreToast} />
        </div>
        {connectionWarning ? (
          <div
            role="status"
            className="absolute left-1/2 top-6 z-[80] -translate-x-1/2 rounded-full border border-line-gold bg-scrim px-8 py-3 font-sans text-[32px] font-semibold text-anchor-cream-text"
          >
            {connectionWarning}
          </div>
        ) : null}
      </Stage>
    </EditContext.Provider>
  );
}
