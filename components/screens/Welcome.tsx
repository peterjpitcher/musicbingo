"use client";

import type { ScreenProps } from "@/components/screens/types";
import { Sunburst } from "@/components/motifs/Sunburst";
import { Vinyl } from "@/components/motifs/Vinyl";
import { VenueLogo } from "@/components/motifs/VenueLogo";
import { Chrome } from "@/components/motifs/Chrome";
import { Editable } from "@/components/motifs/Editable";
import { NowPlaying } from "@/components/screens/NowPlaying";

/**
 * Welcome screen — three layout variants (A/B/C).
 *
 * Variant A: spotlight centre-aligned with sunburst.
 * Variant B: split-panel — text left, spinning vinyl right.
 * Variant C: marquee-framed card centred on a sunburst.
 */
export function Welcome({ brand, runtime, variant = "A" }: ScreenProps): JSX.Element {
  // The "Now Playing" pill only appears once the host has actually played the
  // welcome song — i.e. it is the live, currently-playing track. In design /
  // preview contexts (no runtime) we keep showing it so the layout stays
  // representative.
  const welcomeSong = runtime?.welcomeSong ?? null;
  const current = runtime?.currentTrack ?? null;
  const showNowPlaying =
    !runtime ||
    Boolean(welcomeSong && current?.isPlaying && current.trackId === welcomeSong.trackId);

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
          <div className="kicker an-rise d1">
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
            />{" "}
            <b style={{ color: "var(--brand-accent-light)" }}>
              <Editable field="hostName" placeholder="Nikki Manfadge" />
            </b>{" "}
            is about to take the mic.
          </p>
          {showNowPlaying && (
            <div className="an-rise d4" style={{ marginTop: 10 }}>
              <NowPlaying
                titleField="introTitle"
                artistField="introArtist"
                titlePH="Yes Sir, I Can Boogie"
                artistPH="Baccara"
              />
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
                    "radial-gradient(circle,var(--brand-accent-light),var(--brand-accent))",
                  color: "var(--ink)",
                  fontFamily: "var(--brand-display)",
                  fontSize: 30,
                  textAlign: "center",
                  lineHeight: 0.92,
                  boxShadow: "inset 0 0 0 5px rgba(0,0,0,.25)",
                }}
              >
                EST.
                <br />
                2024
              </div>
            </div>
          </div>
        </div>

        <Chrome
          left="Welcome"
          right={<Editable field="welcomeDate" placeholder="Friday · 8:00 PM" />}
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
            border: "3px solid var(--brand-accent)",
            boxShadow:
              "0 0 0 14px rgb(var(--brand-primary-rgb) / .7), 0 40px 100px rgba(0,0,0,.6)",
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
                "radial-gradient(circle, var(--brand-accent-light) 0 2.4px, transparent 3px) 0 0/40px 40px",
              opacity: 0.8,
              maskImage: "linear-gradient(#000,#000)",
              pointerEvents: "none",
              WebkitMaskImage: "none",
            }}
          />
          <div style={{ position: "relative" }}>
            <VenueLogo brand={brand} />
            <div
              className="kicker kicker--plain an-rise d2"
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
              The room&apos;s filling up and the records are warming. Your host{" "}
              <b style={{ color: "var(--brand-accent-light)" }}>
                <Editable field="hostName" placeholder="Nikki Manfadge" />
              </b>{" "}
              is on in a moment.
            </p>
            {showNowPlaying && (
              <>
                <hr className="rule an-fade d5" style={{ margin: "34px auto 28px", maxWidth: 520 }} />
                <div className="an-rise d6">
                  <NowPlaying
                    titleField="introTitle"
                    artistField="introArtist"
                    titlePH="Yes Sir, I Can Boogie"
                    artistPH="Baccara"
                  />
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
      <div style={{ position: "absolute", left: 90, top: 70, zIndex: 3 }}>
        <VenueLogo brand={brand} />
      </div>
      <div
        className="col center-all"
        style={{ position: "relative", zIndex: 2, gap: 30 }}
      >
        <div className="kicker an-rise d1">
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
          <b style={{ color: "var(--brand-accent-light)" }}>
            <Editable field="hostName" placeholder="Nikki Manfadge" />
          </b>{" "}
          is about to take the mic.
        </p>
        {showNowPlaying && (
          <div className="an-rise d4" style={{ marginTop: 18 }}>
            <NowPlaying
              titleField="introTitle"
              artistField="introArtist"
              titlePH="Yes Sir, I Can Boogie"
              artistPH="Baccara"
            />
          </div>
        )}
      </div>
      <Chrome
        left="Welcome"
        right={<Editable field="welcomeDate" placeholder="Friday · 8:00 PM" />}
      />
    </div>
  );
}
