"use client";

import { Vinyl } from "@/components/motifs/Vinyl";
import { Eq } from "@/components/motifs/Eq";

export type NowPlayingProps = {
  /** Label shown above the track title (defaults to "Now Playing"). */
  label?: string;
  /** The playing song's title, from the runtime (never a sample). */
  title: string;
  /** The playing song's artist, from the runtime. */
  artist: string;
};

/**
 * Shared "now playing" strip used by Welcome and warm-up screens.
 * Renders a pill containing a spinning vinyl, track/artist text, and an EQ bar.
 * Callers show it only while a real song is playing (spec M-7).
 */
export function NowPlaying({
  label = "Now Playing",
  title,
  artist,
}: NowPlayingProps): React.JSX.Element {
  return (
    <div
      className="an-rise d5"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 26,
        padding: "20px 34px",
        borderRadius: 999,
        border: "2px solid color-mix(in srgb, var(--anchor-gold-bright) 55%, transparent)",
        background: "rgba(0,0,0,.28)",
        backdropFilter: "blur(6px)",
        maxWidth: "100%",
      }}
    >
      <Vinyl size={70} />
      <div style={{ minWidth: 0, textAlign: "left" }}>
        <div
          style={{
            fontSize: 32,
            letterSpacing: ".26em",
            textTransform: "uppercase",
            color: "var(--anchor-gold-bright)",
            fontWeight: 700,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 38,
            fontWeight: 700,
            lineHeight: 1.12,
            maxWidth: 880,
            overflowWrap: "anywhere",
            whiteSpace: "normal",
          }}
        >
          <span style={{ overflowWrap: "anywhere", whiteSpace: "normal" }}>{title}</span>
          <span style={{ opacity: 0.45, margin: "0 12px" }}>·</span>
          <span style={{ fontWeight: 500, opacity: 0.8, overflowWrap: "anywhere", whiteSpace: "normal" }}>
            {artist}
          </span>
        </div>
      </div>
      <Eq bars={7} style={{ flexShrink: 0, height: 44 }} />
    </div>
  );
}
