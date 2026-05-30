"use client";

import type { ScreenProps } from "@/components/screens/types";
import { Editable } from "@/components/motifs/Editable";
import { Sunburst } from "@/components/motifs/Sunburst";
import { Eq } from "@/components/motifs/Eq";
import { Chrome } from "@/components/motifs/Chrome";
import { AlbumArt } from "@/components/screens/AlbumArt";

/**
 * Warm-up screen shown before Game 1 (dance) and Game 2 (sing).
 * Ported faithfully from docs/design/after-hours/screens-b.jsx — Warmup.
 *
 * Live wiring: if `runtime.currentTrack` is present the "Now Playing" pill
 * shows the live title/artist instead of the Editable placeholders.
 */
export function Warmup({
  brand,
  runtime,
  type = "dance",
}: ScreenProps & { type?: "dance" | "sing" }): JSX.Element {
  const dance = type === "dance";
  const track = runtime?.currentTrack ?? null;

  return (
    <div
      className={`screen grain vignette${dance ? " screen--warm" : ""}`}
      style={{ flexDirection: "row", alignItems: "center", padding: "0 130px" }}
    >
      {/* Decorative sunburst — positioned left for dance, right for sing */}
      <Sunburst
        size={1500}
        style={{
          left: dance ? "-300px" : "auto",
          right: dance ? "auto" : "-320px",
          top: "50%",
          transform: "translateY(-50%)",
          opacity: 0.4,
        }}
      />

      {/* Text column */}
      <div
        className="col"
        style={{
          flex: 1,
          position: "relative",
          zIndex: 2,
          gap: 22,
          order: dance ? 1 : 2,
          alignItems: dance ? "flex-start" : "flex-end",
          textAlign: dance ? "left" : "right",
        }}
      >
        <div className="pill an-rise d1">
          {dance ? "Game 1 · Warm Up" : "Game 2 · Warm Up"}
        </div>

        <h1
          className={`display an-rise d2${dance ? "" : " display--gold"}`}
          style={{ fontSize: dance ? 210 : 200, lineHeight: 0.9, color: dance ? "#04130C" : undefined }}
        >
          {dance ? (
            <>
              <span style={{ display: "block" }}>Get Up</span>
              <span style={{ display: "block" }}>&amp; Dance!</span>
            </>
          ) : (
            <>
              <span style={{ display: "block" }}>Time To</span>
              <span style={{ display: "block" }}>Sing Along!</span>
            </>
          )}
        </h1>

        <p
          className="lede an-rise d3"
          style={{ maxWidth: 760, color: dance ? "rgba(4,19,12,.82)" : undefined }}
        >
          {dance ? (
            <Editable
              field="danceLede"
              placeholder="On your feet — this one's just for fun. Game 1 starts the moment it ends."
            />
          ) : (
            <Editable
              field="singLede"
              placeholder="Lungs ready! A big sing-along to warm up. Game 2 kicks off right after."
            />
          )}
        </p>

        {/* "Now Playing" pill */}
        <div className="an-rise d4">
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 22,
              padding: "18px 30px",
              borderRadius: 999,
              background: dance ? "rgba(4,19,12,.16)" : "rgba(0,0,0,.3)",
              border: `2px solid ${dance ? "rgba(4,19,12,.3)" : "rgb(var(--brand-accent-light-rgb) / .55)"}`,
            }}
          >
            <Eq bars={6} style={{ height: 40 }} />
            <div style={{ textAlign: "left", color: dance ? "var(--ink)" : "var(--cream)" }}>
              <div
                style={{
                  fontSize: 14,
                  letterSpacing: ".24em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  opacity: 0.8,
                }}
              >
                Now Playing · Full Track
              </div>
              <div style={{ fontSize: 30, fontWeight: 700 }}>
                {/* Live track title — falls back to Editable placeholder when no runtime */}
                {track ? (
                  <span>{track.title}</span>
                ) : (
                  <Editable
                    field={dance ? "danceTitle" : "singTitle"}
                    placeholder={dance ? "Dancing Queen" : "Don't Look Back in Anger"}
                  />
                )}
                <span style={{ opacity: 0.5, margin: "0 10px" }}>·</span>
                {/* Live track artist — falls back to Editable placeholder when no runtime */}
                {track ? (
                  <span style={{ fontWeight: 500 }}>{track.artist}</span>
                ) : (
                  <Editable
                    field={dance ? "danceArtist" : "singArtist"}
                    placeholder={dance ? "ABBA" : "Oasis"}
                    style={{ fontWeight: 500 }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Album art column */}
      <div
        style={{
          flex: "0 0 600px",
          display: "grid",
          placeItems: "center",
          position: "relative",
          zIndex: 2,
          order: dance ? 2 : 1,
        }}
      >
        <div className="an-pop d2">
          <AlbumArt size={560} imageUrl={track?.albumImageUrl} />
        </div>
      </div>

      <Chrome
        left={dance ? "Dance Along" : "Sing Along"}
        right={<Editable field="venueName" placeholder={brand.name} />}
      />
    </div>
  );
}
