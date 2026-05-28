"use client";

import { useState, useCallback } from "react";
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
import { CHALLENGE_REVEAL_CONFIG, DEFAULT_REVEAL_CONFIG, type IntroSong } from "@/lib/live/types";
import type { Song } from "@/lib/types";

type ParsedResult = {
  songs: Song[];
  uniqueArtists: string[];
  uniqueTitles: string[];
  combinedPool: string[];
};

type ChallengeEntry = {
  value: string;
  type: "sing-along" | "dance-along";
};

type IntroInputState = Record<
  string,
  { loading?: boolean; error?: string }
>;

type StepGameConfigProps = {
  gameNumber: 1 | 2;
  gameLabel: string;
  theme: string;
  onTheme: (v: string) => void;
  songsText: string;
  onSongsText: (v: string) => void;
  challengeSongs: ChallengeEntry[];
  onChallengeSongs: (v: ChallengeEntry[]) => void;
  introSongs: IntroSong[];
  onIntroSongsChange: (songs: IntroSong[]) => void;
  spotifyConnected: boolean;
  parsed: ParsedResult;
  normalSongSeconds: number;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
};

const CHALLENGE_SLOT_COUNT = 5;

const INTRO_CONFIG: Record<1 | 2, { type: IntroSong["type"]; label: string }> = {
  1: { type: "dance-along", label: "Dance Along Song (plays before game)" },
  2: { type: "sing-along", label: "Sing Along Song (plays before game)" },
};

function songLabel(song: Song): string {
  return `${song.artist} - ${song.title}`;
}

function parseSpotifyTrackUrl(
  input: string
): { trackId: string } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "Please paste a valid Spotify track URL" };
  }
  const uriMatch = trimmed.match(/^spotify:track:([A-Za-z0-9]+)$/);
  if (uriMatch) {
    return { trackId: uriMatch[1] };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { error: "Please paste a valid Spotify track URL" };
  }
  if (url.hostname === "spotify.link") {
    return { error: "Please paste the full track URL from Spotify" };
  }
  if (url.hostname !== "open.spotify.com") {
    return { error: "Please paste a valid Spotify track URL" };
  }
  const pathSegments = url.pathname.split("/").filter(Boolean);
  if (pathSegments.length < 2) {
    return { error: "Please paste a valid Spotify track URL" };
  }
  const resourceType = pathSegments[0];
  if (resourceType === "playlist") {
    return { error: "Please paste a track URL, not a playlist" };
  }
  if (resourceType === "album") {
    return { error: "Please paste a track URL, not an album" };
  }
  if (resourceType !== "track") {
    return { error: "Please paste a valid Spotify track URL" };
  }
  const trackId = pathSegments[1];
  if (!trackId || !/^[A-Za-z0-9]+$/.test(trackId)) {
    return { error: "Please paste a valid Spotify track URL" };
  }
  return { trackId };
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
  introSongs,
  onIntroSongsChange,
  spotifyConnected,
  parsed,
  normalSongSeconds,
  onBack,
  onNext,
  nextLabel = "Next →",
}: StepGameConfigProps) {
  const tooMany = parsed.songs.length > MAX_SONGS_PER_GAME;
  const notEnough =
    parsed.songs.length < 25 || parsed.combinedPool.length < 25;

  const selectedChallengeCount = challengeSongs.filter((s) => s.value).length;

  const introSlot = INTRO_CONFIG[gameNumber];

  const [introUrls, setIntroUrls] = useState<Record<string, string>>(() => {
    const existing = introSongs.find((s) => s.type === introSlot.type);
    return { [introSlot.type]: existing?.spotifyUrl ?? "" };
  });

  const [introState, setIntroState] = useState<IntroInputState>({});

  const introResolved = spotifyConnected
    ? introSongs.some((s) => s.type === introSlot.type && s.trackId)
    : true;

  const canNext =
    parsed.songs.length >= 25 &&
    !tooMany &&
    parsed.combinedPool.length >= 25 &&
    selectedChallengeCount >= 1 &&
    introResolved;

  const resolveIntroUrl = useCallback(
    async (type: IntroSong["type"], rawUrl: string) => {
      const url = rawUrl.trim();
      if (!url) {
        onIntroSongsChange(introSongs.filter((s) => s.type !== type));
        setIntroState((prev) => {
          const next = { ...prev };
          delete next[type];
          return next;
        });
        return;
      }

      const parseResult = parseSpotifyTrackUrl(url);
      if ("error" in parseResult) {
        setIntroState((prev) => ({
          ...prev,
          [type]: { error: parseResult.error },
        }));
        return;
      }

      setIntroState((prev) => ({
        ...prev,
        [type]: { loading: true },
      }));

      try {
        const res = await fetch(
          `/api/spotify/track/${encodeURIComponent(parseResult.trackId)}`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Request failed" }));
          setIntroState((prev) => ({
            ...prev,
            [type]: { error: (body as { error?: string }).error ?? "Request failed" },
          }));
          return;
        }

        const data = (await res.json()) as {
          trackId: string;
          title: string;
          artist: string;
        };

        const newSong: IntroSong = {
          type,
          spotifyUrl: url,
          trackId: data.trackId,
          artist: data.artist,
          title: data.title,
        };

        const updated = introSongs.filter((s) => s.type !== type);
        updated.push(newSong);
        onIntroSongsChange(updated);

        setIntroState((prev) => {
          const next = { ...prev };
          delete next[type];
          return next;
        });
      } catch {
        setIntroState((prev) => ({
          ...prev,
          [type]: { error: "Failed to fetch track details" },
        }));
      }
    },
    [introSongs, onIntroSongsChange]
  );

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
          <label className={labelClass}>
            Song List (max {MAX_SONGS_PER_GAME})
          </label>
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

        {/* Intro song URL input — one per game: dance-along for G1, sing-along for G2 */}
        <div>
          <label className={labelClass}>{introSlot.label}</label>
          <input
            type="text"
            className={inputClass}
            value={introUrls[introSlot.type] ?? ""}
            onChange={(e) =>
              setIntroUrls((prev) => ({
                ...prev,
                [introSlot.type]: e.target.value,
              }))
            }
            onBlur={() => resolveIntroUrl(introSlot.type, introUrls[introSlot.type] ?? "")}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              setIntroUrls((prev) => ({
                ...prev,
                [introSlot.type]: pasted,
              }));
              setTimeout(() => resolveIntroUrl(introSlot.type, pasted), 0);
            }}
            placeholder="Paste Spotify track URL..."
            disabled={!spotifyConnected}
          />
          {!spotifyConnected && (
            <p className={`${helpClass} text-amber-600`}>
              Connect Spotify first to add intro song
            </p>
          )}
          {introState[introSlot.type]?.loading && (
            <p className={`${helpClass} text-slate-500`}>
              Loading track info...
            </p>
          )}
          {introState[introSlot.type]?.error && (
            <p className={`${helpClass} text-red-600`}>{introState[introSlot.type]!.error}</p>
          )}
          {introSongs.find((s) => s.type === introSlot.type) &&
            !introState[introSlot.type]?.loading &&
            !introState[introSlot.type]?.error && (
              <p className={`${helpClass} text-green-700`}>
                {introSongs.find((s) => s.type === introSlot.type)!.artist} -{" "}
                {introSongs.find((s) => s.type === introSlot.type)!.title}
              </p>
            )}
        </div>

        {/* Challenge song dropdowns */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className={labelClass}>Challenge Songs</label>
            <span className="text-sm text-slate-500">
              Challenge songs: {selectedChallengeCount}/{CHALLENGE_SLOT_COUNT}{" "}
              selected
            </span>
          </div>

          {Array.from({ length: CHALLENGE_SLOT_COUNT }, (_, i) => {
            const otherChallengeValues = challengeSongs
              .filter((_, j) => j !== i)
              .map((c) => c.value);
            const available = getAvailableOptions(
              parsed.songs,
              otherChallengeValues
            );
            const current = challengeSongs[i] ?? {
              value: "",
              type: "sing-along" as const,
            };

            return (
              <div key={i} className="flex gap-2 items-end">
                <div className="w-36 shrink-0">
                  <label className={`${labelClass} text-sm`}>Type</label>
                  <select
                    className={selectClass}
                    value={current.type}
                    onChange={(e) => {
                      const updated = [...challengeSongs];
                      while (updated.length <= i)
                        updated.push({
                          value: "",
                          type: "sing-along" as const,
                        });
                      updated[i] = {
                        ...updated[i],
                        type: e.target.value as "sing-along" | "dance-along",
                      };
                      onChallengeSongs(updated);
                    }}
                    disabled={!parsed.songs.length}
                  >
                    <option value="sing-along">Sing Along</option>
                    <option value="dance-along">Dance Along</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className={`${labelClass} text-sm`}>
                    Challenge Song {i + 1}
                  </label>
                  <select
                    className={selectClass}
                    value={current.value}
                    onChange={(e) => {
                      const updated = [...challengeSongs];
                      while (updated.length <= i)
                        updated.push({
                          value: "",
                          type: "sing-along" as const,
                        });
                      updated[i] = { ...updated[i], value: e.target.value };
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
                    {current.value &&
                      !available.some(
                        (s) => makeSongSelectionValue(s) === current.value
                      ) && (
                        <option key={current.value} value={current.value}>
                          {current.value.replace("|||", " - ")} (selected
                          elsewhere)
                        </option>
                      )}
                  </select>
                </div>
              </div>
            );
          })}

          <p className={helpClass}>
            At least 1 challenge song required. These songs play for {Math.floor(CHALLENGE_REVEAL_CONFIG.nextMs / 1000)} seconds
            instead of {Number.isFinite(normalSongSeconds) ? Math.round(normalSongSeconds) : Math.floor(DEFAULT_REVEAL_CONFIG.nextMs / 1000)}.
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
