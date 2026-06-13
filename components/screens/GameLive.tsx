"use client";

import { useEffect, useMemo, useState } from "react";

import type { ScreenProps } from "@/components/screens/types";
import type { LiveRuntimeState } from "@/lib/live/types";
import {
  CHALLENGE_REVEAL_CONFIG,
  DEFAULT_CHALLENGE_BONUS_POINTS,
  DEFAULT_REVEAL_CONFIG,
  getRevealConfigWithExtension,
} from "@/lib/live/types";
import { Editable } from "@/components/motifs/Editable";
import { Ball } from "@/components/motifs/Ball";
import { Eq } from "@/components/motifs/Eq";
import { Chrome } from "@/components/motifs/Chrome";
import { AlbumArt } from "@/components/screens/AlbumArt";

/**
 * Smoothly interpolates the playing track's `progressMs` between the ~2s server
 * polls so the "Next song" countdown/bar ticks live instead of jumping. Mirrors
 * the display page's `useInterpolatedProgress` so the bar behaves identically on
 * the display TV and the host preview (both render this component via the
 * registry). Returns `null` when there is no live, playing track.
 */
function useLiveProgressMs(runtime: LiveRuntimeState | null | undefined): number | null {
  const track = runtime?.currentTrack ?? null;
  const serverProgress = track?.progressMs ?? 0;
  const isPlaying = track?.isPlaying ?? false;
  const trackId = track?.trackId ?? null;
  const updatedAt = runtime?.updatedAtMs ?? 0;

  const anchor = useMemo(
    () => ({ progress: serverProgress, updatedAt, trackId }),
    // Re-anchor only when a fresh snapshot (new poll or new track) arrives.
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
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [isPlaying, trackId, anchor]);

  if (!track) return null;
  if (!isPlaying) return anchor.progress;
  return anchor.progress + tick * 1000;
}

/** Formats milliseconds as a `m:ss` countdown string (clamped at zero). */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function fitTitleSize(value: string): number {
  const length = value.trim().length;
  if (length > 50) return 64;
  if (length > 36) return 76;
  if (length > 26) return 90;
  if (length > 18) return 108;
  return 130;
}

function fitArtistSize(value: string): number {
  const length = value.trim().length;
  if (length > 54) return 34;
  if (length > 40) return 40;
  if (length > 28) return 46;
  return 56;
}

function challengePresentation(type: LiveRuntimeState["challengeType"]): {
  className: string;
  icon: string;
  label: string;
  instruction: string;
} {
  const dance = type === "dance-along";
  return dance
    ? {
      className: "screen--chal-dance",
      icon: "🕺",
      label: "Dance Challenge",
      instruction: "Cards down — everyone up on your feet and dance along!",
    }
    : {
      className: "screen--chal-sing",
      icon: "🎤",
      label: "Sing Challenge",
      instruction: "Cards down — everyone sing along at the top of your lungs!",
    };
}

/**
 * Live gameplay screen shown during Game 1 or Game 2 (music bingo album reveal).
 * Ported faithfully from docs/design/after-hours/screens-b.jsx — GameLive.
 *
 * Live wiring (Phase 1 baseline — exact polish deferred to Phase 2):
 * - Album art: `AlbumArt` receives `imageUrl` from `runtime.currentTrack`.
 * - Title: shown only when `runtime.revealState.showTitle` is true.
 * - Artist: shown only when `runtime.revealState.showArtist` is true.
 * - Reveal badges: each badge is lit (accent style) per its corresponding
 *   `showAlbum` / `showTitle` / `showArtist` flag; unlit badges use a dim style.
 * - When `runtime` is absent the Editable placeholders fill every field and
 *   all badges render as lit (matching the source's static demo view).
 */
export function GameLive({
  brand,
  runtime,
  game = 1,
}: ScreenProps & { game?: 1 | 2 }): JSX.Element {
  const themeField = game === 1 ? "g1theme" : "g2theme";
  const themePH = game === 1 ? "Pop Anthems" : "Throwback Bangers";
  const t = game === 1 ? "g1" : "g2";

  const expectedScreen = game === 1 ? "game1" : "game2";
  const showLiveTrack = Boolean(
    runtime?.currentTrack &&
      runtime.activeGameNumber === game &&
      !runtime.isIntroSong &&
      (runtime.mode === "running" || runtime.mode === "paused") &&
      (!runtime.screenId || runtime.screenId === expectedScreen)
  );
  const liveRuntime = showLiveTrack ? runtime : null;
  const track = liveRuntime?.currentTrack ?? null;
  const reveal = liveRuntime?.revealState ?? null;
  const showDesignPlaceholders = !runtime;

  /*
   * Default every reveal to hidden until the runtime/reveal state has loaded.
   * Before the first sync `reveal` is null; defaulting to `true` previously
   * flashed the album cover (and title/artist) before their scheduled reveal
   * points. Once the 2s poll provides `revealState`, gating takes over.
   */
  const showAlbum = reveal?.showAlbum ?? false;
  const showTitle = reveal?.showTitle ?? false;
  const showArtist = reveal?.showArtist ?? false;
  const titleText = track && showTitle ? track.title : "";
  const artistText = track && showArtist ? track.artist : "";
  const titleFontSize = titleText ? fitTitleSize(titleText) : 130;
  const artistFontSize = artistText ? fitArtistSize(artistText) : 56;

  /*
   * "Next song" countdown — interpolated client-side so it ticks smoothly
   * between polls rather than jumping every ~2s. `nextMs` is the configured
   * advance point; the remaining time and bar fill are derived from the live
   * (interpolated) progress. Falls back to the static design value when there
   * is no live track yet.
   */
  const liveProgressMs = useLiveProgressMs(liveRuntime);
  const playsInFull = Boolean(track && liveRuntime?.freePlay);
  const isChallenge = Boolean(track && liveRuntime?.isChallengeSong);
  const baseRevealConfig = isChallenge
    ? CHALLENGE_REVEAL_CONFIG
    : liveRuntime?.revealConfig ?? DEFAULT_REVEAL_CONFIG;
  const revealConfig = getRevealConfigWithExtension(baseRevealConfig, liveRuntime?.extensionMs ?? 0);
  const nextMs = revealConfig.nextMs;
  const hasLiveCountdown = !playsInFull && liveProgressMs !== null && nextMs > 0;
  const remainingMs = hasLiveCountdown ? Math.max(0, nextMs - liveProgressMs) : 0;
  const nextFillPct = hasLiveCountdown
    ? Math.min(100, Math.max(0, (liveProgressMs / nextMs) * 100))
    : 0;
  const nextLabel = hasLiveCountdown ? formatCountdown(remainingMs) : "0:08";

  /** Inline style for a lit reveal badge. */
  const badgeLit: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 22px",
    borderRadius: 999,
    background: "rgb(var(--brand-accent-rgb) / .18)",
    border: "2px solid var(--brand-accent)",
    fontSize: 22,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: ".1em",
    color: "var(--brand-accent-light)",
  };

  /** Inline style for a dim (not-yet-revealed) badge. */
  const badgeDim: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 22px",
    borderRadius: 999,
    background: "rgba(0,0,0,.2)",
    border: "2px solid rgba(246,239,221,.15)",
    fontSize: 22,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: ".1em",
    color: "rgba(246,239,221,.35)",
  };

  const badges: Array<[string, boolean]> = [
    ["Album", showAlbum],
    ["Title", showTitle],
    ["Artist", showArtist],
  ];

  if (isChallenge) {
    const challenge = challengePresentation(liveRuntime?.challengeType ?? null);
    const bonusPoints = liveRuntime?.challengeBonusPoints ?? DEFAULT_CHALLENGE_BONUS_POINTS;
    const challengeTitleFontSize = titleText ? Math.min(124, fitTitleSize(titleText)) : 124;
    const challengeArtistFontSize = artistText ? Math.min(54, fitArtistSize(artistText)) : 54;
    const challengeBadgeLit: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 22px",
      borderRadius: 999,
      background: "rgb(255 255 255 / .14)",
      border: "2px solid rgb(var(--brand-accent-light-rgb) / .86)",
      fontSize: 22,
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: ".1em",
      color: "#fff6dd",
    };
    const challengeBadgeDim: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 22px",
      borderRadius: 999,
      background: "rgb(0 0 0 / .22)",
      border: "2px solid rgb(255 255 255 / .18)",
      fontSize: 22,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: ".1em",
      color: "rgb(255 255 255 / .44)",
    };

    return (
      <div
        className={`screen grain vignette ${challenge.className}`}
        style={{ padding: "56px 110px 96px", flexDirection: "row", alignItems: "center", gap: 90 }}
      >
        <div style={{ flex: "0 0 600px", display: "grid", placeItems: "center" }}>
          <div className="an-pop d2">
            <AlbumArt
              size={600}
              imageUrl={track && showAlbum ? track.albumImageUrl : null}
              revealed={showAlbum}
            />
          </div>
        </div>

        <div className="col" style={{ flex: 1, gap: 20, minWidth: 0, color: "#fff" }}>
          <div
            className="an-rise d1"
            style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}
          >
            <span aria-hidden style={{ fontSize: 60, lineHeight: 1 }}>{challenge.icon}</span>
            <span
              style={{
                fontFamily: "var(--brand-display), Impact, sans-serif",
                fontSize: 70,
                lineHeight: .92,
                textTransform: "uppercase",
                color: "#fff",
              }}
            >
              {challenge.label}
            </span>
            <span
              className="bonus-glow"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "16px 28px",
                borderRadius: 999,
                background: "linear-gradient(180deg, #fff6dd 0%, var(--brand-accent-light) 45%, var(--brand-accent) 100%)",
                color: "var(--ink)",
                fontSize: 26,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: ".08em",
              }}
            >
              +{bonusPoints} Bonus Points
            </span>
          </div>

          <p
            className="an-rise d2"
            style={{ margin: 0, color: "#fff", fontSize: 36, fontWeight: 800, lineHeight: 1.15 }}
          >
            {challenge.instruction}
          </p>

          <h1
            className="display display--gold an-rise d3"
            style={{
              fontSize: challengeTitleFontSize,
              lineHeight: challengeTitleFontSize < 100 ? 0.98 : 0.92,
              maxWidth: "100%",
              overflowWrap: "anywhere",
              whiteSpace: "normal",
            }}
          >
            {track && showTitle ? (
              <span style={{ display: "block", overflowWrap: "anywhere", whiteSpace: "normal" }}>
                {track.title}
              </span>
            ) : (
              <span style={{ display: "block", opacity: 0, whiteSpace: "normal" }}>&#8203;</span>
            )}
          </h1>

          <p
            className="an-rise d4"
            style={{
              fontSize: challengeArtistFontSize,
              fontWeight: 800,
              lineHeight: 1.08,
              margin: 0,
              maxWidth: "100%",
              color: "#fff",
              overflowWrap: "anywhere",
              whiteSpace: "normal",
            }}
          >
            {track && showArtist ? (
              <span style={{ display: "block", overflowWrap: "anywhere", whiteSpace: "normal" }}>
                {track.artist}
              </span>
            ) : (
              <span style={{ display: "block", opacity: 0, whiteSpace: "normal" }}>&#8203;</span>
            )}
          </p>

          <div
            className="an-rise d5"
            style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}
          >
            {badges.map(([label, lit]) => (
              <span key={label} style={lit ? challengeBadgeLit : challengeBadgeDim}>
                ✓ {label}
              </span>
            ))}
            <span
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 24px",
                borderRadius: 999,
                background: "rgba(0,0,0,.3)",
                border: "2px solid rgba(255,255,255,.34)",
                fontSize: 22,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: ".1em",
                overflow: "hidden",
                color: "#fff",
              }}
            >
              {hasLiveCountdown && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${nextFillPct}%`,
                    background: "rgb(var(--brand-accent-rgb) / .22)",
                    transition: "width 1s linear",
                    pointerEvents: "none",
                  }}
                />
              )}
              <span
                style={{
                  position: "relative",
                  zIndex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Eq bars={4} style={{ height: 22 }} />{" "}
                {playsInFull ? "Plays in full" : `Next song · ${nextLabel}`}
              </span>
            </span>
          </div>
        </div>

        <Chrome
          left={
            <>
              <Editable field="venueName" placeholder={brand.name} /> · {challenge.label}
            </>
          }
          right="Join In For Points"
        />
      </div>
    );
  }

  return (
    <div
      className="screen grain vignette"
      style={{ padding: "60px 110px 96px", flexDirection: "row", alignItems: "center", gap: 90 }}
    >
      {/* Album art column */}
      <div style={{ flex: "0 0 600px", display: "grid", placeItems: "center" }}>
        <div className="an-pop d2">
          {/*
           * Only hand the real artwork URL to AlbumArt once the album reveal has
           * fired. AlbumArt renders the image whenever `imageUrl` is truthy
           * (regardless of `revealed`), so passing it early would leak the cover
           * before its scheduled reveal. When no live track, fall back to the
           * revealed placeholder visual (the design's static view).
           */}
          <AlbumArt
            size={600}
            imageUrl={track && showAlbum ? track.albumImageUrl : null}
            revealed={showAlbum || showDesignPlaceholders}
          />
        </div>
      </div>

      {/* Info column */}
      <div className="col" style={{ flex: 1, gap: 22, minWidth: 0 }}>
        {/* Game badge + theme row */}
        <div className="an-rise d1" style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Ball n={game} size={76} />
          <div>
            <div
              style={{
                fontSize: 18,
                letterSpacing: ".26em",
                textTransform: "uppercase",
                color: "var(--brand-accent-light)",
                fontWeight: 700,
              }}
            >
              Game {game} · Now Playing
            </div>
            <div style={{ fontSize: 26, fontWeight: 600 }} className="muted">
              Theme —{" "}
              <Editable
                field={themeField}
                placeholder={themePH}
                style={{ color: "var(--cream)", fontWeight: 700 }}
              />
            </div>
          </div>
        </div>

        {/* Track title — live or placeholder */}
        <h1
          className="display display--gold an-rise d2"
          style={{
            fontSize: titleFontSize,
            lineHeight: titleFontSize < 100 ? 0.98 : 0.92,
            maxWidth: "100%",
            overflowWrap: "anywhere",
            whiteSpace: "normal",
          }}
        >
          {track && showTitle ? (
            <span style={{ display: "block", overflowWrap: "anywhere", whiteSpace: "normal" }}>
              {track.title}
            </span>
          ) : track && !showTitle ? (
            /* Title not yet revealed — show nothing but hold layout space */
            <span style={{ display: "block", opacity: 0, whiteSpace: "normal" }}>&#8203;</span>
          ) : showDesignPlaceholders ? (
            <Editable
              field={`${t}title`}
              placeholder="Mr. Brightside"
              style={{ display: "block", overflowWrap: "anywhere", whiteSpace: "normal" }}
            />
          ) : (
            <span style={{ display: "block", opacity: 0, whiteSpace: "normal" }}>&#8203;</span>
          )}
        </h1>

        {/* Track artist — live or placeholder */}
        <p
          className="an-rise d3"
          style={{
            fontSize: artistFontSize,
            fontWeight: 700,
            lineHeight: 1.1,
            margin: 0,
            maxWidth: "100%",
            color: "var(--cream)",
            overflowWrap: "anywhere",
            whiteSpace: "normal",
          }}
        >
          {track && showArtist ? (
            <span style={{ display: "block", overflowWrap: "anywhere", whiteSpace: "normal" }}>
              {track.artist}
            </span>
          ) : track && !showArtist ? (
            /* Artist not yet revealed */
            <span style={{ display: "block", opacity: 0, whiteSpace: "normal" }}>&#8203;</span>
          ) : showDesignPlaceholders ? (
            <Editable
              field={`${t}artist`}
              placeholder="The Killers"
              style={{ display: "block", overflowWrap: "anywhere", whiteSpace: "normal" }}
            />
          ) : (
            <span style={{ display: "block", opacity: 0, whiteSpace: "normal" }}>&#8203;</span>
          )}
        </p>

        {/* Reveal timeline badges */}
        {(track || showDesignPlaceholders) && (
          <div
            className="an-rise d4"
            style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}
          >
            {badges.map(([label, lit]) => (
              <span key={label} style={lit ? badgeLit : badgeDim}>
                ✓ {label}
              </span>
            ))}
            {/*
             * "Next song" countdown — live and interpolated. The label counts
             * down each second; the inner fill animates smoothly (CSS width
             * transition) so it glides between the 1s ticks and ~2s polls rather
             * than jumping.
             */}
            <span
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 24px",
                borderRadius: 999,
                background: "rgba(0,0,0,.3)",
                border: "2px solid rgba(246,239,221,.3)",
                fontSize: 22,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".1em",
                overflow: "hidden",
              }}
            >
              {/* Progress fill — only shown when a live countdown is available. */}
              {hasLiveCountdown && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${nextFillPct}%`,
                    background: "rgb(var(--brand-accent-rgb) / .18)",
                    transition: "width 1s linear",
                    pointerEvents: "none",
                  }}
                />
              )}
              <span
                style={{
                  position: "relative",
                  zIndex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Eq bars={4} style={{ height: 22 }} />{" "}
                {playsInFull ? "Plays in full" : `Next song · ${nextLabel}`}
              </span>
            </span>
          </div>
        )}
      </div>

      <Chrome
        left={
          <>
            <Editable field="venueName" placeholder={brand.name} /> · Game {game}
          </>
        }
        right="Eyes Down"
      />
    </div>
  );
}
