'use client';

/** Prop types for the Game Flow panel */
export interface GameFlowPanelProps {
  /** Current game mode, e.g. "lobby" | "intro" | "playing" | "break" | "ended" */
  mode: string;
  /** Which game is active (1 or 2), or null between games */
  activeGame: number | null;
  onIntro: (n: 1 | 2) => void;
  onStart: (n: 1 | 2) => void;
  onBreak: () => void;
  onResume: () => void;
  onEnd: () => void;
  onReset: () => void;
}

/**
 * Host console panel — controls game-flow transitions.
 * Ported faithfully from docs/design/after-hours/host-panels.jsx.
 *
 * Break mode shows Resume + End only.
 * All other modes show the 4-button intro/start grid plus a footer row whose
 * secondary action toggles between "End Session" and "Reset to Lobby" depending
 * on whether the session has already ended.
 */
export function GameFlowPanel({
  mode,
  activeGame,
  onIntro,
  onStart,
  onBreak,
  onResume,
  onEnd,
  onReset,
}: GameFlowPanelProps) {
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
        /* Break mode — resume or end the session */
        <div className="btn-row">
          <button className="hbtn hbtn--go hbtn--lg grow" onClick={onResume}>
            ▶ Resume Game
          </button>
          <button className="hbtn hbtn--danger" onClick={onEnd}>
            End Session
          </button>
        </div>
      ) : (
        <>
          {/* 2×2 grid: intro / start for each game */}
          <div className="btn-grid" style={{ marginBottom: 10 }}>
            <button className="hbtn" onClick={() => onIntro(1)}>
              ▶ Dance Along
            </button>
            <button className="hbtn hbtn--primary" onClick={() => onStart(1)}>
              Start Game 1
            </button>
            <button className="hbtn" onClick={() => onIntro(2)}>
              ▶ Sing Along
            </button>
            <button className="hbtn hbtn--primary" onClick={() => onStart(2)}>
              Start Game 2
            </button>
          </div>

          {/* Footer row: break screen + end/reset */}
          <div className="btn-row">
            <button className="hbtn grow" onClick={onBreak}>
              Show Break Screen
            </button>
            {mode === 'ended' ? (
              <button className="hbtn grow" onClick={onReset}>
                Reset to Lobby
              </button>
            ) : (
              <button className="hbtn hbtn--danger" onClick={onEnd}>
                End Session
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
