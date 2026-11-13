'use client';

import { Fragment } from "react";
import { buttonClass, HoldButton } from "@anchor-nights/kit/ui";

/** The hold labels, as the host reads them (spec M-9, S4.2). */
export const END_SESSION_HOLD_LABEL = "Hold to end the session";
export const RESET_LOBBY_HOLD_LABEL = "Hold to reset to the lobby";

/** Prop types for the Game Flow panel */
export interface GameFlowPanelProps {
  /** Current game mode, e.g. "lobby" | "intro" | "playing" | "break" | "ended" */
  mode: string;
  /** Which game is active (1 or 2), or null between games */
  activeGame: number | null;
  onIntro: (n: 1 | 2) => void;
  /**
   * Which games have a warm-up song. A game without one gets no Dance Along or
   * Sing Along button; its Start button takes the whole row. Omitted, both show.
   */
  warmups?: { 1: boolean; 2: boolean };
  onStart: (n: 1 | 2) => void;
  onBreak: () => void;
  onResume: () => void;
  /** Game whose playback the break interrupted (null when the break fell between games). */
  resumeGameNumber: 1 | 2 | null;
  /** Resume the interrupted game's playlist from the song it was on. */
  onResumeGame: () => void;
  /**
   * End the session. Only fires after a full hold (it cannot be taken back
   * mid-show). Return false when it was refused, so the hold never shows done.
   */
  onEnd: () => boolean | void;
  /** Reset to the lobby, wiping scores and played songs. Also hold-to-confirm. */
  onReset: () => boolean | void;
  /** Show the Bingo Claim screen (lists this game's played songs on the TV). */
  onClaim: () => void;
  /** Return the TV from the claim screen back to the active game screen. */
  onBackToGame: () => void;
  /** True when claim validation is valid for the current TV screen. */
  claimAvailable: boolean;
  /** Number of songs played this game, shown on the Bingo Claim button. */
  claimCount: number;
  /** True when the TV is currently showing the claim screen (toggles the affordance). */
  claimActive: boolean;
}

/**
 * Host console panel — controls game-flow transitions.
 * Ported faithfully from docs/design/after-hours/host-panels.jsx.
 *
 * Break mode shows Continue + End only.
 * All other modes show the 4-button intro/start grid plus a footer row whose
 * secondary action toggles between "End Session" and "Reset to Lobby" depending
 * on whether the session has already ended.
 *
 * End Session and Reset to Lobby cannot be taken back in front of the room,
 * so both are press-and-hold (the kit HoldButton); everything else is a
 * single tap because it can be undone with another tap.
 */
export function GameFlowPanel({
  mode,
  activeGame,
  onIntro,
  warmups = { 1: true, 2: true },
  onStart,
  onBreak,
  onResume,
  resumeGameNumber,
  onResumeGame,
  onEnd,
  onReset,
  onClaim,
  onBackToGame,
  claimAvailable,
  claimCount,
  claimActive,
}: GameFlowPanelProps) {
  // The claim controls only make sense on an actual Music Bingo game screen
  // (or already showing the claim screen so the host can switch back).
  const showClaimRow = claimAvailable || claimActive;
  return (
    <div className="panel">
      <h2>
        Game Flow{' '}
        <span className="meta">
          Mode: {mode.toUpperCase()}
          {activeGame ? ` · Game ${activeGame}` : ''}
        </span>
      </h2>

      {mode === 'break' ? (
        /* Break mode: resume an interrupted game, continue the show, or end.
           The resume button only appears when the break cut a game off mid-song;
           it restarts that song and carries on through the playlist. */
        <div className="btn-row">
          {resumeGameNumber ? (
            <button className={buttonClass({ variant: "primary", size: "lg", className: "flex-1" })} onClick={onResumeGame}>
              ▶ Resume Game {resumeGameNumber}
            </button>
          ) : null}
          <button
            className={buttonClass({ variant: resumeGameNumber ? "outline" : "primary", size: "lg", className: "flex-1" })}
            onClick={onResume}
          >
            ▶ Continue Show
          </button>
          <HoldButton label={END_SESSION_HOLD_LABEL} onDone={onEnd} danger size={44} className="flex-1" />
        </div>
      ) : (
        <>
          {/* 2×2 grid: warm-up / start for each game. A game with no warm-up
              song has no warm-up button, and its Start button fills the row. */}
          <div className="btn-grid" style={{ marginBottom: 10 }}>
            {([1, 2] as const).map((n) => (
              <Fragment key={n}>
                {warmups[n] && (
                  <button className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => onIntro(n)}>
                    {n === 1 ? "▶ Dance Along" : "▶ Sing Along"}
                  </button>
                )}
                <button
                  className={buttonClass({ variant: "primary", size: "sm" })}
                  style={warmups[n] ? undefined : { gridColumn: "1 / -1" }}
                  onClick={() => onStart(n)}
                >
                  Start Game {n}
                </button>
              </Fragment>
            ))}
          </div>

          {/* Bingo Claim row — only while a game is live. Switches the TV to the
              claim screen (every song played this game) and back again. */}
          {showClaimRow && (
            <div className="btn-row" style={{ marginBottom: 10 }}>
              {claimActive ? (
                <button className={buttonClass({ variant: "primary", size: "sm", className: "flex-1" })} onClick={onBackToGame}>
                  {/* Fall back to a number-less label if the game ended while the
                      claim screen was up (avoids a dangling "Back to Game "). */}
                  ◀ Back to Game{activeGame ? ` ${activeGame}` : ''}
                </button>
              ) : (
                <button className={buttonClass({ variant: "primary", size: "sm", className: "flex-1" })} onClick={onClaim}>
                  🎙️ Bingo Claim
                  {claimCount > 0 ? ` · ${claimCount} ${claimCount === 1 ? 'song' : 'songs'}` : ''}
                </button>
              )}
            </div>
          )}

          {/* Footer row: break screen + end/reset */}
          <div className="btn-row">
            <button className={buttonClass({ variant: "outline", size: "sm", className: "flex-1" })} onClick={onBreak}>
              Show Break Screen
            </button>
            {mode === 'ended' ? (
              <HoldButton label={RESET_LOBBY_HOLD_LABEL} onDone={onReset} size={44} className="flex-1" />
            ) : (
              <HoldButton label={END_SESSION_HOLD_LABEL} onDone={onEnd} danger size={44} className="flex-1" />
            )}
          </div>
        </>
      )}
    </div>
  );
}
