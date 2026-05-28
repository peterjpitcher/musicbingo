"use client";

import { BrandSelector } from "@/components/brand/BrandSelector";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { helpClass, inputClass, labelClass } from "@/components/ui/formStyles";
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
    <Card>
      <h2 className="text-xl font-bold text-slate-800 mb-6">Event Setup</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
        <div>
          <label className={labelClass}>Event Date</label>
          <input
            type="date"
            className={inputClass}
            value={eventDate}
            onChange={(e) => onEventDate(e.target.value)}
          />
          <p className={helpClass}>Used in PDFs, DOCX clipboard, and playlist names</p>
        </div>
        <div>
          <label className={labelClass}>Pages</label>
          <input
            type="number"
            className={inputClass}
            min={1}
            max={200}
            value={countInput}
            onChange={(e) => onCountInput(e.target.value)}
          />
          <p className={helpClass}>6 cards per page — 40 pages = 240 cards</p>
        </div>
      </div>
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <label className={labelClass}>Normal Song Timing</label>
          <Button variant="secondary" size="sm" onClick={onResetRevealDefaults}>
            Use Default Reveals
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={`${labelClass} text-sm`}>Song length</label>
            <input
              type="number"
              className={inputClass}
              min={Math.floor(MIN_SONG_PLAY_MS / 1000)}
              max={Math.floor(MAX_SONG_PLAY_MS / 1000)}
              step={0.25}
              value={songPlaySecondsInput}
              onChange={(e) => onSongPlaySecondsInput(e.target.value)}
            />
          </div>
          <div>
            <label className={`${labelClass} text-sm`}>Album reveal</label>
            <input
              type="number"
              className={inputClass}
              min={0}
              max={Math.floor(MAX_SONG_PLAY_MS / 1000)}
              step={0.25}
              value={albumRevealSecondsInput}
              onChange={(e) => onAlbumRevealSecondsInput(e.target.value)}
            />
          </div>
          <div>
            <label className={`${labelClass} text-sm`}>Title reveal</label>
            <input
              type="number"
              className={inputClass}
              min={0}
              max={Math.floor(MAX_SONG_PLAY_MS / 1000)}
              step={0.25}
              value={titleRevealSecondsInput}
              onChange={(e) => onTitleRevealSecondsInput(e.target.value)}
            />
          </div>
          <div>
            <label className={`${labelClass} text-sm`}>Artist reveal</label>
            <input
              type="number"
              className={inputClass}
              min={0}
              max={Math.floor(MAX_SONG_PLAY_MS / 1000)}
              step={0.25}
              value={artistRevealSecondsInput}
              onChange={(e) => onArtistRevealSecondsInput(e.target.value)}
            />
          </div>
        </div>
        <p className={timingValid ? helpClass : `${helpClass} text-red-600`}>
          Defaults scale to song length; custom reveal times must stay in order before the next song.
        </p>
      </div>
      <div className="mb-5">
        <label className={labelClass}>Session Name</label>
        <input
          type="text"
          className={inputClass}
          value={sessionName}
          onChange={(e) => onSessionName(e.target.value)}
          placeholder="Music Bingo - Event Date"
        />
        <p className={helpClass}>Used to identify this session in the live host console</p>
      </div>
      <div className="mb-5">
        <label className={labelClass}>Brand</label>
        <BrandSelector
          value={selectedBrandId}
          onChange={onSelectedBrandId}
          className={inputClass}
        />
        <p className={helpClass}>Venue brand applied to PDFs, guest screens, and host theming</p>
      </div>
      <div className="mb-6">
        <label className={labelClass}>Break Playlist URL <span className="font-normal text-slate-400">(optional)</span></label>
        <input
          type="text"
          className={inputClass}
          value={breakPlaylistId}
          onChange={(e) => onBreakPlaylistId(e.target.value)}
          placeholder="https://open.spotify.com/playlist/..."
        />
        <p className={helpClass}>Spotify will switch to this playlist during breaks, then restart the last song when you resume</p>
      </div>
      <div className="flex justify-end">
        <Button variant="primary" onClick={onNext} disabled={!canNext}>
          Next: Game 1 →
        </Button>
      </div>
    </Card>
  );
}
