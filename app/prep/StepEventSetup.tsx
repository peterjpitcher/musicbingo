"use client";

import { BrandSelector } from "@/components/brand/BrandSelector";
import { Button } from "@/components/ui/Button";
import { parseRevealConfigInputs } from "@/lib/live/timing";
import { MAX_SONG_PLAY_MS, MIN_SONG_PLAY_MS } from "@/lib/live/types";

type StepEventSetupProps = {
  eventDate: string;
  onEventDate: (v: string) => void;
  countInput: string;
  onCountInput: (v: string) => void;
  songPlaySecondsInput: string;
  onSongPlaySecondsInput: (v: string) => void;
  albumRevealSecondsInput: string;
  onAlbumRevealSecondsInput: (v: string) => void;
  titleRevealSecondsInput: string;
  onTitleRevealSecondsInput: (v: string) => void;
  artistRevealSecondsInput: string;
  onArtistRevealSecondsInput: (v: string) => void;
  onResetRevealDefaults: () => void;
  sessionName: string;
  onSessionName: (v: string) => void;
  breakPlaylistId: string;
  onBreakPlaylistId: (v: string) => void;
  selectedBrandId: string | null;
  onSelectedBrandId: (v: string) => void;
  onNext: () => void;
};

export function StepEventSetup({
  eventDate,
  onEventDate,
  countInput,
  onCountInput,
  songPlaySecondsInput,
  onSongPlaySecondsInput,
  albumRevealSecondsInput,
  onAlbumRevealSecondsInput,
  titleRevealSecondsInput,
  onTitleRevealSecondsInput,
  artistRevealSecondsInput,
  onArtistRevealSecondsInput,
  onResetRevealDefaults,
  sessionName,
  onSessionName,
  breakPlaylistId,
  onBreakPlaylistId,
  selectedBrandId,
  onSelectedBrandId,
  onNext,
}: StepEventSetupProps) {
  const count = Number.parseInt(countInput, 10);
  const revealConfig = parseRevealConfigInputs({
    albumSeconds: albumRevealSecondsInput,
    titleSeconds: titleRevealSecondsInput,
    artistSeconds: artistRevealSecondsInput,
    songPlaySeconds: songPlaySecondsInput,
  });
  const timingValid = revealConfig !== null;
  const canNext =
    eventDate.trim() !== "" &&
    Number.isFinite(count) &&
    count >= 1 &&
    count <= 1000 &&
    timingValid;

  return (
    <div className="wizpanel">
      <h2>Event Setup</h2>
      <div className="form-grid">
        <div className="fg">
          <label>Session name</label>
          <input
            type="text"
            value={sessionName}
            onChange={(e) => onSessionName(e.target.value)}
            placeholder="Music Bingo - Event Date"
          />
          <span className="help">Identifies this game in the dashboard &amp; host console</span>
        </div>
        <div className="fg">
          <label>Event date</label>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => onEventDate(e.target.value)}
          />
          <span className="help">Used in PDFs, DOCX clipboard, and playlist names</span>
        </div>
        <div className="fg">
          <label>Pages <span style={{ opacity: 0.5 }}>(6 cards each)</span></label>
          <input
            type="number"
            min={1}
            max={200}
            value={countInput}
            onChange={(e) => onCountInput(e.target.value)}
          />
          <span className="help">{(Number.parseInt(countInput, 10) || 0) * 6} cards total</span>
        </div>
        <div className="fg">
          <label>Venue / brand</label>
          <BrandSelector
            value={selectedBrandId}
            onChange={onSelectedBrandId}
          />
          <span className="help">Brand applied to PDFs, guest screens, and host theming</span>
        </div>
        <div className="fg span2">
          <label>Break playlist URL <span style={{ opacity: 0.5 }}>(optional)</span></label>
          <input
            type="text"
            value={breakPlaylistId}
            onChange={(e) => onBreakPlaylistId(e.target.value)}
            placeholder="https://open.spotify.com/playlist/..."
          />
          <span className="help">Spotify switches to this playlist during breaks, then restarts the last song when you resume</span>
        </div>
      </div>

      <div className="fg" style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label>Normal song timing <span style={{ opacity: 0.5 }}>(seconds)</span></label>
          <Button variant="secondary" size="sm" onClick={onResetRevealDefaults}>Use Defaults</Button>
        </div>
      </div>
      <div className="timing-grid">
        {([
          ["Song length", songPlaySecondsInput, onSongPlaySecondsInput, Math.floor(MIN_SONG_PLAY_MS / 1000), Math.floor(MAX_SONG_PLAY_MS / 1000)],
          ["Album reveal", albumRevealSecondsInput, onAlbumRevealSecondsInput, 0, Math.floor(MAX_SONG_PLAY_MS / 1000)],
          ["Title reveal", titleRevealSecondsInput, onTitleRevealSecondsInput, 0, Math.floor(MAX_SONG_PLAY_MS / 1000)],
          ["Artist reveal", artistRevealSecondsInput, onArtistRevealSecondsInput, 0, Math.floor(MAX_SONG_PLAY_MS / 1000)],
        ] as const).map(([lbl, val, setter, mn, mx]) => (
          <div className="fg" key={lbl}>
            <label style={{ fontSize: 11 }}>{lbl}</label>
            <input
              type="number"
              min={mn}
              max={mx}
              step={0.25}
              value={val}
              onChange={(e) => setter(e.target.value)}
            />
          </div>
        ))}
      </div>
      {!timingValid && (
        <p style={{ fontSize: 12, color: "#e88", marginTop: 6 }}>
          Reveal times must stay in order (album → title → artist) before the next song.
        </p>
      )}

      <div className="wiznav">
        <span />
        <Button variant="primary" onClick={onNext} disabled={!canNext}>
          Next: Game 1 →
        </Button>
      </div>
    </div>
  );
}
