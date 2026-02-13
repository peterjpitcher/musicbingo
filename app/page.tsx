"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DEFAULT_GAME_THEME,
  MAX_SONGS_PER_GAME,
  makeSongSelectionValue,
} from "@/lib/gameInput";
import { parseSongListText } from "@/lib/parser";
import type { Song } from "@/lib/types";

function todayIso(): string {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function songLabel(song: Song): string {
  return `${song.artist} - ${song.title}`;
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

type SpotifyPlaylistResult = {
  gameNumber: number;
  theme: string;
  playlistName: string;
  playlistUrl: string | null;
  totalSongs: number;
  addedCount: number;
  notFoundCount: number;
  notFound: Array<{ artist: string; title: string }>;
};

export default function HomePage() {
  const [eventDate, setEventDate] = useState<string>(todayIso());
  const [countInput, setCountInput] = useState<string>("40");

  const [game1Theme, setGame1Theme] = useState<string>(DEFAULT_GAME_THEME);
  const [game2Theme, setGame2Theme] = useState<string>(DEFAULT_GAME_THEME);
  const [game1SongsText, setGame1SongsText] = useState<string>("");
  const [game2SongsText, setGame2SongsText] = useState<string>("");
  const [game1ChallengeSong, setGame1ChallengeSong] = useState<string>("");
  const [game2ChallengeSong, setGame2ChallengeSong] = useState<string>("");

  const [error, setError] = useState<string>("");
  const [qrNotice, setQrNotice] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);
  const [spotifyConnecting, setSpotifyConnecting] = useState<boolean>(false);
  const [spotifyCreating, setSpotifyCreating] = useState<boolean>(false);
  const [spotifyResult, setSpotifyResult] = useState<SpotifyPlaylistResult[] | null>(null);
  const [spotifyCallbackUrl, setSpotifyCallbackUrl] = useState<string>("/api/spotify/callback");

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
    const hasSelection = parsedGame1.songs.some((song) => makeSongSelectionValue(song) === game1ChallengeSong);
    if (!hasSelection) {
      setGame1ChallengeSong(makeSongSelectionValue(parsedGame1.songs[0] as Song));
    }
  }, [parsedGame1.songs, game1ChallengeSong]);

  useEffect(() => {
    if (!parsedGame2.songs.length) {
      if (game2ChallengeSong) setGame2ChallengeSong("");
      return;
    }
    const hasSelection = parsedGame2.songs.some((song) => makeSongSelectionValue(song) === game2ChallengeSong);
    if (!hasSelection) {
      setGame2ChallengeSong(makeSongSelectionValue(parsedGame2.songs[0] as Song));
    }
  }, [parsedGame2.songs, game2ChallengeSong]);

  const canSubmit = useMemo(() => {
    const count = Number.parseInt(countInput, 10);
    if (!eventDate.trim()) return false;
    if (!Number.isFinite(count) || count < 1 || count > 1000) return false;
    if (!parsedGame1.songs.length || !parsedGame2.songs.length) return false;
    if (parsedGame1.songs.length > MAX_SONGS_PER_GAME || parsedGame2.songs.length > MAX_SONGS_PER_GAME) return false;
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setQrNotice("");
    setSpotifyResult(null);
    setBusy(true);
    try {
      const count = Number.parseInt(countInput, 10);
      if (!Number.isFinite(count) || count < 1 || count > 1000) {
        throw new Error("Cards per game must be a whole number between 1 and 1000.");
      }

      const pdfForm = buildBaseFormData();
      pdfForm.set("count", String(count));

      const spotifyForm = buildBaseFormData();

      const bundlePromise = (async () => {
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
            setQrNotice(
              "Upcoming event QRs: management API not configured (set MANAGEMENT_API_BASE_URL + MANAGEMENT_API_TOKEN in .env.local, then restart npm run dev)."
            );
          } else if (qrStatus === "no_events") {
            setQrNotice("Upcoming event QRs: no upcoming events found after this date (placeholders used).");
          } else if (qrStatus === "error") {
            setQrNotice(`Upcoming event QRs: ${qrError || "failed to fetch events"} (placeholders used).`);
          }
        } else if (eventsWithUrl && eventsWithUrl !== String(expectedEvents)) {
          const resolvedCount = Number.parseInt(eventsWithUrl, 10);
          if (Number.isFinite(resolvedCount) && resolvedCount >= 0 && resolvedCount < expectedEvents) {
            setQrNotice(`Upcoming event QRs: only ${resolvedCount}/${expectedEvents} event URLs resolved (placeholders used).`);
          }
        } else if (eventsCount && eventsCount !== String(expectedEvents)) {
          const foundCount = Number.parseInt(eventsCount, 10);
          if (Number.isFinite(foundCount) && foundCount >= 0 && foundCount < expectedEvents) {
            setQrNotice(`Upcoming event QRs: only ${foundCount}/${expectedEvents} upcoming events found (placeholders used).`);
          }
        }

        const blob = await res.blob();
        const filename = res.headers.get("content-disposition")?.match(/filename=\"(.+)\"/)?.[1] ?? "music-bingo-event-pack.zip";
        downloadBlob(blob, filename);
      })();

      const spotifyPromise = (async () => {
        if (!spotifyConnected) {
          const ok = await connectSpotify({ clearError: false });
          if (!ok) return;
        }
        await createSpotifyPlaylists({ form: spotifyForm, clearError: false });
      })();

      await Promise.all([bundlePromise, spotifyPromise]);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function connectSpotify(opts: { clearError?: boolean } = {}): Promise<boolean> {
    const clearError = opts.clearError ?? true;
    if (clearError) {
      setError("");
      setSpotifyResult(null);
    }
    setSpotifyConnecting(true);
    try {
      const w = window.open(
        "/api/spotify/authorize",
        "spotify_auth",
        "popup,width=520,height=720"
      );
      if (!w) {
        throw new Error("Popup blocked. Please allow popups for this site and try again.");
      }

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
    if (clearError) {
      setError("");
      setSpotifyResult(null);
    }
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
          .filter((item: SpotifyPlaylistResult) => item.gameNumber === 1 || item.gameNumber === 2)
        : [];

      setSpotifyResult(playlists);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create Spotify playlists.");
    } finally {
      setSpotifyCreating(false);
    }
  }

  return (
    <main>
      <header style={{ textAlign: "center", marginBottom: 60 }}>
        <h1>Music Bingo</h1>
        <p className="lead" style={{ margin: "0 auto" }}>
          Generate a full event pack with two game card PDFs, an Event Clipboard DOCX, and two Spotify playlists.
        </p>
      </header>

      <form className="card" onSubmit={onSubmit}>
        <div className="grid-2">
          <div>
            <label>Event Date</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
            <div className="small">Used in PDFs, DOCX clipboard, and playlist names</div>
          </div>
          <div>
            <label>Cards Per Game</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={countInput}
              onChange={(e) => setCountInput(e.target.value)}
            />
            <div className="small">Default is 40</div>
          </div>
        </div>

        <div className="mt-8 game-section">
          <h2>Game 1</h2>
          <label>Theme</label>
          <input
            value={game1Theme}
            onChange={(e) => setGame1Theme(e.target.value)}
            placeholder={DEFAULT_GAME_THEME}
          />
          <div className="small">Default: {DEFAULT_GAME_THEME}</div>

          <label style={{ marginTop: 12 }}>Song List (max 50)</label>
          <textarea
            value={game1SongsText}
            onChange={(e) => setGame1SongsText(e.target.value)}
            placeholder={`Elvis Presley - Jailhouse Rock\nThe Beatles - Hey Jude\nQueen - Bohemian Rhapsody`}
          />
          <div className="small">
            Parsed songs: {parsedGame1.songs.length}/{MAX_SONGS_PER_GAME}
            {parsedGame1.songs.length > MAX_SONGS_PER_GAME ? " (too many)" : ""}
          </div>
          <div className="small">
            Unique artists/titles: {parsedGame1.uniqueArtists.length}/{parsedGame1.uniqueTitles.length} (need at least 25 each for card generation)
          </div>

          <label style={{ marginTop: 12 }}>Dancing Challenge Song (Game 1)</label>
          <select
            value={game1ChallengeSong}
            onChange={(e) => setGame1ChallengeSong(e.target.value)}
            disabled={!parsedGame1.songs.length}
          >
            {!parsedGame1.songs.length ? <option value="">Add songs first</option> : null}
            {parsedGame1.songs.map((song) => {
              const value = makeSongSelectionValue(song);
              return (
                <option key={value} value={value}>
                  {songLabel(song)}
                </option>
              );
            })}
          </select>
        </div>

        <div className="mt-8 game-section">
          <h2>Game 2</h2>
          <label>Theme</label>
          <input
            value={game2Theme}
            onChange={(e) => setGame2Theme(e.target.value)}
            placeholder={DEFAULT_GAME_THEME}
          />
          <div className="small">Default: {DEFAULT_GAME_THEME}</div>

          <label style={{ marginTop: 12 }}>Song List (max 50, different list)</label>
          <textarea
            value={game2SongsText}
            onChange={(e) => setGame2SongsText(e.target.value)}
            placeholder={`ABBA - Dancing Queen\nBon Jovi - Livin on a Prayer\nMadonna - Like a Prayer`}
          />
          <div className="small">
            Parsed songs: {parsedGame2.songs.length}/{MAX_SONGS_PER_GAME}
            {parsedGame2.songs.length > MAX_SONGS_PER_GAME ? " (too many)" : ""}
          </div>
          <div className="small">
            Unique artists/titles: {parsedGame2.uniqueArtists.length}/{parsedGame2.uniqueTitles.length} (need at least 25 each for card generation)
          </div>

          <label style={{ marginTop: 12 }}>Sing-Along Challenge Song (Game 2)</label>
          <select
            value={game2ChallengeSong}
            onChange={(e) => setGame2ChallengeSong(e.target.value)}
            disabled={!parsedGame2.songs.length}
          >
            {!parsedGame2.songs.length ? <option value="">Add songs first</option> : null}
            {parsedGame2.songs.map((song) => {
              const value = makeSongSelectionValue(song);
              return (
                <option key={value} value={value}>
                  {songLabel(song)}
                </option>
              );
            })}
          </select>
        </div>

        <button type="submit" className="primary-btn" disabled={!canSubmit || busy}>
          <span>
            {spotifyConnecting
              ? "Connecting Spotify..."
              : spotifyCreating
                ? "Creating Spotify playlists..."
                : busy
                  ? "Generating event pack..."
                  : "Generate Event Pack + Create 2 Spotify Playlists"}
          </span>
        </button>

        <div className="small" style={{ textAlign: "center", marginTop: 16 }}>
          Output download includes: Game 1 PDF, Game 2 PDF, and Event Clipboard DOCX.
        </div>
        <div className="small" style={{ textAlign: "center", marginTop: 8 }}>
          Menu QR is always included. Event QR codes require `MANAGEMENT_API_BASE_URL` + `MANAGEMENT_API_TOKEN` on the server.
        </div>
        {qrNotice ? (
          <div className="small" style={{ textAlign: "center", marginTop: 8 }}>
            {qrNotice}
          </div>
        ) : null}
        {error ? <div className="error-message">{error}</div> : null}
      </form>

      <div className="card helper-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <h2>Spotify</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
              Connect Spotify once, then use the main button above to create one private playlist for each game.
            </p>
            <div className="small" style={{ marginTop: 8 }}>
              Add this exact Redirect URI in your Spotify app settings:
              <div className="mono" style={{ display: "inline-block", marginLeft: 8 }}>{spotifyCallbackUrl || "/api/spotify/callback"}</div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              {!spotifyConnected ? (
                <button
                  type="button"
                  onClick={() => connectSpotify()}
                  className="primary-btn"
                  disabled={spotifyConnecting}
                  style={{ width: "auto", marginTop: 0 }}
                >
                  {spotifyConnecting ? "Connecting..." : "Connect Spotify"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={disconnectSpotify}
                  className="secondary-btn"
                  disabled={spotifyConnecting || spotifyCreating}
                  style={{ width: "auto", marginTop: 0 }}
                >
                  Disconnect
                </button>
              )}
            </div>
            {spotifyResult && spotifyResult.length ? (
              <div className="small" style={{ marginTop: 12 }}>
                {spotifyResult.map((playlist) => (
                  <div key={`${playlist.gameNumber}-${playlist.playlistName}`} style={{ marginTop: 10 }}>
                    Game {playlist.gameNumber} ({playlist.theme}): <strong>{playlist.playlistName}</strong> - added {playlist.addedCount}/{playlist.totalSongs}
                    {playlist.notFoundCount ? ` (${playlist.notFoundCount} not found)` : ""}
                    {playlist.playlistUrl ? (
                      <>
                        {" "}
                        -{" "}
                        <a href={playlist.playlistUrl} target="_blank" rel="noreferrer" style={{ color: "var(--text-accent)" }}>
                          Open in Spotify
                        </a>
                      </>
                    ) : null}
                    {playlist.notFoundCount && playlist.notFound.length ? (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ cursor: "pointer" }}>
                          Show songs not found ({playlist.notFound.length})
                        </summary>
                        <div className="mono" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                          {playlist.notFound.map((s) => `${s.artist} - ${s.title}`).join("\n")}
                        </div>
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div style={{ flex: 1, minWidth: 280, background: "rgba(0,0,0,0.2)", padding: 16, borderRadius: 8 }}>
            <div className="small" style={{ marginTop: 0 }}>
              Spotify settings checklist:
              <div className="small" style={{ marginTop: 8 }}>
                - In Spotify Dashboard - your app - Settings - Redirect URIs, add:
                <div className="mono" style={{ display: "inline-block", marginLeft: 8 }}>{spotifyCallbackUrl || "/api/spotify/callback"}</div>
              </div>
              <div className="small" style={{ marginTop: 8 }}>
                - In Vercel Environment Variables, set <span className="mono">SPOTIFY_CLIENT_ID</span> and <span className="mono">SPOTIFY_CLIENT_SECRET</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
