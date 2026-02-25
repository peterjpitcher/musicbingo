"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  helpClass,
  inputClass,
  labelClass,
  selectClass,
  textareaClass,
} from "@/components/ui/formStyles";
import { MAX_SONGS_PER_GAME, makeSongSelectionValue } from "@/lib/gameInput";
import type { Song } from "@/lib/types";

type ParsedResult = {
  songs: Song[];
  uniqueArtists: string[];
  uniqueTitles: string[];
};

type StepGameConfigProps = {
  gameNumber: 1 | 2;
  gameLabel: string;
  challengeLabel: string;
  theme: string;
  onTheme: (v: string) => void;
  songsText: string;
  onSongsText: (v: string) => void;
  challengeSong: string;
  onChallengeSong: (v: string) => void;
  parsed: ParsedResult;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
};

function songLabel(song: Song): string {
  return `${song.artist} - ${song.title}`;
}

export function StepGameConfig({
  gameNumber,
  gameLabel,
  challengeLabel,
  theme,
  onTheme,
  songsText,
  onSongsText,
  challengeSong,
  onChallengeSong,
  parsed,
  onBack,
  onNext,
  nextLabel = "Next →",
}: StepGameConfigProps) {
  const tooMany = parsed.songs.length > MAX_SONGS_PER_GAME;
  const notEnough =
    parsed.songs.length < 25 ||
    parsed.uniqueArtists.length < 25 ||
    parsed.uniqueTitles.length < 25;
  const canNext =
    parsed.songs.length >= 25 &&
    !tooMany &&
    parsed.uniqueArtists.length >= 25 &&
    parsed.uniqueTitles.length >= 25 &&
    Boolean(challengeSong);

  return (
    <Card>
      <h2 className="text-xl font-bold text-slate-800 mb-6">
        Game {gameNumber} — {gameLabel}
      </h2>

      <div className="space-y-5">
        <div>
          <label className={labelClass}>Theme</label>
          <input
            type="text"
            className={inputClass}
            value={theme}
            onChange={(e) => onTheme(e.target.value)}
            placeholder="e.g. Pop Classics"
          />
        </div>

        <div>
          <label className={labelClass}>Song List (max {MAX_SONGS_PER_GAME})</label>
          <textarea
            className={textareaClass}
            value={songsText}
            onChange={(e) => onSongsText(e.target.value)}
            placeholder={
              gameNumber === 1
                ? "Elvis Presley - Jailhouse Rock\nThe Beatles - Hey Jude\nQueen - Bohemian Rhapsody"
                : "ABBA - Dancing Queen\nBon Jovi - Livin on a Prayer\nMadonna - Like a Prayer"
            }
          />
          <div className="flex flex-wrap gap-4 mt-2">
            <p
              className={[
                helpClass,
                tooMany ? "text-red-600 font-semibold" : "",
              ].join(" ")}
            >
              Songs: {parsed.songs.length}/{MAX_SONGS_PER_GAME}
              {tooMany ? " — too many!" : ""}
            </p>
            <p
              className={[
                helpClass,
                notEnough && parsed.songs.length > 0 ? "text-amber-600" : "",
              ].join(" ")}
            >
              Unique artists: {parsed.uniqueArtists.length} / titles:{" "}
              {parsed.uniqueTitles.length}
              {notEnough && parsed.songs.length > 0 ? " (need ≥25 each)" : ""}
            </p>
          </div>
        </div>

        <div>
          <label className={labelClass}>{challengeLabel}</label>
          <select
            className={selectClass}
            value={challengeSong}
            onChange={(e) => onChallengeSong(e.target.value)}
            disabled={!parsed.songs.length}
          >
            {!parsed.songs.length ? (
              <option value="">Add songs first</option>
            ) : null}
            {parsed.songs.map((song) => {
              const value = makeSongSelectionValue(song);
              return (
                <option key={value} value={value}>
                  {songLabel(song)}
                </option>
              );
            })}
          </select>
          <p className={helpClass}>
            This song will be used as the challenge song for Game {gameNumber}
          </p>
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Button variant="primary" onClick={onNext} disabled={!canNext}>
          {nextLabel}
        </Button>
      </div>
    </Card>
  );
}
