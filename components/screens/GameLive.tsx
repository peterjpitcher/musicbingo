"use client";

import { useEffect, useMemo, useState } from "react";

import type { ScreenProps } from "@/components/screens/types";
import type { LiveRuntimeState } from "@/lib/live/types";
import { DEFAULT_REVEAL_CONFIG } from "@/lib/live/types";
import { Editable } from "@/components/motifs/Editable";
import { Ball } from "@/components/motifs/Ball";
import { Eq } from "@/components/motifs/Eq";
import { Chrome } from "@/components/motifs/Chrome";
import { AlbumArt } from "@/components/screens/AlbumArt";

/**
 * Smoothly interpolates the playing track's `progressMs` between the ~2s server
 * polls so the "Next song" countdown/bar ticks live instead of jumping. Mirrors
 * the guest page's `useInterpolatedProgress` so the bar behaves identically on
 * the guest TV and the host preview (both render this component via the
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

  const track = runtime?.currentTrack ?? null;
  const reveal = runtime?.revealState ?? null;

  /*
   * Default every reveal to hidden until the runtime/reveal state has loaded.
   * Before the first sync `reveal` is null; defaulting to `true` previously
   * flashed the album cover (and title/artist) before their scheduled reveal
   * points. Once the 2s poll provides `revealState`, gating takes over.
   */
  const showAlbum = reveal?.showAlbum ?? false;
  const showTitle = reveal?.showTitle ?? false;
  const showArtist = reveal?.showArtist ?? false;

  /*
   * "Next song" countdown — interpolated client-side so it ticks smoothly
   * between polls rather than jumping every ~2s. `nextMs` is the configured
   * advance point; the remaining time and bar fill are derived from the live
   * (interpolated) progress. Falls back to the static design value when there
   * is no live track yet.
   */
  const liveProgressMs = useLiveProgressMs(runtime);
  const nextMs = runtime?.revealConfig?.nextMs ?? DEFAULT_REVEAL_CONFIG.nextMs;
  const hasLiveCountdown = liveProgressMs !== null && nextMs > 0;
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
            revealed={showAlbum || !track}
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
          style={{ fontSize: 130, lineHeight: 0.92 }}
        >
          {track && showTitle ? (
            <span>{track.title}</span>
          ) : track && !showTitle ? (
            /* Title not yet revealed — show nothing but hold layout space */
            <span style={{ opacity: 0 }}>&#8203;</span>
          ) : (
            <Editable field={`${t}title`} placeholder="Mr. Brightside" />
          )}
        </h1>

        {/* Track artist — live or placeholder */}
        <p
          className="an-rise d3"
          style={{ fontSize: 56, fontWeight: 700, margin: 0, color: "var(--cream)" }}
        >
          {track && showArtist ? (
            <span>{track.artist}</span>
          ) : track && !showArtist ? (
            /* Artist not yet revealed */
            <span style={{ opacity: 0 }}>&#8203;</span>
          ) : (
            <Editable field={`${t}artist`} placeholder="The Killers" />
          )}
        </p>

        {/* Reveal timeline badges */}
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
              <Eq bars={4} style={{ height: 22 }} /> Next song · {nextLabel}
            </span>
          </span>
        </div>
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
