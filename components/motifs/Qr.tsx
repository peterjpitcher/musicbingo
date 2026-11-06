"use client";

import { useEffect, useState, type ReactElement } from "react";
import QRCode from "qrcode";

export type QrProps = {
  /** URL or text to encode. An empty value renders nothing (never a placeholder code). */
  value: string;
  /** Pixel dimensions of the rendered square. Defaults to 320. */
  size?: number;
  /** Background / light module colour. Defaults to the cream brand token. */
  light?: string;
  /** Foreground / dark module colour. Defaults to the deep-green brand token. */
  dark?: string;
};

/**
 * Renders a QR code client-side using the installed `qrcode` npm package.
 *
 * Generates an SVG string asynchronously in a useEffect and injects it via
 * dangerouslySetInnerHTML. Shows an empty rounded square while the SVG is
 * being generated so layout does not shift. An empty value renders nothing:
 * a QR code that points somewhere invented is worse than no QR code.
 */
export function Qr({
  value,
  size = 320,
  light = "#F6EFDD",
  dark = "#04130C",
}: QrProps): ReactElement | null {
  const text = (value ?? "").trim();
  // Keyed by the text it was made from, so a stale code is never shown for a
  // new value while the new one is generated.
  const [rendered, setRendered] = useState<{ key: string; svg: string } | null>(null);
  const key = `${text}|${light}|${dark}`;
  const svg = rendered?.key === key ? rendered.svg : null;

  useEffect(() => {
    let cancelled = false;
    if (!text) return;

    QRCode.toString(text, {
      type: "svg",
      margin: 1,
      color: { dark, light },
    })
      .then((result) => {
        if (!cancelled) setRendered({ key: `${text}|${light}|${dark}`, svg: result });
      })
      .catch(() => {
        /* Silently swallow generation errors; the empty state remains visible. */
      });

    return () => {
      cancelled = true;
    };
  }, [text, light, dark]);

  if (!text) return null;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        overflow: "hidden",
        background: light,
        display: "block",
        flexShrink: 0,
      }}
      /* dangerouslySetInnerHTML is safe here: the SVG is generated locally by
         the qrcode library from a known URL string, not from user HTML. */
      {...(svg ? { dangerouslySetInnerHTML: { __html: svg } } : {})}
    />
  );
}
