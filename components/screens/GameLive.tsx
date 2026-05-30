"use client";

import type { ScreenProps } from "@/components/screens/types";
import { Editable } from "@/components/motifs/Editable";
import { Ball } from "@/components/motifs/Ball";
import { Eq } from "@/components/motifs/Eq";
import { Chrome } from "@/components/motifs/Chrome";
import { AlbumArt } from "@/components/screens/AlbumArt";

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

  /* When no runtime, treat everything as revealed (matches source static view). */
  const showAlbum = reveal ? reveal.showAlbum : true;
  const showTitle = reveal ? reveal.showTitle : true;
  const showArtist = reveal ? reveal.showArtist : true;

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
          {/* Show real artwork when runtime is present; placeholder when not */}
          <AlbumArt
            size={600}
            imageUrl={track ? track.albumImageUrl : null}
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
          {/* "Next song" countdown — static in Phase 1 */}
          <span
            style={{
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
            }}
          >
            <Eq bars={4} style={{ height: 22 }} /> Next song · 0:08
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
