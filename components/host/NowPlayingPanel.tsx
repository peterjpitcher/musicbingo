'use client';

/** Prop types for the Now Playing panel */
export interface NowPlayingPanelProps {
  track: { title: string; artist: string };
  playing: boolean;
  /** Elapsed position in the current track, in milliseconds */
  progressMs: number;
  /** Reveal thresholds in SECONDS (song = clip length) */
  timing: { song: number; album: number; title: number; artist: number };
  isIntro: boolean;
  isChallenge: boolean;
  freePlay: boolean;
  /** Extra milliseconds added by the host via +30s */
  extendedMs: number;
  onTransport: (action: 'previous' | 'pause' | 'resume' | 'next') => void;
  onFree: () => void;
  onExtend: () => void;
  onSkip: () => void;
  onRestart: () => void;
}

/**
 * Host console panel — shows the current track, progress bar, reveal badges,
 * and transport controls. Ported faithfully from docs/design/after-hours/host-panels.jsx.
 */
export function NowPlayingPanel({
  track,
  playing,
  progressMs,
  timing,
  isIntro,
  isChallenge,
  freePlay,
  extendedMs,
  onTransport,
  onFree,
  onExtend,
  onSkip,
  onRestart,
}: NowPlayingPanelProps) {
  // Total track window in ms; challenges are capped at 90s regardless of timing.song
  const nextMs = (isChallenge ? 90 : timing.song) * 1000 + extendedMs;
  // Progress bar percentage, clamped to 100
  const pct = Math.min(100, (progressMs / nextMs) * 100);
  // Elapsed seconds (whole number) used to determine which reveals are active
  const sec = Math.floor(progressMs / 1000);

  // Reveal badge definitions: [label, threshold in seconds]
  const reveals: [string, number][] = [
    ['Album', timing.album],
    ['Title', timing.title],
    ['Artist', timing.artist],
    ['Next', isChallenge ? 90 : timing.song],
  ];

  return (
    <div className="panel">
      <h2>
        Now Playing <span className="meta">{playing ? '▶ Live' : '❚❚ Paused'}</span>
      </h2>

      {/* Track identity row */}
      <div className="np">
        <div className="np-art">🎵</div>
        <div style={{ minWidth: 0 }}>
          <div className="np-title">{track.title}</div>
          <div className="np-artist">{track.artist}</div>
          <div className="np-tags">
            {isIntro && <span className="tag tag--intro">Intro · Full Play</span>}
            {isChallenge && !isIntro && (
              <span className="tag tag--chal">Challenge · 90s</span>
            )}
            {freePlay && <span className="tag tag--chal">Free Play</span>}
          </div>
        </div>
      </div>

      {/* Progress bar + reveal badges — hidden during intro (plays in full) */}
      {!isIntro && (
        <>
          <div className="prog">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="prog-meta">
            <span>
              {sec}s {freePlay ? '' : `/ ${Math.round(nextMs / 1000)}s`}
            </span>
            <span>
              {freePlay
                ? 'Plays in full'
                : `Next song in ${Math.max(0, Math.ceil((nextMs - progressMs) / 1000))}s`}
              {extendedMs ? ` · +${extendedMs / 1000}s` : ''}
            </span>
          </div>
          <div className="reveal-row">
            {reveals.map(([l, t]) => (
              // Badge lights up (.on) once elapsed seconds passes the reveal threshold,
              // or immediately when Free Play is active
              <span
                key={l}
                className={`rbadge ${sec >= t || freePlay ? 'on' : ''}`}
              >
                {l} @{t}s
              </span>
            ))}
          </div>
        </>
      )}

      {/* Intro-mode meta — no progress bar, just elapsed time */}
      {isIntro && (
        <div className="prog-meta">
          <span>{sec}s elapsed</span>
          <span>Plays in full — no auto-advance</span>
        </div>
      )}

      {/* Transport row: previous / pause-resume / next */}
      <div className="btn-row" style={{ marginBottom: 10 }}>
        <button
          className="hbtn hbtn--icon"
          onClick={() => onTransport('previous')}
          title="Previous"
        >
          ⏮
        </button>
        <button
          className="hbtn hbtn--icon hbtn--primary grow"
          onClick={() => onTransport(playing ? 'pause' : 'resume')}
        >
          {playing ? '❚❚ Pause' : '▶ Resume'}
        </button>
        <button
          className="hbtn hbtn--icon"
          onClick={() => onTransport('next')}
          title="Next"
        >
          ⏭
        </button>
      </div>

      {/* Secondary controls: extend, skip, restart, free play */}
      <div className="btn-row">
        <button
          className="hbtn grow"
          onClick={onExtend}
          disabled={freePlay || isIntro}
        >
          +30s
        </button>
        <button className="hbtn grow" onClick={onSkip} disabled={isIntro}>
          Skip 30s
        </button>
        <button className="hbtn grow" onClick={onRestart}>
          Restart
        </button>
        <button
          className={`hbtn grow ${freePlay ? 'hbtn--on' : ''}`}
          onClick={onFree}
          title="Songs play in full, no auto-advance — use after bingo is called"
        >
          {freePlay ? 'Free Play ON' : 'Free Play'}
        </button>
      </div>
    </div>
  );
}
