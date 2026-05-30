'use client';

import React from 'react';

interface Track {
  title: string;
  artist: string;
}

interface PlaylistPanelProps {
  playlist: Track[];
  /** Zero-based index of the track currently playing. */
  currentIdx: number;
  /** 1 or 2 when a game is active; null otherwise. */
  activeGame: number | null;
  /** Theme label for the active game (e.g. "Pop Anthems"). */
  theme: string;
}

/**
 * Read-only playlist viewer for the host console.
 * Highlights the current track and dims already-played ones.
 */
export function PlaylistPanel({ playlist, currentIdx, activeGame, theme }: PlaylistPanelProps): React.ReactElement {
  const heading = activeGame ? `Game ${activeGame} · ${theme}` : 'Playlist';

  return (
    <div className="panel">
      <h2>
        {heading}{' '}
        <span className="meta">
          {currentIdx + 1} / {playlist.length} played
        </span>
      </h2>
      <ol className="pl">
        {playlist.map((track, i) => {
          /** CSS class: current track, already played, or upcoming. */
          let itemClass = '';
          if (i === currentIdx) itemClass = 'cur';
          else if (i < currentIdx) itemClass = 'played';

          return (
            <li key={i} className={itemClass}>
              <span className="n">{i + 1}</span>
              <span className="t">
                {track.title}{' '}
                <span style={{ opacity: 0.6 }}>— {track.artist}</span>
              </span>
              {i === currentIdx && <span className="nowtag">Now</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
