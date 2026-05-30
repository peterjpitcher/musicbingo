"use client";

import { useEffect, useRef, useState } from "react";
import { BrandProvider } from "@/components/brand/BrandProvider";
import { EditContext, type EditContextValue } from "@/components/motifs/EditContext";
import { Welcome } from "@/components/screens/Welcome";
import type { BrandConfig } from "@/lib/brands/types";
import type { ScreenVariant } from "@/components/screens/types";

/** Props for the live brand preview pane used in the brands editor. */
export interface BrandPreviewPaneProps {
  /** The brand draft to preview — re-render this component to update the preview live. */
  brand: BrandConfig;
  /** Welcome screen layout variant to display. Defaults to "A". */
  variant?: ScreenVariant;
}

/**
 * Read-only EditContext value — no editing, no persistence.
 * Passes fallback strings through so screens render their placeholder text.
 */
const READ_ONLY_EDIT_CTX: EditContextValue = {
  editing: false,
  get: (_key: string, fallback?: string): string => fallback ?? "",
  set: (): void => {},
};

/**
 * Renders a scaled 1920×1080 TV preview of the Welcome screen for the given
 * brand draft. Used in the right pane of the brands editor so changes to the
 * form are reflected live without any network round-trips.
 *
 * Scaling mirrors the host page (`app/host/[sessionId]/page.tsx`): a
 * ResizeObserver measures the container width and applies `scale(width/1920)`
 * to the `.tv-canvas` element, which has `transform-origin: top left`.
 */
export function BrandPreviewPane({ brand, variant = "A" }: BrandPreviewPaneProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number>(0.27);

  // Recompute scale whenever the container resizes — identical to host page.
  useEffect(() => {
    const fit = (): void => {
      if (containerRef.current) {
        setScale(containerRef.current.clientWidth / 1920);
      }
    };

    fit();

    const ro = new ResizeObserver(fit);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", fit);

    return (): void => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <BrandProvider brand={brand}>
      <EditContext.Provider value={READ_ONLY_EDIT_CTX}>
        {/*
         * Container div: holds the scaled canvas and sizes itself to the
         * correct aspect-ratio height (1080/1920 = 56.25 %) so the parent
         * pane doesn't collapse. The `overflow: hidden` trims any fractional
         * pixel bleed at the edges.
         */}
        <div
          ref={containerRef}
          style={{ position: "relative", width: "100%", paddingBottom: "56.25%", overflow: "hidden" }}
        >
          {/*
           * `.tv-canvas` — reused from globals.css.
           * position: absolute; top/left: 0; width: 1920px; height: 1080px;
           * transform-origin: top left.
           * We apply the computed scale so the 1920×1080 stage fits the container.
           */}
          <div
            className="tv-canvas"
            style={{ transform: `scale(${scale})` }}
          >
            <Welcome brand={brand} variant={variant} runtime={null} />
          </div>
        </div>
      </EditContext.Provider>
    </BrandProvider>
  );
}
