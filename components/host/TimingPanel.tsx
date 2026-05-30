'use client';

import { useState } from 'react';

/** Shape of timing values (all in seconds). */
export interface TimingValues {
  song: number;
  album: number;
  title: number;
  artist: number;
}

interface TimingPanelProps {
  timing: TimingValues;
  setTiming: (t: TimingValues) => void;
}

/** Reveal-timing editor. Keeps a local draft until the host saves. */
export function TimingPanel({ timing, setTiming }: TimingPanelProps): React.ReactElement {
  const [draft, setDraft] = useState<TimingValues>(timing);

  /** Update a single key in the draft. */
  const handleChange =
    (key: keyof TimingValues) =>
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setDraft((prev) => ({ ...prev, [key]: e.target.value }));
    };

  /** True when the draft differs from the committed timing. */
  const changed =
    JSON.stringify({
      song: +draft.song,
      album: +draft.album,
      title: +draft.title,
      artist: +draft.artist,
    }) !== JSON.stringify(timing);

  const fields: Array<[keyof TimingValues, string]> = [
    ['song', 'Song length'],
    ['album', 'Album reveal'],
    ['title', 'Title reveal'],
    ['artist', 'Artist reveal'],
  ];

  const DEFAULT_TIMING: TimingValues = { song: 45, album: 11, title: 23, artist: 30 };

  const handleSave = (): void => {
    setTiming({
      song: +draft.song,
      album: +draft.album,
      title: +draft.title,
      artist: +draft.artist,
    });
  };

  const handleDefaults = (): void => {
    setDraft(DEFAULT_TIMING);
    setTiming(DEFAULT_TIMING);
  };

  return (
    <div className="panel">
      <h2>
        Reveal Timing <span className="meta">seconds</span>
      </h2>
      <div className="fields">
        {fields.map(([key, label]) => (
          <div className="field" key={key}>
            <label>{label}</label>
            <input
              type="number"
              min={0}
              step={1}
              value={draft[key]}
              onChange={handleChange(key)}
            />
          </div>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="hbtn grow" disabled={!changed} onClick={handleSave}>
          Save Timing
        </button>
        <button className="hbtn grow" onClick={handleDefaults}>
          Use Defaults
        </button>
      </div>
      <p className="hint-small">
        Defaults scale to the clip; custom values must stay in order before the next-song time.
      </p>
    </div>
  );
}
