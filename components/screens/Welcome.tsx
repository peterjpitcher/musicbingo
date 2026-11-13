"use client";

import type { ScreenProps } from "@/components/screens/types";
import { Sunburst } from "@/components/motifs/Sunburst";
import { Vinyl } from "@/components/motifs/Vinyl";
import { VenueLogo } from "@/components/motifs/VenueLogo";
import { Chrome } from "@/components/motifs/Chrome";
import { Editable } from "@/components/motifs/Editable";
import { useEdit } from "@/components/motifs/EditContext";
import { NowPlaying } from "@/components/screens/NowPlaying";
import { usePromo } from "@/components/promo/PromoProvider";
import { usePromoClock } from "@/components/promo/PromoLoop";
import { welcomeWhen } from "@/lib/live/welcomeWhen";

/**
 * Welcome screen — three layout variants (A/B/C).
 *
 * Variant A: spotlight centre-aligned with sunburst.
 * Variant B: split-panel — text left, spinning vinyl right.
 * Variant C: marquee-framed card centred on a sunburst.
 */
export function Welcome({ brand, runtime, variant = "A", eventDateInput = null }: ScreenProps): React.JSX.Element {
  // The host's name is only shown when the host typed it; the copy reads
  // naturally without it. While editing, the empty slot stays clickable.
  const { editing, get } = useEdit();
  const hostName = get("hostName", "").trim();
  const showHostName = Boolean(hostName) || editing;
  const hostNameEl = (
    <b style={{ color: "var(--anchor-gold-bright)" }}>
      <Editable optional field="hostName" placeholder="Host name" />
    </b>
  );
  // The "Now Playing" pill only appears while the welcome song is actually
  // the live, playing track, and names that song. With no runtime (the venue
  // page's preview) there is no pill: never a sample song (spec M-7).
  const welcomeSong = runtime?.welcomeSong ?? null;
  const current = runtime?.currentTrack ?? null;
  const showNowPlaying = Boolean(welcomeSong && current?.isPlaying && current.trackId === welcomeSong.trackId);
  const nowPlaying = showNowPlaying ? (
    <NowPlaying title={current?.title || welcomeSong?.title || ""} artist={current?.artist || welcomeSong?.artist || ""} />
  ) : null;

  // The "when" in the corner: what the host typed, else the game's real date
  // and start time (lib/live/welcomeWhen.ts), else nothing. Never a sample.
  const { feed } = usePromo();
  const nowMs = usePromoClock();
  const typedWhen = get("welcomeDate", "").trim();
  const autoWhen = welcomeWhen({ eventDateInput, feed, nowMs });
  const whenEl = editing ? (
    <Editable optional field="welcomeDate" placeholder={autoWhen || "Date and time"} />
  ) : (
    typedWhen || autoWhen
  );

  /* ── Variant B: split panel ─────────────────────────────── */
  if (variant === "B") {
    return (
      <div
        className="screen grain vignette"
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        {/* Left column */}
        <div
          className="col"
          style={{ flex: 1, padding: "0 0 0 130px", gap: 30, position: "relative", zIndex: 2 }}
        >
          <VenueLogo brand={brand} />
          <div className="tv-kicker an-rise d1">
            Tonight at <Editable field="venueName" placeholder={brand.name} />
          </div>
          <h1 className="display display--gold an-rise d2" style={{ fontSize: 230 }}>
            <Editable as="div" field="welcomeTitle" placeholder="Music" />
            <Editable as="div" field="welcomeTitle2" placeholder="Bingo" />
          </h1>
          <p className="lede an-rise d3" style={{ maxWidth: 720 }}>
            <Editable
              field="welcomeLede"
              placeholder="Grab a drink, find your table and settle in — your host"
            />
            {showHostName && <>{" "}{hostNameEl}</>}{" "}
            is about to take the mic.
          </p>
          {showNowPlaying && (
            <div className="an-rise d4" style={{ marginTop: 10 }}>
              {nowPlaying}
            </div>
          )}
        </div>

        {/* Right panel — vinyl hero */}
        <div
          style={{
            flex: "0 0 740px",
            position: "relative",
            height: "100%",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Sunburst size={1100} style={{ right: -260 }} />
          <div className="an-pop d2" style={{ position: "relative" }}>
            <Vinyl size={620} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  width: 210,
                  height: 210,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background:
                    "radial-gradient(circle,var(--anchor-gold-bright),var(--anchor-gold))",
                  color: "var(--anchor-green-deep)",
                  fontFamily: "var(--font-dm-serif), serif",
                  fontSize: 38,
                  textAlign: "center",
                  lineHeight: 0.92,
                  boxShadow: "inset 0 0 0 5px rgba(0,0,0,.25)",
                }}
              >
                MUSIC
                <br />
                BINGO
              </div>
            </div>
          </div>
        </div>

        <Chrome
          left="Welcome"
          right={whenEl}
        />
      </div>
    );
  }

  /* ── Variant C: marquee card ────────────────────────────── */
  if (variant === "C") {
    return (
      <div
        className="screen grain vignette center-all"
        style={{ padding: 70 }}
      >
        <Sunburst
          size={1500}
          style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}
        />
        <div
          className="an-pop d1"
          style={{
            position: "relative",
            zIndex: 2,
            width: 1320,
            padding: "78px 80px",
            borderRadius: 28,
            textAlign: "center",
            background: "linear-gradient(180deg, rgba(0,0,0,.42), rgba(0,0,0,.28))",
            border: "3px solid var(--anchor-gold)",
            boxShadow:
              "0 0 0 14px color-mix(in srgb, var(--anchor-green) 70%, transparent), 0 40px 100px rgba(0,0,0,.6)",
          }}
        >
          {/* Bulb dot grid overlay */}
          <div
            className="bulb-row"
            aria-hidden
            style={{
              position: "absolute",
              inset: "14px",
              borderRadius: 18,
              background:
                "radial-gradient(circle, var(--anchor-gold-bright) 0 2.4px, transparent 3px) 0 0/40px 40px",
              opacity: 0.8,
              maskImage: "linear-gradient(#000,#000)",
              pointerEvents: "none",
              WebkitMaskImage: "none",
            }}
          />
          <div style={{ position: "relative" }}>
            <VenueLogo brand={brand} />
            <div
              className="tv-kicker tv-kicker--plain an-rise d2"
              style={{ justifyContent: "center", marginTop: 20 }}
            >
              ★ &nbsp; Tonight &nbsp; ★
            </div>
            <h1
              className="display display--gold an-rise d3"
              style={{ fontSize: 168, margin: "12px 0 6px" }}
            >
              <Editable field="welcomeTitleC" placeholder="Welcome To The Show" />
            </h1>
            <p className="lede an-rise d4" style={{ maxWidth: 900, margin: "0 auto" }}>
              The room&apos;s filling up and the records are warming. Your host
              {showHostName && <>{" "}{hostNameEl}</>}{" "}
              is on in a moment.
            </p>
            {showNowPlaying && (
              <>
                <hr className="rule an-fade d5" style={{ margin: "34px auto 28px", maxWidth: 520 }} />
                <div className="an-rise d6">
                  {nowPlaying}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Variant A: spotlight (default) ─────────────────────── */
  return (
    <div
      className="screen grain vignette center-all"
      style={{ padding: 70 }}
    >
      <Sunburst
        size={1700}
        style={{ top: "44%", left: "50%", transform: "translate(-50%,-50%)" }}
      />
      {/* The corner logo is drawn over every TV screen (TvCornerLogo). */}
      <div
        className="col center-all"
        style={{ position: "relative", zIndex: 2, gap: 30 }}
      >
        <div className="tv-kicker an-rise d1">
          <Editable field="venuePresents" placeholder={`${brand.name} Presents`} />
        </div>
        <h1
          className="display display--gold an-rise d2"
          style={{ fontSize: 222, marginTop: -6 }}
        >
          <Editable as="div" field="welcomeTitle" placeholder="Music" />
          <Editable as="div" field="welcomeTitle2" placeholder="Bingo" />
        </h1>
        <p className="lede an-rise d3" style={{ maxWidth: 1120 }}>
          <Editable field="welcomeLedeA" placeholder="Grab a drink, settle in —" />{" "}
          {showHostName ? hostNameEl : "your host"}{" "}
          is about to take the mic.
        </p>
        {showNowPlaying && (
          <div className="an-rise d4" style={{ marginTop: 18 }}>
            {nowPlaying}
          </div>
        )}
      </div>
      <Chrome
        left="Welcome"
        right={whenEl}
      />
    </div>
  );
}
