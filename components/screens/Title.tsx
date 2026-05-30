"use client";

import type { ScreenProps } from "@/components/screens/types";
import type { BrandConfig } from "@/lib/brands/types";
import { Sunburst } from "@/components/motifs/Sunburst";
import { Vinyl } from "@/components/motifs/Vinyl";
import { Chrome } from "@/components/motifs/Chrome";
import { Editable } from "@/components/motifs/Editable";

/**
 * "Music Bingo Title / Logo Hero" screen — three layout variants (A/B/C).
 *
 * Variant A: clean spotlight with hero centred on a large sunburst.
 * Variant B: marquee-framed card with dot-grid overlay.
 * Variant C: flanking vinyl records with hero centred between them.
 *
 * The hero image uses `brand.event_logo_url` (the app's equivalent of the
 * design source's `brand.eventLogoGold`). When absent, a styled wordmark
 * fallback is rendered instead.
 */
/** Hero image or wordmark fallback — shared across all three Title variants. */
function TitleHero({ brand, max }: { brand: BrandConfig; max: number }): JSX.Element {
  if (brand.event_logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.event_logo_url}
        alt="Music Bingo"
        style={{
          width: max,
          maxWidth: "92%",
          filter: "drop-shadow(0 24px 60px rgba(0,0,0,.55))",
        }}
        className="an-pop d2"
      />
    );
  }
  return (
    <div className="an-pop d2" style={{ textAlign: "center" }}>
      <div
        className="display display--gold"
        style={{ fontSize: 300, lineHeight: 0.94 }}
      >
        Music
        <br />
        Bingo
      </div>
    </div>
  );
}

export function Title({ brand, variant = "A" }: ScreenProps): JSX.Element {
  /* ── Variant B: marquee-framed card ─────────────────────── */
  if (variant === "B") {
    return (
      <div
        className="screen grain vignette center-all"
        style={{ padding: 60 }}
      >
        <Sunburst
          size={1700}
          style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}
        />
        <div
          className="an-pop d1"
          style={{
            position: "relative",
            zIndex: 2,
            padding: "60px 80px",
            borderRadius: 30,
            border: "3px solid var(--brand-accent)",
            background: "rgba(0,0,0,.3)",
            boxShadow:
              "0 0 0 12px rgb(var(--brand-primary-rgb) / .6), 0 40px 120px rgba(0,0,0,.6)",
          }}
        >
          {/* Dot-grid bulb overlay */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 13,
              borderRadius: 20,
              pointerEvents: "none",
              background:
                "radial-gradient(circle, var(--brand-accent-light) 0 2.6px, transparent 3.2px) 0 0/42px 42px",
              WebkitMaskImage: "linear-gradient(#000 0 0)",
              opacity: 0.85,
              maskComposite: "exclude",
            }}
          />
          <TitleHero brand={brand} max={1100} />
        </div>
        <Chrome
          left={<Editable field="venueName" placeholder={brand.name} />}
          right="Game On"
        />
      </div>
    );
  }

  /* ── Variant C: flanking vinyls ─────────────────────────── */
  if (variant === "C") {
    return (
      <div
        className="screen grain vignette center-all"
        style={{ padding: 40, overflow: "hidden" }}
      >
        <Vinyl
          size={680}
          spin
          style={{ position: "absolute", left: -230, bottom: -200, opacity: 0.55 }}
        />
        <Vinyl
          size={520}
          spin
          style={{ position: "absolute", right: -150, top: -160, opacity: 0.5 }}
        />
        <div
          className="col center-all"
          style={{ position: "relative", zIndex: 2, gap: 8 }}
        >
          <div className="kicker an-rise d1">It&apos;s Time For</div>
          <TitleHero brand={brand} max={1080} />
          <div className="pill an-rise d4" style={{ marginTop: 6 }}>
            <Editable
              field="titleTagline"
              placeholder="Five Lines · One Full House · Two Games"
            />
          </div>
        </div>
        <Chrome
          left={<Editable field="venueName" placeholder={brand.name} />}
          right="Game On"
        />
      </div>
    );
  }

  /* ── Variant A: clean spotlight (default) ───────────────── */
  return (
    <div
      className="screen grain vignette center-all"
      style={{ padding: 60 }}
    >
      <Sunburst
        size={1800}
        style={{ top: "48%", left: "50%", transform: "translate(-50%,-50%)" }}
      />
      <div
        className="col center-all"
        style={{ position: "relative", zIndex: 2, gap: 18 }}
      >
        <TitleHero brand={brand} max={1180} />
        <div className="pill an-rise d4" style={{ marginTop: 4 }}>
          <Editable
            field="titleTagline"
            placeholder="Five Lines · One Full House · Two Games"
          />
        </div>
      </div>
      <Chrome
        left={<Editable field="venueName" placeholder={brand.name} />}
        right="Game On"
      />
    </div>
  );
}
