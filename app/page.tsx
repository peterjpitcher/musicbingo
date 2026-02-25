"use client";

import { useEffect, useMemo, useState } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/Button";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { formatEventDateDisplay } from "@/lib/eventDate";
import { DEFAULT_GAME_THEME, MAX_SONGS_PER_GAME, makeSongSelectionValue } from "@/lib/gameInput";
import { exportLiveSessionJson, upsertLiveSession } from "@/lib/live/sessionApi";
import { DEFAULT_REVEAL_CONFIG, LIVE_SESSION_VERSION, type LiveSessionV1 } from "@/lib/live/types";
import { parseSongListText } from "@/lib/parser";
import type { Song } from "@/lib/types";
import { sanitizeFilenamePart } from "@/lib/utils";
import { StepEventSetup } from "./prep/StepEventSetup";
import { StepGameConfig } from "./prep/StepGameConfig";
import { StepGenerateConnect } from "./prep/StepGenerateConnect";

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

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export default function HomePage() {
  const [currentStep, setCurrentStep] = useState(0);

  // Step 0 fields
  const [eventDate, setEventDate] = useState<string>(todayIso());
  const [countInput, setCountInput] = useState<string>("40");
  const [liveSessionName, setLiveSessionName] = useState<string>("");
  const [liveSessionNameDirty, setLiveSessionNameDirty] = useState<boolean>(false);
  const [breakPlaylistId, setBreakPlaylistId] = useState<string>("");

  // Step 1 fields
  const [game1Theme, setGame1Theme] = useState<string>(DEFAULT_GAME_THEME);
  const [game1SongsText, setGame1SongsText] = useState<string>("");
  const [game1ChallengeSong, setGame1ChallengeSong] = useState<string>("");

  // Step 2 fields
  const [game2Theme, setGame2Theme] = useState<string>(DEFAULT_GAME_THEME);
  const [game2SongsText, setGame2SongsText] = useState<string>("");
  const [game2ChallengeSong, setGame2ChallengeSong] = useState<string>("");

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

  const parsedGame1 = useMemo(() => parseSongListText(game1SongsText), [game1SongsText]);
  const parsedGame2 = useMemo(() => parseSongListText(game2SongsText), [game2SongsText]);

  useEffect(() => {
    setSpotifyCallbackUrl(`${window.location.origin}/api/spotify/callback`);
    fetch("/api/spotify/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSpotifyConnected(Boolean(data?.connected)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!parsedGame1.songs.length) {
      if (game1ChallengeSong) setGame1ChallengeSong("");
      return;
    }
    const hasSelection = parsedGame1.songs.some(
      (song) => makeSongSelectionValue(song) === game1ChallengeSong
    );
    if (!hasSelection) {
      setGame1ChallengeSong(makeSongSelectionValue(parsedGame1.songs[0] as Song));
    }
  }, [parsedGame1.songs, game1ChallengeSong]);

  useEffect(() => {
    if (!parsedGame2.songs.length) {
      if (game2ChallengeSong) setGame2ChallengeSong("");
      return;
    }
    const hasSelection = parsedGame2.songs.some(
      (song) => makeSongSelectionValue(song) === game2ChallengeSong
    );
    if (!hasSelection) {
      setGame2ChallengeSong(makeSongSelectionValue(parsedGame2.songs[0] as Song));
    }
  }, [parsedGame2.songs, game2ChallengeSong]);

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

  const canSubmit = useMemo(() => {
    const count = Number.parseInt(countInput, 10);
    if (!eventDate.trim()) return false;
    if (!Number.isFinite(count) || count < 1 || count > 1000) return false;
    if (!parsedGame1.songs.length || !parsedGame2.songs.length) return false;
    if (
      parsedGame1.songs.length > MAX_SONGS_PER_GAME ||
      parsedGame2.songs.length > MAX_SONGS_PER_GAME
    )
      return false;
    if (parsedGame1.uniqueArtists.length < 25 || parsedGame1.uniqueTitles.length < 25) return false;
    if (parsedGame2.uniqueArtists.length < 25 || parsedGame2.uniqueTitles.length < 25) return false;
    if (!game1ChallengeSong || !game2ChallengeSong) return false;
    return true;
  }, [
    countInput,
    eventDate,
    game1ChallengeSong,
    game2ChallengeSong,
    parsedGame1.uniqueArtists.length,
    parsedGame1.uniqueTitles.length,
    parsedGame2.uniqueArtists.length,
    parsedGame2.uniqueTitles.length,
    parsedGame1.songs.length,
    parsedGame2.songs.length,
  ]);

  function buildBaseFormData(): FormData {
    const form = new FormData();
    form.set("event_date", eventDate);
    form.set("game1_theme", game1Theme);
    form.set("game2_theme", game2Theme);
    form.set("game1_songs", game1SongsText);
    form.set("game2_songs", game2SongsText);
    form.set("game1_challenge_song", game1ChallengeSong);
    form.set("game2_challenge_song", game2ChallengeSong);
    return form;
  }

  function buildLiveSessionPayload(): LiveSessionV1 {
    if (!livePlaylistByGame) {
      throw new Error("Create both Spotify playlists first, then save the live session.");
    }
    const eventDateDisplay = formatEventDateDisplay(eventDate) || eventDate || todayIso();
    const sessionName = liveSessionName.trim() || `Music Bingo - ${eventDateDisplay}`;
    const { game1, game2 } = livePlaylistByGame;
    return {
      version: LIVE_SESSION_VERSION,
      id: makeSessionId(),
      name: sessionName,
      createdAt: new Date().toISOString(),
      eventDateInput: eventDate,
      eventDateDisplay,
      revealConfig: DEFAULT_REVEAL_CONFIG,
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
        },
      ],
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setQrNotice("");
    setSpotifyResult(null);
    setLiveSessionNotice("");
    setBusy(true);
    try {
      const count = Number.parseInt(countInput, 10);
      if (!Number.isFinite(count) || count < 1 || count > 1000) {
        throw new Error("Cards per game must be a whole number between 1 and 1000.");
      }

      const pdfForm = buildBaseFormData();
      pdfForm.set("count", String(count));
      const spotifyForm = buildBaseFormData();

      let bundleError: string | null = null;
      const bundlePromise = (async () => {
        try {
          const res = await fetch("/api/generate", { method: "POST", body: pdfForm });
          if (!res.ok) {
            const msg = await res.text();
            throw new Error(msg || "Failed to generate output bundle.");
          }

          const qrStatus = res.headers.get("x-music-bingo-qr-status");
          const requestedRaw = res.headers.get("x-music-bingo-events-requested");
          const eventsCount = res.headers.get("x-music-bingo-events-count");
          const eventsWithUrl = res.headers.get("x-music-bingo-events-with-url");
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
          bundleError = err?.message ?? "Failed to generate output bundle.";
        }
      })();

      const spotifyPromise = (async () => {
        if (!spotifyConnected) {
          const ok = await connectSpotify({ clearError: false });
          if (!ok) return;
        }
        await createSpotifyPlaylists({ form: spotifyForm, clearError: false });
      })();

      await Promise.all([bundlePromise, spotifyPromise]);
      if (bundleError) setError(bundleError);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
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

  function goToStep(step: number) {
    setCurrentStep(step);
    window.scrollTo(0, 0);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title="Music Bingo"
        subtitle="Event Prep"
        variant="light"
        actions={
          <Button as="link" href="/host" variant="secondary" size="sm">
            Live Host Console
          </Button>
        }
      />

      <main className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-slate-500 text-sm mb-6">
          Generate a full event pack with two game card PDFs, an Event Clipboard DOCX, and two Spotify playlists.
        </p>

        <StepIndicator steps={STEPS} currentStep={currentStep} />

        {currentStep === 0 && (
          <StepEventSetup
            eventDate={eventDate}
            onEventDate={setEventDate}
            countInput={countInput}
            onCountInput={setCountInput}
            sessionName={liveSessionName}
            onSessionName={(v) => {
              setLiveSessionName(v);
              setLiveSessionNameDirty(true);
            }}
            breakPlaylistId={breakPlaylistId}
            onBreakPlaylistId={setBreakPlaylistId}
            onNext={() => goToStep(1)}
          />
        )}

        {currentStep === 1 && (
          <StepGameConfig
            gameNumber={1}
            gameLabel="Dancing Challenge"
            challengeLabel="Dancing Challenge Song (Game 1)"
            theme={game1Theme}
            onTheme={setGame1Theme}
            songsText={game1SongsText}
            onSongsText={setGame1SongsText}
            challengeSong={game1ChallengeSong}
            onChallengeSong={setGame1ChallengeSong}
            parsed={parsedGame1}
            onBack={() => goToStep(0)}
            onNext={() => goToStep(2)}
            nextLabel="Next: Game 2 →"
          />
        )}

        {currentStep === 2 && (
          <StepGameConfig
            gameNumber={2}
            gameLabel="Sing-Along Challenge"
            challengeLabel="Sing-Along Challenge Song (Game 2)"
            theme={game2Theme}
            onTheme={setGame2Theme}
            songsText={game2SongsText}
            onSongsText={setGame2SongsText}
            challengeSong={game2ChallengeSong}
            onChallengeSong={setGame2ChallengeSong}
            parsed={parsedGame2}
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
            liveSessionName={liveSessionName}
            onLiveSessionName={(v) => {
              setLiveSessionName(v);
              setLiveSessionNameDirty(true);
            }}
            liveSessionNotice={liveSessionNotice}
            error={error}
            qrNotice={qrNotice}
            onSubmit={onSubmit}
            onConnectSpotify={() => void connectSpotify()}
            onDisconnectSpotify={() => void disconnectSpotify()}
            onSaveLiveSession={() => void saveLiveSession()}
            onExportLiveSession={() => void exportLiveSession()}
            onBack={() => goToStep(2)}
          />
        )}
      </main>
    </div>
  );
}
