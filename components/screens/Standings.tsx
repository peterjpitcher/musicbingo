"use client";

import React from "react";
import type { ScreenProps } from "@/components/screens/types";
import type { LiveTeamScore } from "@/lib/live/types";
import { Sunburst } from "@/components/motifs/Sunburst";
import { Editable } from "@/components/motifs/Editable";
import { Chrome } from "@/components/motifs/Chrome";

type StandingsRow = { team: LiveTeamScore; position: number; sharesPosition: boolean };

/**
 * Ranks teams best first, giving equal scores the same position and skipping the
 * places they use up (1, 2, 2, 4). Ties are common at half time because scoring
 * so far is only lines, full house and quiz round one, and pretending to split
 * them would invent a gap the teams could argue with.
 */
export function rankTeams(teams: LiveTeamScore[]): StandingsRow[] {
  const sorted = [...teams]
    .filter((team) => team.name.trim())
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const positions = sorted.map((team, index) => {
    const previous = sorted[index - 1];
    return previous && previous.score === team.score ? -1 : index + 1;
  });
  // Second pass: a tied row inherits the position of the row above it.
  for (let i = 0; i < positions.length; i += 1) {
    if (positions[i] === -1) positions[i] = positions[i - 1];
  }

  return sorted.map((team, index) => ({
    team,
    position: positions[index],
    sharesPosition: positions.filter((p) => p === positions[index]).length > 1,
  }));
}

/**
 * Half-time standings. Shows every scored team in position order with the points
 * deliberately hidden, so the room learns who is chasing whom without knowing
 * how big the gap is. Reads the same `runtime.teamScores` as the Winners reveal.
 */
export function Standings(props: ScreenProps): React.ReactElement {
  const { brand, runtime } = props;
  const rows = rankTeams(runtime?.teamScores ?? []);
  const hasTeams = rows.length > 0;

  // The TV stage is a fixed 1080px tall and every team is on screen at once, so
  // a busy night would push the bottom of the table off the frame. Past eight
  // teams the table runs in two columns, filling the width a 16:9 screen has
  // going spare rather than shrinking the names past reading distance.
  const twoColumns = rows.length > 8;
  const size = twoColumns
    ? { rank: 36, rankLead: 44, name: 30, nameLead: 38, rankCol: 96, tiedCol: 90 }
    : { rank: 44, rankLead: 58, name: 36, nameLead: 48, rankCol: 120, tiedCol: 150 };

  return (
    <div className="screen grain vignette" style={{ padding: "70px 120px 104px" }}>
      <Sunburst
        size={1700}
        style={{ top: "46%", left: "50%", transform: "translate(-50%,-50%)", opacity: 0.3 }}
      />
      <div className="col center-all" style={{ gap: 12, position: "relative", zIndex: 2 }}>
        <div className="kicker an-rise d1">Halfway There</div>
        <h1 className="display display--gold an-rise d2" style={{ fontSize: 118 }}>
          Where We Stand
        </h1>
        <div
          className="an-rise d3"
          style={{ fontSize: 26, fontWeight: 700, color: "rgb(var(--cream-rgb) / .78)" }}
        >
          Positions only. The points stay secret until the end.
        </div>
      </div>

      {hasTeams ? (
        <div
          className="fill"
          style={{
            display: "grid",
            // Column-major so the table reads top to bottom, then over to the
            // right, the way a league table is expected to run.
            gridAutoFlow: twoColumns ? "column" : "row",
            gridTemplateRows: twoColumns
              ? `repeat(${Math.ceil(rows.length / 2)}, auto)`
              : undefined,
            gridTemplateColumns: twoColumns
              ? "repeat(2, minmax(0, 1fr))"
              : "minmax(0, 1fr)",
            gap: 10,
            columnGap: 26,
            alignContent: "center",
            position: "relative",
            zIndex: 2,
            marginTop: 20,
            maxWidth: twoColumns ? 1660 : 1180,
            width: "100%",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {rows.map(({ team, position, sharesPosition }, index) => {
            const isLeader = position === 1;
            return (
              <div
                key={team.id}
                className="an-rise"
                style={{
                  animationDelay: `${0.12 + index * 0.1}s`,
                  display: "grid",
                  gridTemplateColumns: `${size.rankCol}px minmax(0, 1fr) ${size.tiedCol}px`,
                  alignItems: "center",
                  gap: twoColumns ? 16 : 22,
                  padding: isLeader ? "20px 26px" : "15px 22px",
                  borderRadius: 18,
                  background: isLeader
                    ? "linear-gradient(180deg, rgb(var(--brand-accent-rgb) / .92), rgb(var(--ink-rgb) / .55))"
                    : "rgb(0 0 0 / .28)",
                  border: isLeader
                    ? "3px solid var(--brand-accent-light)"
                    : "2px solid rgb(var(--brand-accent-rgb) / .36)",
                  boxShadow: isLeader ? "0 26px 80px rgb(0 0 0 / .45)" : "none",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--brand-display)",
                    fontSize: isLeader ? size.rankLead : size.rank,
                    lineHeight: 0.9,
                    color: isLeader ? "#fff6dd" : "var(--brand-accent-light)",
                  }}
                >
                  #{position}
                </div>
                <div
                  style={{
                    fontSize: isLeader ? size.nameLead : size.name,
                    fontWeight: 900,
                    lineHeight: 1,
                    overflowWrap: "anywhere",
                    color: "var(--cream)",
                  }}
                >
                  {team.name}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    textAlign: "right",
                    color: sharesPosition
                      ? "var(--brand-accent-light)"
                      : "rgb(var(--cream-rgb) / .34)",
                    overflowWrap: "anywhere",
                  }}
                >
                  {sharesPosition ? "Tied" : " "}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="fill"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 2,
            marginTop: 20,
          }}
        >
          <div
            className="an-rise"
            style={{
              maxWidth: 900,
              textAlign: "center",
              fontSize: 38,
              lineHeight: 1.15,
              fontWeight: 800,
              color: "var(--cream)",
            }}
          >
            Add teams and scores in Award Points to show the half-time standings.
          </div>
        </div>
      )}

      <Chrome
        left={<Editable field="venueName" placeholder={brand.name} />}
        right="All To Play For"
      />
    </div>
  );
}
