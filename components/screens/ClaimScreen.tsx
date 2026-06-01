"use client";

import type { CSSProperties } from "react";
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
 * Layout: After-Hours styling on the 1920×1080 stage. Once the list gets long,
 * it scrolls slowly and continuously instead of compressing every played song
 * into tiny multi-column rows.
 */

/** Vertical budget (px) available to the song list once the header + chrome are laid out. */
const LIST_BUDGET_PX = 760;
/** Gap between rows. */
const ROW_GAP_PX = 10;
const ROW_HEIGHT_PX = 82;
const LOOP_SPACER_PX = 28;
const SCROLL_START_COUNT = 9;

function scrollDurationSeconds(count: number): number {
  return Math.max(42, count * 4);
}

export function ClaimScreen({ brand, runtime }: ScreenProps): JSX.Element {
  const played: PlayedTrack[] = runtime?.playedTracks ?? [];
  const count = played.length;
  const shouldScroll = count >= SCROLL_START_COUNT;
  const scrollDistance = count * ROW_HEIGHT_PX + (count + 1) * ROW_GAP_PX + LOOP_SPACER_PX;
  const rows = (ariaHidden = false) =>
    played.map((track, index) => (
      <div
        key={`${ariaHidden ? "loop" : "song"}-${track.trackId ?? "x"}-${index}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22,
          height: ROW_HEIGHT_PX,
          padding: "0 26px",
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
            fontSize: 34,
            lineHeight: 1,
            color: "var(--brand-accent-light)",
            minWidth: "1.8em",
            textAlign: "right",
          }}
        >
          {index + 1}
        </span>
        <span
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            lineHeight: 1.05,
          }}
        >
          <span
            style={{
              color: "var(--cream)",
              fontSize: 30,
              fontWeight: 800,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {track.title || "Unknown title"}
          </span>
          <span
            className="muted"
            style={{
              fontSize: 24,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {track.artist || "Unknown artist"}
          </span>
        </span>
      </div>
    ));

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

      {/* Song list — slow marquee scroll for long claim histories. */}
      <div
        className="an-rise d3"
        style={{
          height: LIST_BUDGET_PX,
          marginTop: 18,
          overflow: "hidden",
          maskImage: shouldScroll
            ? "linear-gradient(180deg, transparent 0, #000 9%, #000 91%, transparent 100%)"
            : undefined,
          WebkitMaskImage: shouldScroll
            ? "linear-gradient(180deg, transparent 0, #000 9%, #000 91%, transparent 100%)"
            : undefined,
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
            className={shouldScroll ? "claim-scroll-track" : undefined}
            style={{
              display: "flex",
              flexDirection: "column",
              rowGap: ROW_GAP_PX,
              ["--claim-scroll-distance" as string]: `-${scrollDistance}px`,
              ["--claim-scroll-duration" as string]: `${scrollDurationSeconds(count)}s`,
            } as CSSProperties}
          >
            {rows()}
            {shouldScroll && (
              <>
                <div aria-hidden style={{ height: LOOP_SPACER_PX, flex: "0 0 auto" }} />
                {rows(true)}
              </>
            )}
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
