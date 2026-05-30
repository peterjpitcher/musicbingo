"use client";

import type { ScreenProps } from "@/components/screens/types";
import type { PlayedTrack } from "@/lib/live/types";
import { Editable } from "@/components/motifs/Editable";
import { Chrome } from "@/components/motifs/Chrome";

/**
 * "BINGO CLAIM" validation screen. When a guest shouts bingo the host switches
 * the TV here (via the host's Bingo Claim button → `runtime.screenId = "claim"`)
 * so the room can see every song played so far this game and the host can check
 * the claim against the card.
 *
 * The list is `runtime.playedTracks`, which the host accumulates on each track
 * change and resets at the start of each game — so it always lists exactly this
 * game's songs. The screen is read-only on the guest TV; it just renders the
 * synced state.
 *
 * Layout: After-Hours styling on the 1920×1080 stage. The list flows down 1/2/3
 * columns (by count) and each row is given an explicit, computed height so the
 * whole list always fits the fixed vertical budget — even a full ~50-song game
 * never overflows 1080 (it just tightens the rows and shrinks the type). See
 * `planLayout` for the maths.
 */

/** Vertical budget (px) available to the song list once the header + chrome are laid out. */
const LIST_BUDGET_PX = 760;
/** Gap between rows. */
const ROW_GAP_PX = 6;
/** Cap so sparse lists don't stretch into oversized rows / type. */
const MAX_ROW_PX = 84;
const MAX_FONT_PX = 32;
const MIN_FONT_PX = 15;

type ClaimLayout = { columns: number; rows: number; rowHeight: number; fontSize: number };

/** Chooses column count and a row height/font size that guarantees the list fits the budget. */
function planLayout(count: number): ClaimLayout {
  const columns = count <= 8 ? 1 : count <= 20 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(count / columns));
  const gapTotal = (rows - 1) * ROW_GAP_PX;
  // Largest uniform row height that keeps every row inside the budget, capped so
  // short lists stay sensibly sized rather than ballooning.
  const fitRowHeight = Math.floor((LIST_BUDGET_PX - gapTotal) / rows);
  const rowHeight = Math.max(1, Math.min(MAX_ROW_PX, fitRowHeight));
  // Single-line type sized to the row (leaving room for padding + border).
  const fontSize = Math.max(MIN_FONT_PX, Math.min(MAX_FONT_PX, rowHeight - 14));
  return { columns, rows, rowHeight, fontSize };
}

export function ClaimScreen({ brand, runtime }: ScreenProps): JSX.Element {
  const played: PlayedTrack[] = runtime?.playedTracks ?? [];
  const count = played.length;
  const { columns, rows, rowHeight, fontSize } = planLayout(count);

  return (
    <div className="screen grain vignette" style={{ padding: "40px 88px 64px" }}>
      {/* Header */}
      <div className="col" style={{ alignItems: "center", gap: 8 }}>
        <div className="pill an-rise d1">🎙️ &nbsp; Eyes Down · Claim Check</div>
        <h1
          className="display display--gold an-rise d2"
          style={{ fontSize: 92, marginTop: 2 }}
        >
          Bingo Claim
        </h1>
      </div>

      {/* Song list — explicit height so it can never overflow the stage. */}
      <div
        className="an-rise d3"
        style={{
          height: LIST_BUDGET_PX,
          marginTop: 18,
          display: "flex",
          alignItems: "stretch",
          overflow: "hidden",
        }}
      >
        {count === 0 ? (
          <div className="col center-all" style={{ flex: 1, gap: 8 }}>
            <div
              style={{
                fontFamily: "var(--brand-display)",
                fontSize: 64,
                textTransform: "uppercase",
                color: "var(--cream-dim)",
                letterSpacing: ".04em",
              }}
            >
              No songs played yet
            </div>
            <div className="muted" style={{ fontSize: 26 }}>
              Songs appear here as the game plays.
            </div>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, ${rowHeight}px)`,
              gridAutoFlow: "column",
              columnGap: 26,
              rowGap: ROW_GAP_PX,
              alignContent: "start",
            }}
          >
            {played.map((track, index) => (
              <div
                key={`${track.trackId ?? "x"}-${index}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  height: rowHeight,
                  padding: "0 16px",
                  borderRadius: 12,
                  background: "rgba(0,0,0,.26)",
                  border: "1px solid rgb(var(--brand-accent-rgb) / .35)",
                  minWidth: 0,
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    flex: "0 0 auto",
                    fontFamily: "var(--brand-display)",
                    fontSize: fontSize + 1,
                    lineHeight: 1,
                    color: "var(--brand-accent-light)",
                    minWidth: "1.7em",
                    textAlign: "right",
                  }}
                >
                  {index + 1}
                </span>
                <span
                  style={{
                    minWidth: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontSize,
                    lineHeight: 1.15,
                  }}
                >
                  <span style={{ fontWeight: 700, color: "var(--cream)" }}>
                    {track.title || "Unknown title"}
                  </span>
                  <span className="muted" style={{ fontWeight: 500 }}>
                    {"  —  "}
                    {track.artist || "Unknown artist"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Chrome
        left={<Editable field="venueName" placeholder={brand.name} />}
        right={count > 0 ? `${count} ${count === 1 ? "song" : "songs"} played` : "Bingo Claim"}
      />
    </div>
  );
}
