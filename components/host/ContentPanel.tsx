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

/** A switch for tonight only, stored as "1" (on) or removed (off). */
function Toggle({ field, label, get, set }: { field: string; label: string; get: ContentPanelProps['get']; set: ContentPanelProps['set'] }): React.ReactElement {
  const checked = get(field, '') === '1';
  return (
    <label className="ed-grp" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => set(field, e.target.checked ? '1' : '')}
        style={{ width: 22, height: 22 }}
      />
      <span className="k" style={{ margin: 0 }}>{label}</span>
    </label>
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
        <div className="ed-two">
          <Row field="winPrize" label="1st place prize" ph="£25 bar voucher" get={get} set={set} />
          <Row field="spoonPrize" label="Wooden spoon prize" ph="Bottle of house wine" get={get} set={set} />
        </div>

        <Row field="hostName" label="Host name" ph="Leave blank to say 'your host'" get={get} set={set} />

        {/* The Thank You screen fills itself in (spec M-7): the review link and
            the next Music Bingo from the events feed. The host can only hide
            a card for tonight, never type a date or a link. */}
        <div className="ed-two">
          <Toggle field="tyHideReview" label="Hide 'Review us' tonight" get={get} set={set} />
          <Toggle field="tyHideNext" label="Hide 'What's on next' tonight" get={get} set={set} />
        </div>

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
