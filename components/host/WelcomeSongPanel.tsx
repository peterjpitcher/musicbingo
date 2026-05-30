'use client';

import React, { useState } from 'react';

interface WelcomeSongPanelProps {
  /** Current welcome song label, e.g. "Yes Sir, I Can Boogie — Baccara". */
  title: string;
  artist: string;
  /** True while a Set / Play / Pause request is in flight. */
  busy: boolean;
  /** True when no welcome song is set, or Spotify/the device is unavailable — disables Play. */
  playDisabled: boolean;
  /** Inline error from the most recent "Set song" attempt; null when clear. */
  error: string | null;
  /** Resolve a pasted Spotify track link and set it as the welcome song. */
  onSetSong: (url: string) => void;
  /** Play the resolved welcome song through the host's Spotify device. */
  onPlay: () => void;
  /** Pause Spotify playback. */
  onPause: () => void;
}

/**
 * Host-only control for the Welcome (idle) screen's song. The host pastes a
 * Spotify track link to set the on-screen song line live, then plays or pauses
 * that track through their Spotify device. Mirrors the surrounding content
 * panel styling (.panel / .ed / .ed-grp / .hbtn).
 */
export function WelcomeSongPanel({
  title,
  artist,
  busy,
  playDisabled,
  error,
  onSetSong,
  onPlay,
  onPause,
}: WelcomeSongPanelProps): React.ReactElement {
  const [link, setLink] = useState<string>('');

  const handleSet = (): void => {
    const trimmed = link.trim();
    if (!trimmed) return;
    onSetSong(trimmed);
  };

  const nowLabel = title || artist ? `${title}${title && artist ? ' — ' : ''}${artist}` : '—';

  return (
    <div className="panel">
      <h2>Welcome Song</h2>
      <div className="ed">
        <div className="ed-grp">
          <span className="k">Paste Spotify track link</span>
          <div className="btn-row">
            <input
              value={link}
              placeholder="Paste Spotify track link…"
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSet();
                }
              }}
              style={{ flex: 1, minWidth: 180 }}
            />
            <button
              type="button"
              className="hbtn hbtn--primary"
              onClick={handleSet}
              disabled={busy || !link.trim()}
            >
              Set song
            </button>
          </div>
        </div>

        <p className="hint-small" style={{ marginTop: 0 }}>
          Now: {nowLabel}
        </p>

        <div className="btn-row">
          <button
            type="button"
            className="hbtn hbtn--primary"
            onClick={onPlay}
            disabled={busy || playDisabled}
            aria-label="Play welcome song"
          >
            ▶ Play
          </button>
          <button
            type="button"
            className="hbtn"
            onClick={onPause}
            disabled={busy}
            aria-label="Pause playback"
          >
            ❚❚ Pause
          </button>
        </div>

        {error ? (
          <div className="banner banner--danger" role="alert" style={{ marginTop: 8 }}>
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
