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
}: AlbumArtProps): React.JSX.Element {
  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 22,
    position: "relative",
    overflow: "hidden",
    border: "4px solid color-mix(in srgb, var(--anchor-gold-bright) 80%, transparent)",
    boxShadow: "0 30px 80px rgba(0,0,0,.55)",
    display: "grid",
    placeItems: "center",
    background: imageUrl
      ? "var(--anchor-green)"
      : revealed
        ? "repeating-linear-gradient(135deg, var(--anchor-green-light) 0 22px, var(--anchor-green) 22px 44px)"
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
            fontFamily: "var(--font-outfit), system-ui, sans-serif",
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: ".18em",
            textTransform: "uppercase",
            color: "var(--tv-muted)",
          }}
        >
          Album art
        </span>
      )}
    </div>
  );
}
