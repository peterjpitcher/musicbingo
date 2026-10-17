"use client";

import React from "react";
import type { ScreenProps } from "@/components/screens/types";
import { Sunburst } from "@/components/motifs/Sunburst";
import { Editable } from "@/components/motifs/Editable";
import { useEdit } from "@/components/motifs/EditContext";
import { Chrome } from "@/components/motifs/Chrome";

/**
 * Screen 12 — Winners.
 * Reveals scored teams from last to first. Team names come from the Award
 * Points mechanic; only the winner/wooden-spoon prize copy is editable.
 */
export function Winners(props: ScreenProps): React.ReactElement {
  const { brand, runtime } = props;
  const { get } = useEdit();
  const scoredTeams = [...(runtime?.teamScores ?? [])]
    .filter((team) => team.name.trim())
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  const hasScoredTeams = scoredTeams.length > 0;
  const winnerIndex = scoredTeams.length - 1;
  const spoonIndex = scoredTeams.length > 2 ? 1 : scoredTeams.length > 1 ? 0 : -1;
  const winPrize = get("winPrize", "£25 bar voucher");
  const spoonPrize = get("spoonPrize", "Bottle of house wine");
  const revealCount = Math.max(0, runtime?.winnersRevealCount ?? 0);
  const visibleScoredTeams = scoredTeams.slice(0, Math.min(revealCount, scoredTeams.length));
  // Eight or nine teams fill the table at full size. Beyond that rows shrink, so
  // the whole table stays on the TV: at twelve or more teams it used to run
  // off the top and bottom (found 16 October 2026). Sized from all scored
  // teams, not just those revealed, so rows keep one size as the host reveals.
  const density = Math.max(0.4, Math.min(1, 8.5 / Math.max(scoredTeams.length, 1)));
  const px = (size: number): number => Math.round(size * density);
  // Long team names wrap onto two lines, so row heights cannot be predicted
  // from the team count alone. Measure the list and scale it down just enough
  // to sit between the heading and the footer. Transforms do not change
  // layout size, so measuring the scaled list cannot feed back on itself.
  const areaRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const [fit, setFit] = React.useState(1);
  React.useLayoutEffect(() => {
    const area = areaRef.current;
    const list = listRef.current;
    if (!area || !list) return;
    const measure = () => {
      const needed = list.scrollHeight;
      const available = area.clientHeight;
      setFit(needed > 0 && available > 0 ? Math.min(1, available / needed) : 1);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(area);
    observer?.observe(list);
    void document.fonts?.ready.then(measure).catch(() => {});
    return () => observer?.disconnect();
  }, [hasScoredTeams]);

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
      {hasScoredTeams ? (
        <div
          ref={areaRef}
          className="fill"
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            position: "relative",
            zIndex: 2,
            marginTop: 20,
            maxWidth: 1320,
            width: "100%",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <div
            ref={listRef}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: px(10),
              transform: fit < 1 ? `scale(${fit})` : undefined,
              transformOrigin: "center",
            }}
          >
          {visibleScoredTeams.map((team, index) => {
            const rank = scoredTeams.length - index;
            const isWinner = index === winnerIndex;
            const isSpoon = index === spoonIndex;
            const prize = isWinner ? winPrize : isSpoon ? spoonPrize : "";
            return (
              <div
                key={team.id}
                className="an-rise"
                style={{
                  animationDelay: `${0.12 + index * 0.12}s`,
                  display: "grid",
                  gridTemplateColumns: "110px minmax(0, 1fr) 190px minmax(220px, .65fr)",
                  alignItems: "center",
                  gap: 22,
                  padding: isWinner ? `${px(20)}px 26px` : `${px(15)}px 22px`,
                  borderRadius: 18,
                  background: isWinner
                    ? "linear-gradient(180deg, rgb(var(--brand-accent-rgb) / .92), rgb(var(--ink-rgb) / .55))"
                    : "rgb(0 0 0 / .28)",
                  border: isWinner
                    ? "3px solid var(--brand-accent-light)"
                    : "2px solid rgb(var(--brand-accent-rgb) / .36)",
                  boxShadow: isWinner ? "0 26px 80px rgb(0 0 0 / .45)" : "none",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--brand-display)",
                    fontSize: px(isWinner ? 58 : 44),
                    lineHeight: .9,
                    color: isWinner ? "#fff6dd" : "var(--brand-accent-light)",
                  }}
                >
                  #{rank}
                </div>
                <div
                  style={{
                    fontSize: px(isWinner ? 48 : 36),
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
                    fontFamily: "var(--brand-display)",
                    fontSize: px(isWinner ? 56 : 42),
                    lineHeight: .9,
                    textAlign: "right",
                    color: isWinner ? "#fff6dd" : "var(--brand-accent-light)",
                  }}
                >
                  {team.score} pts
                </div>
                <div
                  style={{
                    fontSize: Math.max(16, px(isWinner ? 25 : 20)),
                    fontWeight: 800,
                    color: prize ? "var(--cream)" : "rgb(var(--cream-rgb) / .34)",
                    textAlign: "right",
                    overflowWrap: "anywhere",
                  }}
                >
                  {isWinner ? `Wins ${prize}` : isSpoon ? `Wooden Spoon · ${prize}` : " "}
                </div>
              </div>
            );
          })}
          </div>
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
            Add teams and scores in Award Points to reveal the winners.
          </div>
        </div>
      )}
      <Chrome
        left={<Editable field="venueName" placeholder={brand.name} />}
        right="Well Played, Everyone"
      />
    </div>
  );
}
