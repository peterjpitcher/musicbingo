"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/Button";
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
  gameLabel: _gameLabel,
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

  const resolvedIntroSong = introSongs.find((s) => s.type === introSlot.type);

  return (
    <div className="wizpanel">
      <h2>Game {gameNumber}</h2>
      <div className="form-grid">
        <div className="fg span2">
          <label>Theme</label>
          <input
            type="text"
            value={theme}
            onChange={(e) => onTheme(e.target.value)}
            placeholder={gameNumber === 1 ? "Pop Anthems" : "Throwback Bangers"}
          />
        </div>
        <div className="fg span2">
          <label>Song list <span style={{ opacity: 0.5 }}>(one per line — &ldquo;Artist - Title&rdquo;)</span></label>
          <textarea
            value={songsText}
            onChange={(e) => onSongsText(e.target.value)}
            placeholder={
              gameNumber === 1
                ? "Elvis Presley - Jailhouse Rock\nThe Beatles - Hey Jude\nQueen - Bohemian Rhapsody"
                : "ABBA - Dancing Queen\nBon Jovi - Livin on a Prayer\nMadonna - Like a Prayer"
            }
          />
          <div className="songmeta">
            <span className={tooMany ? "bad" : parsed.songs.length >= 25 ? "ok" : "warn"}>
              {parsed.songs.length} songs
              {tooMany ? ` — too many (max ${MAX_SONGS_PER_GAME})` : parsed.songs.length < 25 ? " — need ≥25" : ""}
            </span>
            {notEnough && parsed.songs.length > 0 && (
              <span className="warn">Pool: {parsed.combinedPool.length} (need ≥25)</span>
            )}
          </div>
        </div>
        <div className="fg span2">
          <label>{introSlot.label}</label>
          <input
            type="text"
            value={introUrls[introSlot.type] ?? ""}
            onChange={(e) =>
              setIntroUrls((prev) => ({ ...prev, [introSlot.type]: e.target.value }))
            }
            onBlur={() => resolveIntroUrl(introSlot.type, introUrls[introSlot.type] ?? "")}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              setIntroUrls((prev) => ({ ...prev, [introSlot.type]: pasted }));
              setTimeout(() => resolveIntroUrl(introSlot.type, pasted), 0);
            }}
            placeholder="Paste Spotify track URL…"
            disabled={!spotifyConnected}
          />
          {!spotifyConnected && (
            <span className="help" style={{ color: "#e6b35c" }}>Connect Spotify on the Generate step to add an intro song</span>
          )}
          {introState[introSlot.type]?.loading && (
            <span className="help">Loading track info…</span>
          )}
          {introState[introSlot.type]?.error && (
            <span className="help" style={{ color: "#e88" }}>{introState[introSlot.type]!.error}</span>
          )}
          {resolvedIntroSong && !introState[introSlot.type]?.loading && !introState[introSlot.type]?.error && (
            <span className="help" style={{ color: "#8fe0ab" }}>
              ✓ {resolvedIntroSong.artist} – {resolvedIntroSong.title}
            </span>
          )}
          <span className="help">Plays in full with no auto-advance — the warm-up before Game {gameNumber}.</span>
        </div>
      </div>

      {/* Challenge songs */}
      <div className="fg" style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label>Challenge songs <span style={{ opacity: 0.5 }}>(play for {Math.floor(CHALLENGE_REVEAL_CONFIG.nextMs / 1000)}s)</span></label>
          <span className="chal-count">{selectedChallengeCount} / {CHALLENGE_SLOT_COUNT} selected</span>
        </div>
      </div>

      {Array.from({ length: CHALLENGE_SLOT_COUNT }, (_, i) => {
        const otherChallengeValues = challengeSongs.filter((_, j) => j !== i).map((c) => c.value);
        const available = getAvailableOptions(parsed.songs, otherChallengeValues);
        const current = challengeSongs[i] ?? { value: "", type: "sing-along" as const };

        return (
          <div className="chal-row" key={i}>
            <div className="seg">
              <button
                type="button"
                className={current.type === "sing-along" ? "on" : ""}
                onClick={() => {
                  const updated = [...challengeSongs];
                  while (updated.length <= i) updated.push({ value: "", type: "sing-along" as const });
                  updated[i] = { ...updated[i], type: "sing-along" };
                  onChallengeSongs(updated);
                }}
                disabled={!parsed.songs.length}
              >
                Sing
              </button>
              <button
                type="button"
                className={current.type === "dance-along" ? "on" : ""}
                onClick={() => {
                  const updated = [...challengeSongs];
                  while (updated.length <= i) updated.push({ value: "", type: "sing-along" as const });
                  updated[i] = { ...updated[i], type: "dance-along" };
                  onChallengeSongs(updated);
                }}
                disabled={!parsed.songs.length}
              >
                Dance
              </button>
            </div>
            <div className="fg" style={{ flex: 1 }}>
              <select
                value={current.value}
                onChange={(e) => {
                  const updated = [...challengeSongs];
                  while (updated.length <= i) updated.push({ value: "", type: "sing-along" as const });
                  updated[i] = { ...updated[i], value: e.target.value };
                  onChallengeSongs(updated);
                }}
                disabled={!parsed.songs.length}
              >
                <option value="">{parsed.songs.length ? `Challenge song ${i + 1} — None` : "Add songs first"}</option>
                {available.map((song) => {
                  const value = makeSongSelectionValue(song);
                  return <option key={value} value={value}>{songLabel(song)}</option>;
                })}
                {current.value && !available.some((s) => makeSongSelectionValue(s) === current.value) && (
                  <option key={current.value} value={current.value}>
                    {current.value.replace("|||", " - ")} (selected elsewhere)
                  </option>
                )}
              </select>
            </div>
          </div>
        );
      })}

      <p className="fg help" style={{ marginTop: 6, marginBottom: 0 }}>
        At least 1 challenge song required. Normal songs play for{" "}
        {Number.isFinite(normalSongSeconds) ? Math.round(normalSongSeconds) : Math.floor(DEFAULT_REVEAL_CONFIG.nextMs / 1000)}s;
        challenge songs play for {Math.floor(CHALLENGE_REVEAL_CONFIG.nextMs / 1000)}s.
      </p>

      <div className="wiznav">
        <Button variant="secondary" onClick={onBack}>← Back</Button>
        <Button variant="primary" onClick={onNext} disabled={!canNext}>{nextLabel}</Button>
      </div>
    </div>
  );
}
