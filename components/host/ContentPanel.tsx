'use client';

import React from 'react';

interface ContentPanelProps {
  /** Read a content key; returns `fallback` (defaults to '') when absent. */
  get: (key: string, fallback?: string) => string;
  /** Write a content key. */
  set: (key: string, value: string) => void;
  /** Whether the panel body is hidden. */
  collapsed: boolean;
  /** Toggle collapse state. */
  onToggle: () => void;
}

/** A single labelled input (or textarea) bound to a content key. */
interface RowProps {
  field: string;
  label: string;
  ph: string;
  area?: boolean;
  get: ContentPanelProps['get'];
  set: ContentPanelProps['set'];
}

function Row({ field, label, ph, area = false, get, set }: RowProps): React.ReactElement {
  const value = get(field, '');
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void => set(field, e.target.value);

  return (
    <div className="ed-grp">
      <span className="k">{label}</span>
      {area ? (
        <textarea value={value} placeholder={ph} onChange={handleChange} />
      ) : (
        <input value={value} placeholder={ph} onChange={handleChange} />
      )}
    </div>
  );
}

/**
 * Live-content editor that pushes field values to the TV display.
 * Collapsible via the header click.
 */
export function ContentPanel({ get, set, collapsed, onToggle }: ContentPanelProps): React.ReactElement {
  return (
    <div className={`panel${collapsed ? ' collapsed' : ''}`}>
      {/* Clicking the heading toggles the collapsed state */}
      <h2 className="collapse-h" onClick={onToggle}>
        Live Content · Pushes to TV
      </h2>
      <div className="ed">
        {/* Winners — 1st Place */}
        <div className="ed-grp">
          <span className="k">Winners — 1st Place</span>
          <div className="ed-two">
            <input
              value={get('winTeam', '')}
              placeholder="Team name"
              onChange={(e) => set('winTeam', e.target.value)}
            />
            <input
              value={get('winPrize', '')}
              placeholder="Prize"
              onChange={(e) => set('winPrize', e.target.value)}
            />
          </div>
        </div>

        {/* Winners — Wooden Spoon */}
        <div className="ed-grp">
          <span className="k">Winners — Wooden Spoon (2nd from last)</span>
          <div className="ed-two">
            <input
              value={get('spoonTeam', '')}
              placeholder="Team name"
              onChange={(e) => set('spoonTeam', e.target.value)}
            />
            <input
              value={get('spoonPrize', '')}
              placeholder="Prize"
              onChange={(e) => set('spoonPrize', e.target.value)}
            />
          </div>
        </div>

        <Row field="nextDate" label="Next event date" ph="Fri 27 June · 8PM" get={get} set={set} />
        <Row field="hostName" label="Host name" ph="Nikki" get={get} set={set} />

        {/* Game themes side-by-side */}
        <div className="ed-two">
          <Row field="g1theme" label="Game 1 theme" ph="Pop Anthems" get={get} set={set} />
          <Row field="g2theme" label="Game 2 theme" ph="Throwbacks" get={get} set={set} />
        </div>

        <Row field="breakMins" label="Break — minutes" ph="10" get={get} set={set} />

        <p className="hint-small">
          Edits appear on the TV instantly. Tip: you can also tap any text on the TV preview after
          pressing &ldquo;Edit live&rdquo;.
        </p>
      </div>
    </div>
  );
}
