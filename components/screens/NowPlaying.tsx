"use client";

import { Vinyl } from "@/components/motifs/Vinyl";
import { Eq } from "@/components/motifs/Eq";
import { Editable } from "@/components/motifs/Editable";

export type NowPlayingProps = {
  /** Label shown above the track title (defaults to "Now Playing"). */
  label?: string;
  /** Editable store key for the track title. */
  titleField: string;
  /** Editable store key for the artist name. */
  artistField: string;
  /** Placeholder text for the track title. */
  titlePH: string;
  /** Placeholder text for the artist name. */
  artistPH: string;
};

/**
 * Shared "now playing" strip used by Welcome and warm-up screens.
 * Renders a pill containing a spinning vinyl, track/artist text, and an EQ bar.
 */
export function NowPlaying({
  label = "Now Playing",
  titleField,
  artistField,
  titlePH,
  artistPH,
}: NowPlayingProps): JSX.Element {
  return (
    <div
      className="an-rise d5"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 26,
        padding: "20px 34px",
        borderRadius: 999,
        border: "2px solid rgb(var(--brand-accent-light-rgb) / .55)",
        background: "rgba(0,0,0,.28)",
        backdropFilter: "blur(6px)",
        maxWidth: "100%",
      }}
    >
      <Vinyl size={70} />
      <div style={{ minWidth: 0, textAlign: "left" }}>
        <div
          style={{
            fontSize: 16,
            letterSpacing: ".26em",
            textTransform: "uppercase",
            color: "var(--brand-accent-light)",
            fontWeight: 700,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            lineHeight: 1.12,
            maxWidth: 880,
            overflowWrap: "anywhere",
            whiteSpace: "normal",
          }}
        >
          <Editable
            field={titleField}
            placeholder={titlePH}
            style={{ overflowWrap: "anywhere", whiteSpace: "normal" }}
          />
          <span style={{ opacity: 0.45, margin: "0 12px" }}>·</span>
          <Editable
            field={artistField}
            placeholder={artistPH}
            style={{ fontWeight: 500, opacity: 0.8, overflowWrap: "anywhere", whiteSpace: "normal" }}
          />
        </div>
      </div>
      <Eq bars={7} style={{ flexShrink: 0, height: 44 }} />
    </div>
  );
}
