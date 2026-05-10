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
  combinedPool: string[];
};

type StepGameConfigProps = {
  gameNumber: 1 | 2;
  gameLabel: string;
  theme: string;
  onTheme: (v: string) => void;
  songsText: string;
  onSongsText: (v: string) => void;
  challengeSongs: string[];
  onChallengeSongs: (v: string[]) => void;
  introSong: string;
  onIntroSong: (v: string) => void;
  parsed: ParsedResult;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
};

const CHALLENGE_SLOT_COUNT = 5;

function songLabel(song: Song): string {
  return `${song.artist} - ${song.title}`;
}

function getAvailableOptions(songs: Song[], excludeValues: string[]): Song[] {
  const excluded = new Set(excludeValues.filter(Boolean));
  return songs.filter((s) => !excluded.has(makeSongSelectionValue(s)));
}

export function StepGameConfig({
  gameNumber,
  gameLabel,
  theme,
  onTheme,
  songsText,
  onSongsText,
  challengeSongs,
  onChallengeSongs,
  introSong,
  onIntroSong,
  parsed,
  onBack,
  onNext,
  nextLabel = "Next →",
}: StepGameConfigProps) {
  const tooMany = parsed.songs.length > MAX_SONGS_PER_GAME;
  const notEnough =
    parsed.songs.length < 25 ||
    parsed.combinedPool.length < 25;

  const selectedChallengeCount = challengeSongs.filter((s) => s).length;

  const canNext =
    parsed.songs.length >= 25 &&
    !tooMany &&
    parsed.combinedPool.length >= 25 &&
    selectedChallengeCount >= 1;

  const introLabel =
    gameNumber === 1
      ? "Dance Along Song (plays before game)"
      : "Sing Along Song (plays before game)";

  // For the intro dropdown, exclude all selected challenge songs
  const introAvailable = getAvailableOptions(parsed.songs, challengeSongs);

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
              Unique pool items: {parsed.combinedPool.length}
              {notEnough && parsed.songs.length > 0 ? " (need ≥25)" : ""}
            </p>
          </div>
        </div>

        {/* Intro song dropdown */}
        <div>
          <label className={labelClass}>{introLabel}</label>
          <select
            className={selectClass}
            value={introSong}
            onChange={(e) => onIntroSong(e.target.value)}
            disabled={!parsed.songs.length}
          >
            <option value="">None (no intro)</option>
            {introAvailable.map((song) => {
              const value = makeSongSelectionValue(song);
              return (
                <option key={value} value={value}>
                  {songLabel(song)}
                </option>
              );
            })}
          </select>
          <p className={helpClass}>
            Optional song that plays before Game {gameNumber} begins
          </p>
        </div>

        {/* Challenge song dropdowns */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className={labelClass}>Challenge Songs</label>
            <span className="text-sm text-slate-500">
              Challenge songs: {selectedChallengeCount}/{CHALLENGE_SLOT_COUNT} selected
            </span>
          </div>

          {Array.from({ length: CHALLENGE_SLOT_COUNT }, (_, i) => {
            // For each challenge slot, exclude: introSong + all other challenge selections (not this slot)
            const otherChallengeValues = challengeSongs.filter((_, j) => j !== i);
            const excludeValues = [introSong, ...otherChallengeValues];
            const available = getAvailableOptions(parsed.songs, excludeValues);
            const currentValue = challengeSongs[i] ?? "";

            return (
              <div key={i}>
                <label className={`${labelClass} text-sm`}>
                  Challenge Song {i + 1}
                </label>
                <select
                  className={selectClass}
                  value={currentValue}
                  onChange={(e) => {
                    const updated = [...challengeSongs];
                    // Ensure array is long enough
                    while (updated.length <= i) updated.push("");
                    updated[i] = e.target.value;
                    onChallengeSongs(updated);
                  }}
                  disabled={!parsed.songs.length}
                >
                  {!parsed.songs.length ? (
                    <option value="">Add songs first</option>
                  ) : (
                    <option value="">None</option>
                  )}
                  {available.map((song) => {
                    const value = makeSongSelectionValue(song);
                    return (
                      <option key={value} value={value}>
                        {songLabel(song)}
                      </option>
                    );
                  })}
                  {/* Keep current selection visible even if filtered out (prevents jump) */}
                  {currentValue &&
                    !available.some(
                      (s) => makeSongSelectionValue(s) === currentValue
                    ) && (
                      <option key={currentValue} value={currentValue}>
                        {currentValue.replace("|||", " - ")} (selected elsewhere)
                      </option>
                    )}
                </select>
              </div>
            );
          })}

          <p className={helpClass}>
            At least 1 challenge song required. These songs play for 90 seconds instead of 60.
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
