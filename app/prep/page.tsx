"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { formatEventDateDisplay } from "@/lib/eventDate";
import { DEFAULT_GAME_THEME, MAX_SONGS_PER_GAME, makeSongSelectionValue } from "@/lib/gameInput";
import { exportLiveSessionJson, getLiveSession, upsertLiveSession } from "@/lib/live/sessionApi";
import {
  formatSecondsInput,
  parseRevealConfigInputs,
} from "@/lib/live/timing";
import {
  DEFAULT_REVEAL_CONFIG,
  getChallengeSongs,
  getIntroSongs,
  LIVE_SESSION_VERSION,
  type IntroSong,
  type LiveGameConfig,
  type LiveSessionV1,
} from "@/lib/live/types";
import { parseSongListText } from "@/lib/parser";
import { parseSpotifyTrackUrl } from "@/lib/spotifyTrackUrl";
import type { Song } from "@/lib/types";
import { sanitizeFilenamePart } from "@/lib/utils";
import { StepEventSetup } from "./StepEventSetup";
import { StepGameConfig } from "./StepGameConfig";
import { StepGenerateConnect } from "./StepGenerateConnect";

const STEPS = [
  { label: "Event Setup" },
  { label: "Game 1" },
  { label: "Game 2" },
  { label: "Generate" },
];

type SpotifyPlaylistResult = {
  gameNumber: number;
  theme: string;
  playlistId: string | null;
  playlistName: string;
  playlistUrl: string | null;
  totalSongs: number;
  addedCount: number;
  notFoundCount: number;
  notFound: Array<{ artist: string; title: string }>;
};

type ChallengeEntry = { value: string; type: "sing-along" | "dance-along" };

type PlaylistPhaseResult = {
  gameNumber: 1 | 2;
  playlistId: string;
  playlistUrl: string;
  addedCount: number;
  totalSongs: number;
  notFoundSongs: Array<{ artist: string; title: string }>;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseChallengeSongSelection(selection: string): { artist: string; title: string } {
  const delim = selection.indexOf("|||");
  if (delim > 0 && delim < selection.length - 3) {
    return { artist: selection.slice(0, delim).trim(), title: selection.slice(delim + 3).trim() };
  }
  return { artist: "", title: "" };
}

/**
 * Build the wizard's ChallengeEntry[] (length 5) from a persisted game config.
 * Reads the AUTHORITATIVE challenge songs (with their real type) via
 * getChallengeSongs — prepData would lose the dance-along/sing-along type.
 * The `value` is encoded as `${artist}|||${title}` to match
 * makeSongSelectionValue / parseChallengeSongSelection so it survives the
 * song-list pruning effects and round-trips correctly on save.
 */
function challengeEntriesFromGame(game: LiveGameConfig): ChallengeEntry[] {
  const entries: ChallengeEntry[] = Array(5).fill(null).map(() => ({ value: "", type: "sing-along" as const }));
  getChallengeSongs(game)
    .slice(0, 5)
    .forEach((cs, idx) => {
      if (!cs.artist || !cs.title) return;
      entries[idx] = { value: `${cs.artist}|||${cs.title}`, type: cs.type };
    });
  return entries;
}

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normaliseIntroSongsForSignature(songs: IntroSong[]): IntroSong[] {
  return [...songs].sort((a, b) => a.type.localeCompare(b.type));
}

function PrepPageInner() {
  const searchParams = useSearchParams();
  const editSessionParam = searchParams.get("session");

  const [currentStep, setCurrentStep] = useState(0);
  // When editing an existing session we preserve its id so upsert overwrites it
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState<string>("");
  const [editHydrationNotice, setEditHydrationNotice] = useState<string>("");

  // Step 0 fields
  const [eventDate, setEventDate] = useState<string>(todayIso());
  const [countInput, setCountInput] = useState<string>("40");
  const [songPlaySecondsInput, setSongPlaySecondsInput] = useState<string>(
    formatSecondsInput(DEFAULT_REVEAL_CONFIG.nextMs)
  );
  const [albumRevealSecondsInput, setAlbumRevealSecondsInput] = useState<string>(
    formatSecondsInput(DEFAULT_REVEAL_CONFIG.albumMs)
  );
  const [titleRevealSecondsInput, setTitleRevealSecondsInput] = useState<string>(
    formatSecondsInput(DEFAULT_REVEAL_CONFIG.titleMs)
  );
  const [artistRevealSecondsInput, setArtistRevealSecondsInput] = useState<string>(
    formatSecondsInput(DEFAULT_REVEAL_CONFIG.artistMs)
  );
  const [liveSessionName, setLiveSessionName] = useState<string>("");
  const [liveSessionNameDirty, setLiveSessionNameDirty] = useState<boolean>(false);
  const [breakPlaylistId, setBreakPlaylistId] = useState<string>("");
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  // Step 1 fields
  const [game1Theme, setGame1Theme] = useState<string>(DEFAULT_GAME_THEME);
  const [game1SongsText, setGame1SongsText] = useState<string>("");
  const [game1ChallengeSongs, setGame1ChallengeSongs] = useState<ChallengeEntry[]>(
    Array(5).fill(null).map(() => ({ value: "", type: "sing-along" as const }))
  );
  const [game1IntroUrl, setGame1IntroUrl] = useState<string>("");
  const [game1IntroSongs, setGame1IntroSongs] = useState<IntroSong[]>([]);

  // Step 2 fields
  const [game2Theme, setGame2Theme] = useState<string>(DEFAULT_GAME_THEME);
  const [game2SongsText, setGame2SongsText] = useState<string>("");
  const [game2ChallengeSongs, setGame2ChallengeSongs] = useState<ChallengeEntry[]>(
    Array(5).fill(null).map(() => ({ value: "", type: "sing-along" as const }))
  );
  const [game2IntroUrl, setGame2IntroUrl] = useState<string>("");
  const [game2IntroSongs, setGame2IntroSongs] = useState<IntroSong[]>([]);

  // Legacy single challenge song (backward compat — derived from first element)
  const game1ChallengeSong = game1ChallengeSongs[0]?.value ?? "";
  const game2ChallengeSong = game2ChallengeSongs[0]?.value ?? "";

  // Step 3 state
  const [error, setError] = useState<string>("");
  const [qrNotice, setQrNotice] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);
  const [spotifyConnecting, setSpotifyConnecting] = useState<boolean>(false);
  const [spotifyCreating, setSpotifyCreating] = useState<boolean>(false);
  const [spotifyResult, setSpotifyResult] = useState<SpotifyPlaylistResult[] | null>(null);
  const [spotifyCallbackUrl, setSpotifyCallbackUrl] = useState<string>("/api/spotify/callback");
  const [liveSessionNotice, setLiveSessionNotice] = useState<string>("");
  const [playlistResults, setPlaylistResults] = useState<PlaylistPhaseResult[] | null>(null);
  const [playlistsCreated, setPlaylistsCreated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pendingAutoSave = useRef(false);
  const saveLiveSessionRef = useRef<() => Promise<void>>();

  const parsedGame1 = useMemo(() => parseSongListText(game1SongsText), [game1SongsText]);
  const parsedGame2 = useMemo(() => parseSongListText(game2SongsText), [game2SongsText]);
  const normalSongSeconds = Number(songPlaySecondsInput);
  const playlistInputSignature = useMemo(
    () =>
      JSON.stringify({
        eventDate: eventDate.trim(),
        game1Theme: game1Theme.trim(),
        game2Theme: game2Theme.trim(),
        game1SongsText,
        game2SongsText,
        game1IntroUrl: game1IntroUrl.trim(),
        game2IntroUrl: game2IntroUrl.trim(),
        game1IntroSongs: normaliseIntroSongsForSignature(game1IntroSongs),
        game2IntroSongs: normaliseIntroSongsForSignature(game2IntroSongs),
      }),
    [
      eventDate,
      game1IntroSongs,
      game1IntroUrl,
      game1SongsText,
      game1Theme,
      game2IntroSongs,
      game2IntroUrl,
      game2SongsText,
      game2Theme,
    ]
  );
  const formInputSignature = useMemo(
    () =>
      JSON.stringify({
        eventDate,
        countInput,
        songPlaySecondsInput,
        albumRevealSecondsInput,
        titleRevealSecondsInput,
        artistRevealSecondsInput,
        breakPlaylistId,
        selectedBrandId,
        game1Theme,
        game1SongsText,
        game1ChallengeSongs,
        game1IntroUrl,
        game1IntroSongs: normaliseIntroSongsForSignature(game1IntroSongs),
        game2Theme,
        game2SongsText,
        game2ChallengeSongs,
        game2IntroUrl,
        game2IntroSongs: normaliseIntroSongsForSignature(game2IntroSongs),
      }),
    [
      albumRevealSecondsInput,
      artistRevealSecondsInput,
      breakPlaylistId,
      countInput,
      eventDate,
      game1ChallengeSongs,
      game1IntroSongs,
      game1IntroUrl,
      game1SongsText,
      game1Theme,
      game2ChallengeSongs,
      game2IntroSongs,
      game2IntroUrl,
      game2SongsText,
      game2Theme,
      selectedBrandId,
      songPlaySecondsInput,
      titleRevealSecondsInput,
    ]
  );
  const playlistSignatureRef = useRef<string | null>(null);
  const formSignatureRef = useRef<string>(formInputSignature);

  function resetRevealTimingDefaults() {
    const revealConfig = DEFAULT_REVEAL_CONFIG;
    setSongPlaySecondsInput(formatSecondsInput(revealConfig.nextMs));
    setAlbumRevealSecondsInput(formatSecondsInput(revealConfig.albumMs));
    setTitleRevealSecondsInput(formatSecondsInput(revealConfig.titleMs));
    setArtistRevealSecondsInput(formatSecondsInput(revealConfig.artistMs));
  }

  useEffect(() => {
    setSpotifyCallbackUrl(`${window.location.origin}/api/spotify/callback`);
    fetch("/api/spotify/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSpotifyConnected(Boolean(data?.connected)))
      .catch(() => {});
  }, []);

  // Hydrate wizard state when ?session=<id> is present (edit mode)
  useEffect(() => {
    if (!editSessionParam) return;

    let cancelled = false;
    void (async () => {
      try {
        const loaded = await getLiveSession(editSessionParam);
        if (cancelled) return;

        if (!loaded || !loaded.prepData) {
          setEditHydrationNotice(
            "Could not reconstruct the original song text for this session — the prep data is missing. " +
            "You can duplicate it from the dashboard or proceed as a new game."
          );
          return;
        }

        const pd = loaded.prepData;
        // The persisted game configs are AUTHORITATIVE for challenge-song types
        // and intro songs (prepData is lossy: it drops intro songs and the
        // dance-along/sing-along type). Read scalars from prepData, but read
        // challenge/intro songs from loaded.games[i].
        const games = Array.isArray(loaded.games) ? loaded.games : [];
        const findGame = (n: 1 | 2): LiveGameConfig | undefined =>
          games.find((g) => g?.gameNumber === n);

        // Hydrate step-0 fields
        if (loaded.eventDateInput) setEventDate(loaded.eventDateInput);
        if (typeof pd.cardCount === "number") setCountInput(String(pd.cardCount));
        if (loaded.revealConfig) {
          setSongPlaySecondsInput(formatSecondsInput(loaded.revealConfig.nextMs));
          setAlbumRevealSecondsInput(formatSecondsInput(loaded.revealConfig.albumMs));
          setTitleRevealSecondsInput(formatSecondsInput(loaded.revealConfig.titleMs));
          setArtistRevealSecondsInput(formatSecondsInput(loaded.revealConfig.artistMs));
        }
        if (loaded.name) {
          setLiveSessionName(loaded.name);
          setLiveSessionNameDirty(true);
        }
        if (loaded.breakPlaylistId != null) setBreakPlaylistId(loaded.breakPlaylistId);
        if (loaded.brandId != null) setSelectedBrandId(loaded.brandId);

        // Hydrate step-1 fields
        if (pd.game1Theme) setGame1Theme(pd.game1Theme);
        if (pd.game1SongsText) setGame1SongsText(pd.game1SongsText);
        const game1 = findGame(1);
        if (game1) {
          const entries = challengeEntriesFromGame(game1);
          if (entries.some((c) => c.value)) setGame1ChallengeSongs(entries);
          const intros = getIntroSongs(game1);
          if (intros.length > 0) {
            setGame1IntroSongs(intros);
            setGame1IntroUrl(intros.find((s) => s.type === "dance-along")?.spotifyUrl ?? intros[0]?.spotifyUrl ?? "");
          }
        }

        // Hydrate step-2 fields
        if (pd.game2Theme) setGame2Theme(pd.game2Theme);
        if (pd.game2SongsText) setGame2SongsText(pd.game2SongsText);
        const game2 = findGame(2);
        if (game2) {
          const entries = challengeEntriesFromGame(game2);
          if (entries.some((c) => c.value)) setGame2ChallengeSongs(entries);
          const intros = getIntroSongs(game2);
          if (intros.length > 0) {
            setGame2IntroSongs(intros);
            setGame2IntroUrl(intros.find((s) => s.type === "sing-along")?.spotifyUrl ?? intros[0]?.spotifyUrl ?? "");
          }
        }

        // Preserve the session id so save overwrites the same record
        setEditingSessionId(loaded.id);
        setEditingSessionName(loaded.name);
      } catch {
        if (!cancelled) {
          setEditHydrationNotice(
            "Failed to load the session for editing. You can proceed as a new game."
          );
        }
      }
    })();

    return () => { cancelled = true; };
  // Run once on mount when the param is present
  }, [editSessionParam]);

  useEffect(() => {
    if (formSignatureRef.current === formInputSignature) return;
    formSignatureRef.current = formInputSignature;
    setError("");
    setQrNotice("");
  }, [formInputSignature]);

  useEffect(() => {
    const hasPlaylistArtifacts = playlistsCreated || Boolean(playlistResults) || Boolean(spotifyResult);
    if (!hasPlaylistArtifacts) {
      playlistSignatureRef.current = null;
      return;
    }

    if (
      playlistSignatureRef.current
      && playlistSignatureRef.current !== playlistInputSignature
    ) {
      setSpotifyResult(null);
      setPlaylistResults(null);
      setPlaylistsCreated(false);
      setLiveSessionNotice("");
      pendingAutoSave.current = false;
      playlistSignatureRef.current = null;
    }
  }, [playlistInputSignature, playlistResults, playlistsCreated, spotifyResult]);

  // Auto-select first challenge song & prune stale selections for Game 1
  useEffect(() => {
    if (!parsedGame1.songs.length) {
      if (game1ChallengeSongs.some((c) => c.value)) {
        setGame1ChallengeSongs(
          Array(5).fill(null).map(() => ({ value: "", type: "sing-along" as const }))
        );
      }
      return;
    }
    const validValues = new Set(parsedGame1.songs.map(makeSongSelectionValue));

    const pruned = game1ChallengeSongs.map((c) =>
      c.value && validValues.has(c.value) ? c : { ...c, value: "" }
    );
    const prunedChanged = pruned.some((c, i) => c.value !== game1ChallengeSongs[i]?.value);

    if (!pruned.some((c) => c.value)) {
      const autoFirst = makeSongSelectionValue(parsedGame1.songs[0] as Song);
      const reset: ChallengeEntry[] = Array(5).fill(null).map(() => ({ value: "", type: "sing-along" as const }));
      reset[0] = { value: autoFirst, type: "sing-along" };
      setGame1ChallengeSongs(reset);
    } else if (prunedChanged) {
      setGame1ChallengeSongs(pruned);
    }
  }, [parsedGame1.songs, game1ChallengeSongs]);

  // Auto-select first challenge song & prune stale selections for Game 2
  useEffect(() => {
    if (!parsedGame2.songs.length) {
      if (game2ChallengeSongs.some((c) => c.value)) {
        setGame2ChallengeSongs(
          Array(5).fill(null).map(() => ({ value: "", type: "sing-along" as const }))
        );
      }
      return;
    }
    const validValues = new Set(parsedGame2.songs.map(makeSongSelectionValue));

    const pruned = game2ChallengeSongs.map((c) =>
      c.value && validValues.has(c.value) ? c : { ...c, value: "" }
    );
    const prunedChanged = pruned.some((c, i) => c.value !== game2ChallengeSongs[i]?.value);

    if (!pruned.some((c) => c.value)) {
      const autoFirst = makeSongSelectionValue(parsedGame2.songs[0] as Song);
      const reset: ChallengeEntry[] = Array(5).fill(null).map(() => ({ value: "", type: "sing-along" as const }));
      reset[0] = { value: autoFirst, type: "sing-along" };
      setGame2ChallengeSongs(reset);
    } else if (prunedChanged) {
      setGame2ChallengeSongs(pruned);
    }
  }, [parsedGame2.songs, game2ChallengeSongs]);

  useEffect(() => {
    const eventDateDisplay = formatEventDateDisplay(eventDate) || eventDate || todayIso();
    const defaultName = `Music Bingo - ${eventDateDisplay}`;
    setLiveSessionName((prev) => (!liveSessionNameDirty || !prev.trim() ? defaultName : prev));
  }, [eventDate, liveSessionNameDirty]);

  const livePlaylistByGame = useMemo(() => {
    if (!spotifyResult?.length) return null;
    const game1 = spotifyResult.find((item) => item.gameNumber === 1 && item.playlistId);
    const game2 = spotifyResult.find((item) => item.gameNumber === 2 && item.playlistId);
    if (!game1 || !game2) return null;
    return { game1, game2 };
  }, [spotifyResult]);

  useEffect(() => {
    if (!pendingAutoSave.current || !livePlaylistByGame) return;
    pendingAutoSave.current = false;
    saveLiveSessionRef.current?.();
  }, [livePlaylistByGame]);

  const canSubmit = useMemo(() => {
    const count = Number.parseInt(countInput, 10);
    if (!eventDate.trim()) return false;
    if (!Number.isFinite(count) || count < 1 || count > 200) return false;
    if (!parsedGame1.songs.length || !parsedGame2.songs.length) return false;
    if (
      parsedGame1.songs.length > MAX_SONGS_PER_GAME ||
      parsedGame2.songs.length > MAX_SONGS_PER_GAME
    )
      return false;
    if (parsedGame1.combinedPool.length < 25) return false;
    if (parsedGame2.combinedPool.length < 25) return false;
    if (!game1ChallengeSongs.some((c) => c.value) || !game2ChallengeSongs.some((c) => c.value)) return false;
    return true;
  }, [
    countInput,
    eventDate,
    game1ChallengeSongs,
    game2ChallengeSongs,
    parsedGame1.combinedPool.length,
    parsedGame2.combinedPool.length,
    parsedGame1.songs.length,
    parsedGame2.songs.length,
  ]);

  function buildBaseFormData(overrides?: {
    game1IntroSongs?: IntroSong[];
    game2IntroSongs?: IntroSong[];
  }): FormData {
    const effectiveGame1IntroSongs = overrides?.game1IntroSongs ?? game1IntroSongs;
    const effectiveGame2IntroSongs = overrides?.game2IntroSongs ?? game2IntroSongs;
    const form = new FormData();
    form.set("event_date", eventDate);
    form.set("song_play_seconds", songPlaySecondsInput);
    form.set("game1_theme", game1Theme);
    form.set("game2_theme", game2Theme);
    form.set("game1_songs", game1SongsText);
    form.set("game2_songs", game2SongsText);
    form.set("game1_challenge_song", game1ChallengeSong);
    form.set("game2_challenge_song", game2ChallengeSong);
    const g1ChallengeValues = game1ChallengeSongs.filter((c) => c.value).map((c) => c.value);
    const g2ChallengeValues = game2ChallengeSongs.filter((c) => c.value).map((c) => c.value);
    form.set("game1_challenge_songs", JSON.stringify(g1ChallengeValues));
    form.set("game2_challenge_songs", JSON.stringify(g2ChallengeValues));
    const g1ChallengeTypes = game1ChallengeSongs.filter((c) => c.value).map((c) => c.type);
    const g2ChallengeTypes = game2ChallengeSongs.filter((c) => c.value).map((c) => c.type);
    form.set("game1_challenge_song_types", g1ChallengeTypes.join(","));
    form.set("game2_challenge_song_types", g2ChallengeTypes.join(","));
    if (game1IntroUrl.trim()) form.set("game1_intro_url", game1IntroUrl.trim());
    if (game2IntroUrl.trim()) form.set("game2_intro_url", game2IntroUrl.trim());
    if (effectiveGame1IntroSongs.length) form.set("game1_intro_songs", JSON.stringify(effectiveGame1IntroSongs));
    if (effectiveGame2IntroSongs.length) form.set("game2_intro_songs", JSON.stringify(effectiveGame2IntroSongs));
    if (effectiveGame1IntroSongs[0]?.artist && effectiveGame1IntroSongs[0]?.title) {
      form.set("game1_intro_artist", effectiveGame1IntroSongs[0].artist);
      form.set("game1_intro_title", effectiveGame1IntroSongs[0].title);
    }
    if (effectiveGame2IntroSongs[0]?.artist && effectiveGame2IntroSongs[0]?.title) {
      form.set("game2_intro_artist", effectiveGame2IntroSongs[0].artist);
      form.set("game2_intro_title", effectiveGame2IntroSongs[0].title);
    }
    if (livePlaylistByGame?.game1.playlistId) {
      form.set("game1_playlist_id", livePlaylistByGame.game1.playlistId);
    }
    if (livePlaylistByGame?.game2.playlistId) {
      form.set("game2_playlist_id", livePlaylistByGame.game2.playlistId);
    }
    if (playlistResults) {
      const g1Playlist = playlistResults.find((p) => p.gameNumber === 1);
      const g2Playlist = playlistResults.find((p) => p.gameNumber === 2);
      if (g1Playlist) form.set("spotify_playlist_id_game1", g1Playlist.playlistId);
      if (g2Playlist) form.set("spotify_playlist_id_game2", g2Playlist.playlistId);
    }
    if (selectedBrandId) {
      form.set("brand_id", selectedBrandId);
    }
    return form;
  }

  function buildLiveSessionPayload(): LiveSessionV1 {
    if (!livePlaylistByGame) {
      throw new Error("Create both Spotify playlists first, then save the live session.");
    }
    const eventDateDisplay = formatEventDateDisplay(eventDate) || eventDate || todayIso();
    const sessionName = liveSessionName.trim() || `Music Bingo - ${eventDateDisplay}`;
    const { game1, game2 } = livePlaylistByGame;
    const count = Number.parseInt(countInput, 10);
    const revealConfig = parseRevealConfigInputs({
      albumSeconds: albumRevealSecondsInput,
      titleSeconds: titleRevealSecondsInput,
      artistSeconds: artistRevealSecondsInput,
      songPlaySeconds: songPlaySecondsInput,
    });
    if (!revealConfig) {
      throw new Error("Song timing must be ordered as album, title, artist, next song.");
    }
    return {
      version: LIVE_SESSION_VERSION,
      // Reuse the existing id in edit mode so upsert overwrites the same row
      id: editingSessionId ?? makeSessionId(),
      name: sessionName,
      createdAt: new Date().toISOString(),
      eventDateInput: eventDate,
      eventDateDisplay,
      revealConfig,
      breakPlaylistId: breakPlaylistId.trim(),
      games: [
        {
          gameNumber: 1,
          theme: game1.theme,
          playlistId: game1.playlistId as string,
          playlistName: game1.playlistName,
          playlistUrl: game1.playlistUrl,
          totalSongs: game1.totalSongs,
          addedCount: game1.addedCount,
          challengeSongArtist: parseChallengeSongSelection(game1ChallengeSong).artist,
          challengeSongTitle: parseChallengeSongSelection(game1ChallengeSong).title,
          challengeSongs: game1ChallengeSongs
            .filter((c) => c.value)
            .map((c) => ({ ...parseChallengeSongSelection(c.value), type: c.type })),
          introSongs: game1IntroSongs.length > 0 ? game1IntroSongs : undefined,
          introSongArtist: game1IntroSongs[0]?.artist,
          introSongTitle: game1IntroSongs[0]?.title,
        },
        {
          gameNumber: 2,
          theme: game2.theme,
          playlistId: game2.playlistId as string,
          playlistName: game2.playlistName,
          playlistUrl: game2.playlistUrl,
          totalSongs: game2.totalSongs,
          addedCount: game2.addedCount,
          challengeSongArtist: parseChallengeSongSelection(game2ChallengeSong).artist,
          challengeSongTitle: parseChallengeSongSelection(game2ChallengeSong).title,
          challengeSongs: game2ChallengeSongs
            .filter((c) => c.value)
            .map((c) => ({ ...parseChallengeSongSelection(c.value), type: c.type })),
          introSongs: game2IntroSongs.length > 0 ? game2IntroSongs : undefined,
          introSongArtist: game2IntroSongs[0]?.artist,
          introSongTitle: game2IntroSongs[0]?.title,
        },
      ],
      prepData: {
        game1SongsText,
        game2SongsText,
        game1Theme,
        game2Theme,
        game1ChallengeSong,
        game2ChallengeSong,
        cardCount: Number.isFinite(count) ? count : 40,
        game1ChallengeSongs: game1ChallengeSongs.filter((c) => c.value).map((c) => c.value),
        game2ChallengeSongs: game2ChallengeSongs.filter((c) => c.value).map((c) => c.value),
      },
      brandId: selectedBrandId ?? undefined,
    };
  }

  async function saveLiveSession() {
    try {
      const session = buildLiveSessionPayload();
      await upsertLiveSession(session);
      setLiveSessionNotice(`Saved live session: ${session.name}`);
      setError("");
    } catch (err: any) {
      setLiveSessionNotice("");
      setError(err?.message ?? "Failed to save live session.");
    }
  }
  saveLiveSessionRef.current = saveLiveSession;

  async function exportLiveSession() {
    try {
      const session = buildLiveSessionPayload();
      await upsertLiveSession(session);
      const json = exportLiveSessionJson(session);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      downloadBlob(
        blob,
        `music-bingo-live-session-${sanitizeFilenamePart(session.name, "session")}.json`
      );
      setLiveSessionNotice(`Exported live session: ${session.name}`);
      setError("");
    } catch (err: any) {
      setLiveSessionNotice("");
      setError(err?.message ?? "Failed to export live session.");
    }
  }

  async function onDownloadOnly() {
    setError("");
    setQrNotice("");
    setBusy(true);
    try {
      const count = Number.parseInt(countInput, 10);
      if (!Number.isFinite(count) || count < 1 || count > 1000) {
        throw new Error("Cards per game must be a whole number between 1 and 1000.");
      }

      const pdfForm = buildBaseFormData();
      pdfForm.set("count", String(count));

      const res = await fetch("/api/generate", { method: "POST", body: pdfForm });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to generate output bundle.");
      }

      const qrStatus = res.headers.get("x-music-bingo-qr-status");
      const requestedRaw = res.headers.get("x-music-bingo-events-requested");
      const eventsWithUrl = res.headers.get("x-music-bingo-events-with-url");
      const eventsCount = res.headers.get("x-music-bingo-events-count");
      const qrError = res.headers.get("x-music-bingo-qr-error");
      const expectedEvents = (() => {
        const n = requestedRaw ? Number.parseInt(requestedRaw, 10) : 4;
        return Number.isFinite(n) && n > 0 ? n : 4;
      })();

      if (qrStatus && qrStatus !== "ok") {
        if (qrStatus === "missing_config") {
          setQrNotice("Upcoming event QRs: management API not configured.");
        } else if (qrStatus === "no_events") {
          setQrNotice("Upcoming event QRs: no upcoming events found after this date (placeholders used).");
        } else if (qrStatus === "error") {
          setQrNotice(`Upcoming event QRs: ${qrError || "failed to fetch events"} (placeholders used).`);
        }
      } else if (eventsWithUrl && eventsWithUrl !== String(expectedEvents)) {
        const resolvedCount = Number.parseInt(eventsWithUrl, 10);
        if (Number.isFinite(resolvedCount) && resolvedCount >= 0 && resolvedCount < expectedEvents) {
          setQrNotice(
            `Upcoming event QRs: only ${resolvedCount}/${expectedEvents} event URLs resolved (placeholders used).`
          );
        }
      } else if (eventsCount && eventsCount !== String(expectedEvents)) {
        const foundCount = Number.parseInt(eventsCount, 10);
        if (Number.isFinite(foundCount) && foundCount >= 0 && foundCount < expectedEvents) {
          setQrNotice(
            `Upcoming event QRs: only ${foundCount}/${expectedEvents} upcoming events found (placeholders used).`
          );
        }
      }

      const blob = await res.blob();
      const filename =
        res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ??
        "music-bingo-event-pack.zip";
      downloadBlob(blob, filename);
    } catch (err: any) {
      setError(err?.message ?? "Failed to generate output bundle.");
    } finally {
      setBusy(false);
    }
  }

  async function connectSpotify(opts: { clearError?: boolean } = {}): Promise<boolean> {
    const clearError = opts.clearError ?? true;
    if (clearError) { setError(""); setSpotifyResult(null); }
    setSpotifyConnecting(true);
    try {
      const w = window.open("/api/spotify/authorize", "spotify_auth", "popup,width=520,height=720");
      if (!w) throw new Error("Popup blocked. Please allow popups for this site and try again.");

      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          window.removeEventListener("message", onMessage);
          window.clearInterval(timer);
        };
        const onMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          const data = event.data as any;
          if (!data || typeof data !== "object") return;
          if (data.type !== "spotify-auth") return;
          cleanup();
          if (data.ok) resolve();
          else reject(new Error(data.error || "Spotify auth failed."));
        };
        const timer = window.setInterval(() => {
          if (w.closed) {
            cleanup();
            reject(
              new Error(
                "Spotify login window closed.\n\n"
                  + "If you saw \"INVALID_CLIENT: Invalid redirect URI\", add this Redirect URI in your Spotify app settings:\n"
                  + `  ${spotifyCallbackUrl}\n`
                  + "\nAlso consider adding the localhost version:\n"
                  + "  http://localhost:3000/api/spotify/callback"
              )
            );
          }
        }, 400);
        window.addEventListener("message", onMessage);
      });

      const status = await fetch("/api/spotify/status", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : { connected: false }))
        .catch(() => ({ connected: false }));
      setSpotifyConnected(Boolean(status.connected));
      return Boolean(status.connected);
    } catch (err: any) {
      setError(err?.message ?? "Failed to connect Spotify.");
      setSpotifyConnected(false);
      return false;
    } finally {
      setSpotifyConnecting(false);
    }
  }

  async function disconnectSpotify() {
    setError("");
    setSpotifyResult(null);
    setSpotifyConnecting(true);
    try {
      await fetch("/api/spotify/disconnect", { method: "POST" });
      setSpotifyConnected(false);
    } catch (err: any) {
      setError(err?.message ?? "Failed to disconnect Spotify.");
    } finally {
      setSpotifyConnecting(false);
    }
  }

  function introSongMatchesUrl(songs: IntroSong[], type: IntroSong["type"], rawUrl: string): boolean {
    const url = rawUrl.trim();
    return songs.some((song) => song.type === type && song.trackId && song.spotifyUrl.trim() === url);
  }

  async function resolveIntroSongUrl(
    type: IntroSong["type"],
    rawUrl: string,
    label: string
  ): Promise<IntroSong | null> {
    const url = rawUrl.trim();
    if (!url) return null;

    const parseResult = parseSpotifyTrackUrl(url);
    if ("error" in parseResult) {
      throw new Error(`${label}: ${parseResult.error}`);
    }

    const res = await fetch(`/api/spotify/track/${encodeURIComponent(parseResult.trackId)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Request failed" }));
      const message = typeof body?.error === "string" ? body.error : "Request failed";
      throw new Error(`${label}: ${message}`);
    }

    const data = (await res.json()) as {
      trackId: string;
      title: string;
      artist: string;
    };

    return {
      type,
      spotifyUrl: url,
      trackId: data.trackId,
      artist: data.artist,
      title: data.title,
    };
  }

  async function resolvePendingIntroSongs(): Promise<{
    game1IntroSongs: IntroSong[];
    game2IntroSongs: IntroSong[];
  }> {
    let nextGame1IntroSongs = game1IntroSongs;
    let nextGame2IntroSongs = game2IntroSongs;

    if (game1IntroUrl.trim() && !introSongMatchesUrl(nextGame1IntroSongs, "dance-along", game1IntroUrl)) {
      const resolved = await resolveIntroSongUrl("dance-along", game1IntroUrl, "Game 1 dance along song");
      if (resolved) {
        nextGame1IntroSongs = [
          ...nextGame1IntroSongs.filter((song) => song.type !== "dance-along"),
          resolved,
        ];
        setGame1IntroSongs(nextGame1IntroSongs);
      }
    }

    if (game2IntroUrl.trim() && !introSongMatchesUrl(nextGame2IntroSongs, "sing-along", game2IntroUrl)) {
      const resolved = await resolveIntroSongUrl("sing-along", game2IntroUrl, "Game 2 sing along song");
      if (resolved) {
        nextGame2IntroSongs = [
          ...nextGame2IntroSongs.filter((song) => song.type !== "sing-along"),
          resolved,
        ];
        setGame2IntroSongs(nextGame2IntroSongs);
      }
    }

    return {
      game1IntroSongs: nextGame1IntroSongs,
      game2IntroSongs: nextGame2IntroSongs,
    };
  }

  async function createSpotifyPlaylists(opts: { form?: FormData; clearError?: boolean } = {}) {
    const clearError = opts.clearError ?? true;
    if (clearError) { setError(""); setSpotifyResult(null); }
    setSpotifyCreating(true);
    try {
      const form = opts.form ?? buildBaseFormData();
      const res = await fetch("/api/spotify/create-playlist", { method: "POST", body: form });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        if (res.status === 401) setSpotifyConnected(false);
        throw new Error(msg || "Failed to create Spotify playlists.");
      }
      const data = await res.json();
      const playlists = Array.isArray(data?.playlists)
        ? data.playlists
            .map((item: any) => ({
              gameNumber: Number(item?.gameNumber ?? 0),
              theme: typeof item?.theme === "string" ? item.theme : DEFAULT_GAME_THEME,
              playlistId: typeof item?.playlistId === "string" ? item.playlistId : null,
              playlistName: String(item?.playlistName ?? "Music Bingo"),
              playlistUrl: typeof item?.playlistUrl === "string" ? item.playlistUrl : null,
              totalSongs: Number(item?.totalSongs ?? 0),
              addedCount: Number(item?.addedCount ?? 0),
              notFoundCount: Number(item?.notFoundCount ?? 0),
              notFound: Array.isArray(item?.notFound)
                ? item.notFound
                    .map((s: any) => ({
                      artist: typeof s?.artist === "string" ? s.artist : "",
                      title: typeof s?.title === "string" ? s.title : "",
                    }))
                    .filter((s: any) => Boolean(s.artist && s.title))
                : [],
            }))
            .filter(
              (item: SpotifyPlaylistResult) => item.gameNumber === 1 || item.gameNumber === 2
            )
        : [];
      setSpotifyResult(playlists);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create Spotify playlists.");
    } finally {
      setSpotifyCreating(false);
    }
  }

  async function handleCreatePlaylists() {
    setError("");
    setQrNotice("");
    setSpotifyResult(null);
    setLiveSessionNotice("");
    setBusy(true);
    try {
      const signatureAtCreate = playlistInputSignature;
      if (!spotifyConnected) {
        const ok = await connectSpotify({ clearError: false });
        if (!ok) return;
      }
      const resolvedIntroSongs = await resolvePendingIntroSongs();
      const form = buildBaseFormData(resolvedIntroSongs);
      await createSpotifyPlaylists({ form, clearError: false });

      const latestResult = await new Promise<SpotifyPlaylistResult[] | null>((resolve) => {
        setSpotifyResult((prev) => {
          resolve(prev);
          return prev;
        });
      });

      if (latestResult && latestResult.length > 0) {
        const mapped: PlaylistPhaseResult[] = latestResult
          .filter((r): r is SpotifyPlaylistResult & { playlistId: string; playlistUrl: string } =>
            r.playlistId !== null && r.playlistUrl !== null && (r.gameNumber === 1 || r.gameNumber === 2)
          )
          .map((r) => ({
            gameNumber: r.gameNumber as 1 | 2,
            playlistId: r.playlistId,
            playlistUrl: r.playlistUrl,
            addedCount: r.addedCount,
            totalSongs: r.totalSongs,
            notFoundSongs: r.notFound,
          }));
        if (mapped.length > 0) {
          playlistSignatureRef.current = signatureAtCreate;
          setPlaylistResults(mapped);
          setPlaylistsCreated(true);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create playlists.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateEventPack() {
    setError("");
    setQrNotice("");
    setBusy(true);
    try {
      const count = Number.parseInt(countInput, 10);
      if (!Number.isFinite(count) || count < 1 || count > 1000) {
        throw new Error("Cards per game must be a whole number between 1 and 1000.");
      }

      const pdfForm = buildBaseFormData();
      pdfForm.set("count", String(count));

      const res = await fetch("/api/generate", { method: "POST", body: pdfForm });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to generate output bundle.");
      }

      const qrStatus = res.headers.get("x-music-bingo-qr-status");
      const requestedRaw = res.headers.get("x-music-bingo-events-requested");
      const eventsWithUrl = res.headers.get("x-music-bingo-events-with-url");
      const eventsCount = res.headers.get("x-music-bingo-events-count");
      const qrError = res.headers.get("x-music-bingo-qr-error");
      const expectedEvents = (() => {
        const n = requestedRaw ? Number.parseInt(requestedRaw, 10) : 4;
        return Number.isFinite(n) && n > 0 ? n : 4;
      })();

      if (qrStatus && qrStatus !== "ok") {
        if (qrStatus === "missing_config") {
          setQrNotice("Upcoming event QRs: management API not configured.");
        } else if (qrStatus === "no_events") {
          setQrNotice("Upcoming event QRs: no upcoming events found after this date (placeholders used).");
        } else if (qrStatus === "error") {
          setQrNotice(`Upcoming event QRs: ${qrError || "failed to fetch events"} (placeholders used).`);
        }
      } else if (eventsWithUrl && eventsWithUrl !== String(expectedEvents)) {
        const resolvedCount = Number.parseInt(eventsWithUrl, 10);
        if (Number.isFinite(resolvedCount) && resolvedCount >= 0 && resolvedCount < expectedEvents) {
          setQrNotice(
            `Upcoming event QRs: only ${resolvedCount}/${expectedEvents} event URLs resolved (placeholders used).`
          );
        }
      } else if (eventsCount && eventsCount !== String(expectedEvents)) {
        const foundCount = Number.parseInt(eventsCount, 10);
        if (Number.isFinite(foundCount) && foundCount >= 0 && foundCount < expectedEvents) {
          setQrNotice(
            `Upcoming event QRs: only ${foundCount}/${expectedEvents} upcoming events found (placeholders used).`
          );
        }
      }

      const blob = await res.blob();
      const filename =
        res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ??
        "music-bingo-event-pack.zip";
      downloadBlob(blob, filename);

      pendingAutoSave.current = true;
      if (livePlaylistByGame) {
        saveLiveSessionRef.current?.();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate output bundle.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  /** Resolve a missing song row by posting a Spotify track URL to the resolve-missing route. */
  async function handleResolveMissingSong(opts: {
    gameNumber: 1 | 2;
    artist: string;
    title: string;
    spotifyTrackUrl: string;
  }): Promise<{ ok: true; trackId: string } | { ok: false; error: string }> {
    const playlistId =
      opts.gameNumber === 1
        ? (livePlaylistByGame?.game1.playlistId ?? playlistResults?.find((p) => p.gameNumber === 1)?.playlistId)
        : (livePlaylistByGame?.game2.playlistId ?? playlistResults?.find((p) => p.gameNumber === 2)?.playlistId);

    if (!playlistId) {
      return { ok: false, error: "Playlist not yet created — create Spotify playlists first." };
    }

    try {
      const res = await fetch(`/api/spotify/playlist/${encodeURIComponent(playlistId)}/resolve-missing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolutions: [{ artist: opts.artist, title: opts.title, spotifyTrackUrl: opts.spotifyTrackUrl }],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return { ok: false, error: (data as any)?.error ?? `Server error ${res.status}` };
      }
      const resolved = (data as any)?.resolved ?? [];
      const failed = (data as any)?.failed ?? [];
      if (resolved.length > 0 && resolved[0]?.trackId) {
        return { ok: true, trackId: resolved[0].trackId as string };
      }
      const failMsg = failed[0]?.error ?? "Track not found on Spotify.";
      return { ok: false, error: failMsg };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : "Network error." };
    }
  }

  async function handleRefreshFromSpotify() {
    setRefreshing(true);
    try {
      if (!playlistResults) return;
      const updated = await Promise.all(
        playlistResults.map(async (pr) => {
          const res = await fetch(`/api/spotify/playlist-tracks/${pr.playlistId}`);
          if (!res.ok) return pr;
          const data = await res.json();
          return {
            ...pr,
            addedCount: Number(data.total ?? pr.addedCount),
            totalSongs: Number(data.total ?? pr.totalSongs),
            notFoundSongs: [],
          };
        })
      );
      setPlaylistResults(updated);
    } finally {
      setRefreshing(false);
    }
  }

  function goToStep(step: number) {
    setCurrentStep(step);
    window.scrollTo(0, 0);
  }

  return (
    <div className="min-h-screen bg-ink">
      <AppHeader
        title="Music Bingo"
        subtitle="Event Prep"
        actions={
          <Button as="link" href="/host" variant="secondary" size="sm">
            Live Host Console
          </Button>
        }
      />


      <main className="max-w-2xl mx-auto px-4 py-8">
        {editHydrationNotice && (
          <Notice variant="warning" className="mb-4">{editHydrationNotice}</Notice>
        )}

        {editingSessionId && !editHydrationNotice && (
          <div className="editbanner">
            <span className="pillmini">Editing</span>
            <span>
              <b>{editingSessionName || liveSessionName}</b> — changes save to the same game, so your host link &amp; cards stay valid.
            </span>
          </div>
        )}

        <div className="stepper">
          {STEPS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              className={`stp${i === currentStep ? " active" : i < currentStep ? " done" : ""}`}
              onClick={() => i <= currentStep && goToStep(i)}
              aria-current={i === currentStep ? "step" : undefined}
            >
              <span className="num">{i < currentStep ? "✓" : i + 1}</span>
              <span className="lbl">{s.label}</span>
            </button>
          ))}
        </div>

        {currentStep === 0 && (
          <StepEventSetup
            eventDate={eventDate}
            onEventDate={setEventDate}
            countInput={countInput}
            onCountInput={setCountInput}
            songPlaySecondsInput={songPlaySecondsInput}
            onSongPlaySecondsInput={setSongPlaySecondsInput}
            albumRevealSecondsInput={albumRevealSecondsInput}
            onAlbumRevealSecondsInput={setAlbumRevealSecondsInput}
            titleRevealSecondsInput={titleRevealSecondsInput}
            onTitleRevealSecondsInput={setTitleRevealSecondsInput}
            artistRevealSecondsInput={artistRevealSecondsInput}
            onArtistRevealSecondsInput={setArtistRevealSecondsInput}
            onResetRevealDefaults={resetRevealTimingDefaults}
            sessionName={liveSessionName}
            onSessionName={(v) => {
              setLiveSessionName(v);
              setLiveSessionNameDirty(true);
            }}
            breakPlaylistId={breakPlaylistId}
            onBreakPlaylistId={setBreakPlaylistId}
            selectedBrandId={selectedBrandId}
            onSelectedBrandId={setSelectedBrandId}
            onNext={() => goToStep(1)}
          />
        )}

        {currentStep === 1 && (
          <StepGameConfig
            gameNumber={1}
            gameLabel="Dancing Challenge"
            theme={game1Theme}
            onTheme={setGame1Theme}
            songsText={game1SongsText}
            onSongsText={setGame1SongsText}
            challengeSongs={game1ChallengeSongs}
            onChallengeSongs={setGame1ChallengeSongs}
            introUrl={game1IntroUrl}
            onIntroUrlChange={setGame1IntroUrl}
            introSongs={game1IntroSongs}
            onIntroSongsChange={setGame1IntroSongs}
            spotifyConnected={spotifyConnected}
            parsed={parsedGame1}
            normalSongSeconds={normalSongSeconds}
            onBack={() => goToStep(0)}
            onNext={() => goToStep(2)}
            nextLabel="Next: Game 2 →"
          />
        )}

        {currentStep === 2 && (
          <StepGameConfig
            gameNumber={2}
            gameLabel="Sing-Along Challenge"
            theme={game2Theme}
            onTheme={setGame2Theme}
            songsText={game2SongsText}
            onSongsText={setGame2SongsText}
            challengeSongs={game2ChallengeSongs}
            onChallengeSongs={setGame2ChallengeSongs}
            introUrl={game2IntroUrl}
            onIntroUrlChange={setGame2IntroUrl}
            introSongs={game2IntroSongs}
            onIntroSongsChange={setGame2IntroSongs}
            spotifyConnected={spotifyConnected}
            parsed={parsedGame2}
            normalSongSeconds={normalSongSeconds}
            onBack={() => goToStep(1)}
            onNext={() => goToStep(3)}
            nextLabel="Next: Generate →"
          />
        )}

        {currentStep === 3 && (
          <StepGenerateConnect
            canSubmit={canSubmit}
            busy={busy}
            spotifyConnected={spotifyConnected}
            spotifyConnecting={spotifyConnecting}
            spotifyCreating={spotifyCreating}
            spotifyCallbackUrl={spotifyCallbackUrl}
            spotifyResult={spotifyResult}
            livePlaylistByGame={livePlaylistByGame}
            playlistsCreated={playlistsCreated}
            playlistResults={playlistResults}
            liveSessionName={liveSessionName}
            onLiveSessionName={(v) => {
              setLiveSessionName(v);
              setLiveSessionNameDirty(true);
            }}
            liveSessionNotice={liveSessionNotice}
            error={error}
            qrNotice={qrNotice}
            onCreatePlaylists={() => void handleCreatePlaylists()}
            onRefreshFromSpotify={() => void handleRefreshFromSpotify()}
            onGenerateEventPack={() => void handleGenerateEventPack()}
            onDownloadOnly={() => void onDownloadOnly()}
            onConnectSpotify={() => void connectSpotify()}
            onDisconnectSpotify={() => void disconnectSpotify()}
            onSaveLiveSession={() => void saveLiveSession()}
            onExportLiveSession={() => void exportLiveSession()}
            onBack={() => goToStep(2)}
            refreshing={refreshing}
            onResolveMissingSong={handleResolveMissingSong}
          />
        )}
      </main>
    </div>
  );
}

export default function PrepPage() {
  return (
    <Suspense>
      <PrepPageInner />
    </Suspense>
  );
}
