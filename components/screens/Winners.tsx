"use client";

import React from "react";
import type { ScreenProps } from "@/components/screens/types";
import { Sunburst } from "@/components/motifs/Sunburst";
import { Editable } from "@/components/motifs/Editable";
import { Chrome } from "@/components/motifs/Chrome";

/** Individual winner/wooden-spoon card within the Winners screen. */
type CardProps = {
  rank: string;
  place: string;
  teamField: string;
  teamPH: string;
  prizeField: string;
  prizePH: string;
  hero: boolean;
};

function Card({ rank, place, teamField, teamPH, prizeField, prizePH, hero }: CardProps): React.ReactElement {
  return (
    <div
      className={`an-pop ${hero ? "d2" : "d3"}`}
      style={{
        flex: 1,
        padding: "50px 46px",
        borderRadius: 26,
        textAlign: "center",
        position: "relative",
        background: hero
          ? "linear-gradient(180deg, rgb(var(--brand-accent-rgb) / .9), rgba(0,0,0,.4))"
          : "rgba(0,0,0,.3)",
        border: hero
          ? "3px solid var(--brand-accent-light)"
          : "2px solid rgb(var(--brand-accent-rgb) / .4)",
        boxShadow: hero ? "0 30px 90px rgba(0,0,0,.5)" : "none",
        transform: hero ? "scale(1.04)" : "none",
      }}
    >
      <div style={{ fontSize: 90, lineHeight: 1 }}>{rank}</div>
      <div
        style={{
          fontSize: 22,
          letterSpacing: ".24em",
          textTransform: "uppercase",
          color: "var(--brand-accent-light)",
          fontWeight: 700,
          marginTop: 12,
        }}
      >
        {place}
      </div>
      <div
        className="display display--gold"
        style={{ fontSize: hero ? 96 : 76, margin: "14px 0 18px", lineHeight: 0.9 }}
      >
        <Editable field={teamField} placeholder={teamPH} />
      </div>
      <hr className="rule" style={{ maxWidth: 220, margin: "0 auto 18px" }} />
      <div
        style={{
          fontSize: 18,
          letterSpacing: ".22em",
          textTransform: "uppercase",
          color: "var(--cream-dim)",
          fontWeight: 700,
        }}
      >
        Wins
      </div>
      <div style={{ fontSize: 38, fontWeight: 700, marginTop: 8 }}>
        <Editable field={prizeField} placeholder={prizePH} />
      </div>
    </div>
  );
}

/**
 * Screen 12 — Winners.
 * Displays a hero card for the 1st-place champions and a secondary card for the
 * wooden-spoon team (2nd from last). All team names and prizes are editable.
 */
export function Winners({ brand }: ScreenProps): React.ReactElement {
  return (
    <div
      className="screen grain vignette"
      style={{ padding: "70px 120px 104px" }}
    >
      <Sunburst
        size={1700}
        style={{
          top: "46%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          opacity: 0.3,
        }}
      />
      <div
        className="col center-all"
        style={{ gap: 12, position: "relative", zIndex: 2 }}
      >
        <div className="kicker an-rise d1">Drum Roll, Please</div>
        <h1 className="display display--gold an-rise d2" style={{ fontSize: 124 }}>
          Tonight&apos;s Winners
        </h1>
      </div>
      <div
        className="fill"
        style={{
          display: "flex",
          gap: 56,
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          zIndex: 2,
          marginTop: 20,
        }}
      >
        <Card
          rank="🏆"
          place="Champions · 1st Place"
          teamField="winTeam"
          teamPH="The Spice Curls"
          prizeField="winPrize"
          prizePH="£100 Bar Tab"
          hero
        />
        <Card
          rank="🥄"
          place="Wooden Spoon · 2nd from Last"
          teamField="spoonTeam"
          teamPH="Quiztopher Biggins"
          prizeField="spoonPrize"
          prizePH="A Round of Shots"
          hero={false}
        />
      </div>
      <Chrome
        left={<Editable field="venueName" placeholder={brand.name} />}
        right="Well Played, Everyone"
      />
    </div>
  );
}
