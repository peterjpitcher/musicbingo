"use client";

import { Vinyl } from "@/components/motifs/Vinyl";

/**
 * Striped album-art placeholder. When `imageUrl` is supplied (live Spotify
 * artwork), it renders a real `<img>` instead of the striped gradient.
 * Ported faithfully from docs/design/after-hours/screens-b.jsx — AlbumArt.
 */
export type AlbumArtProps = {
  size?: number;
  revealed?: boolean;
  /** Live Spotify album artwork URL. When present, shown instead of the placeholder visual. */
  imageUrl?: string | null;
};

export function AlbumArt({
  size = 560,
  revealed = true,
  imageUrl,
}: AlbumArtProps): JSX.Element {
  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 22,
    position: "relative",
    overflow: "hidden",
    border: "4px solid rgb(var(--brand-accent-light-rgb) / .8)",
    boxShadow: "0 30px 80px rgba(0,0,0,.55)",
    display: "grid",
    placeItems: "center",
    background: imageUrl
      ? "var(--brand-primary)"
      : revealed
        ? "repeating-linear-gradient(135deg, rgb(var(--brand-primary-light-rgb)) 0 22px, rgb(var(--brand-primary-rgb)) 22px 44px)"
        : "rgba(0,0,0,.3)",
  };

  return (
    <div style={containerStyle}>
      {imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageUrl}
          alt="Album artwork"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : revealed ? (
        <Vinyl size={size * 0.52} />
      ) : (
        <span
          style={{
            fontFamily: "ui-monospace,monospace",
            fontSize: 22,
            letterSpacing: ".2em",
            color: "var(--cream-dim)",
          }}
        >
          ALBUM ART
        </span>
      )}
      {/* Watermark shown only in placeholder mode */}
      {!imageUrl && (
        <span
          style={{
            position: "absolute",
            bottom: 14,
            right: 16,
            fontFamily: "ui-monospace,monospace",
            fontSize: 13,
            letterSpacing: ".18em",
            color: "rgba(246,239,221,.5)",
          }}
        >
          SPOTIFY ARTWORK
        </span>
      )}
    </div>
  );
}
