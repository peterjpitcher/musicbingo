"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export type QrProps = {
  /** URL or text to encode. Falls back to a placeholder when empty. */
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
 * being generated so layout does not shift.
 */
export function Qr({
  value,
  size = 320,
  light = "#F6EFDD",
  dark = "#04130C",
}: QrProps): JSX.Element {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    QRCode.toString(value || "https://example.com", {
      type: "svg",
      margin: 1,
      color: { dark, light },
    })
      .then((result) => {
        if (!cancelled) setSvg(result);
      })
      .catch(() => {
        /* Silently swallow generation errors; the empty state remains visible. */
      });

    return () => {
      cancelled = true;
    };
  }, [value, light, dark]);

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
