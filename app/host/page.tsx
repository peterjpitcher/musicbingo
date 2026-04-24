"use client";

import { useEffect, useState } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import {
  deleteLiveSession,
  importLiveSessionJson,
  listLiveSessions,
} from "@/lib/live/sessionApi";
import { migrateLocalSessionsToSupabase } from "@/lib/live/migrateToSupabase";
import type { LiveSessionV1 } from "@/lib/live/types";


function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


export default function HostDashboardPage() {
  const [sessions, setSessions] = useState<LiveSessionV1[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [notice, setNotice] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);

  async function refreshSessions() {
    const loaded = await listLiveSessions();
    setSessions(loaded);
  }

  useEffect(() => {
    async function init() {
      try {
        const { migrated } = await migrateLocalSessionsToSupabase();
        if (migrated.length > 0) {
          setNotice(
            `Migrated ${migrated.length} session${migrated.length > 1 ? "s" : ""} from local storage to Supabase.`
          );
        }
      } catch {
        // best-effort
      }
      try {
        await refreshSessions();
      } finally {
        setLoading(false);
      }
      fetch("/api/spotify/status", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setSpotifyConnected(Boolean(data?.connected)))
        .catch(() => {});
    }
    void init();
  }, []);

  async function onImportFile(file: File) {
    try {
      setError("");
      const text = await file.text();
      const imported = await importLiveSessionJson(text);
      await refreshSessions();
      setNotice(`Imported session: ${imported.name}`);
    } catch (err: any) {
      setNotice("");
      setError(err?.message ?? "Failed to import session file.");
    }
  }

  async function onDelete(session: LiveSessionV1) {
    if (!window.confirm(`Delete live session "${session.name}"?`)) return;
    try {
      await deleteLiveSession(session.id);
      await refreshSessions();
      setNotice(`Deleted session: ${session.name}`);
      setError("");
    } catch (err: any) {
      setNotice("");
      setError(err?.message ?? "Failed to delete session.");
    }
  }

  async function connectSpotify(): Promise<boolean> {
    try {
      const callbackUrl = `${window.location.origin}/api/spotify/callback`;
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
          if (!data || typeof data !== "object" || data.type !== "spotify-auth") return;
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
                  + `  ${callbackUrl}`
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
    }
  }

  async function fetchPlaylistSongsText(playlistId: string): Promise<string> {
    const res = await fetch(`/api/spotify/playlist/${encodeURIComponent(playlistId)}/tracks`, { cache: "no-store" });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `Failed to fetch playlist tracks (HTTP ${res.status}). Make sure Spotify is connected.`);
    }
    const data = await res.json();
    const tracks = data?.tracks as Array<{ artist: string; title: string }> | undefined;
    if (!tracks?.length) throw new Error("Playlist returned no tracks.");
    return tracks.map((t) => `${t.artist} - ${t.title}`).join("\n");
  }

  async function onRedownload(session: LiveSessionV1) {
    setDownloading(session.id);
    setError("");
    try {
      const game1 = session.games.find((g) => g.gameNumber === 1);
      const game2 = session.games.find((g) => g.gameNumber === 2);
      if (!game1?.playlistId || !game2?.playlistId) {
        throw new Error("Session is missing playlist IDs. Re-create from the prep screen.");
      }

      const form = new FormData();
      form.set("event_date", session.eventDateInput);
      form.set("game1_playlist_id", game1.playlistId);
      form.set("game2_playlist_id", game2.playlistId);

      if (session.prepData) {
        // Use stored prep data directly — no Spotify connection needed
        form.set("count", String(session.prepData.cardCount));
        form.set("game1_theme", session.prepData.game1Theme);
        form.set("game2_theme", session.prepData.game2Theme);
        form.set("game1_songs", session.prepData.game1SongsText);
        form.set("game2_songs", session.prepData.game2SongsText);
        form.set("game1_challenge_song", session.prepData.game1ChallengeSong);
        form.set("game2_challenge_song", session.prepData.game2ChallengeSong);
      } else {
        // Reconstruct from Spotify playlists — connect first if needed
        if (!spotifyConnected) {
          const ok = await connectSpotify();
          if (!ok) throw new Error("Spotify connection required to fetch playlist tracks for older sessions.");
        }
        const [game1Songs, game2Songs] = await Promise.all([
          fetchPlaylistSongsText(game1.playlistId),
          fetchPlaylistSongsText(game2.playlistId),
        ]);
        form.set("count", "40");
        form.set("game1_theme", game1.theme);
        form.set("game2_theme", game2.theme);
        form.set("game1_songs", game1Songs);
        form.set("game2_songs", game2Songs);
        form.set("game1_challenge_song", `${game1.challengeSongArtist}|||${game1.challengeSongTitle}`);
        form.set("game2_challenge_song", `${game2.challengeSongArtist}|||${game2.challengeSongTitle}`);
      }

      const res = await fetch("/api/generate", { method: "POST", body: form });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to generate event pack.");
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ??
        "music-bingo-event-pack.zip";
      downloadBlob(blob, filename);
      setNotice(`Downloaded event pack for: ${session.name}`);
    } catch (err: any) {
      setNotice("");
      setError(err?.message ?? "Failed to download event pack.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title="Music Bingo Host"
        subtitle="Live session dashboard"
        variant="light"
        actions={
          <>
            <label className="cursor-pointer">
              <span className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-4 py-2.5 text-sm font-semibold tracking-wide transition-colors cursor-pointer">
                Import Session JSON
              </span>
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (!file) return;
                  void onImportFile(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <Button as="link" href="/" variant="secondary" size="sm">
              Back to Prep
            </Button>
          </>
        }
      />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        {notice ? <Notice variant="success">{notice}</Notice> : null}
        {error ? <Notice variant="error">{error}</Notice> : null}

        {loading ? (
          <Card>
            <p className="text-slate-500 text-sm">Loading sessions...</p>
          </Card>
        ) : !sessions.length ? (
          <Card>
            <h2 className="text-lg font-bold text-slate-800 mb-2">No saved live sessions</h2>
            <p className="text-slate-500 text-sm mb-4">
              Generate playlists on the prep screen, then click &quot;Save Live Session&quot;.
            </p>
            <Button as="link" href="/" variant="primary">
              Open Prep Screen
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sessions.map((session) => (
              <Card as="article" key={session.id}>
                <h2 className="text-base font-bold text-slate-800 mb-1">{session.name}</h2>
                <p className="text-xs text-slate-500 mb-0.5">
                  Event Date: {session.eventDateDisplay}
                </p>
                <p className="text-xs text-slate-500 mb-3">
                  Created: {new Date(session.createdAt).toLocaleString()}
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {session.games
                    .slice()
                    .sort((a, b) => a.gameNumber - b.gameNumber)
                    .map((game) => (
                      <Badge key={game.gameNumber}>
                        Game {game.gameNumber}: {game.theme}
                      </Badge>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button as="link" href={`/host/${session.id}`} variant="primary" size="sm">
                    Open Host Controller
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={downloading === session.id}
                    onClick={() => void onRedownload(session)}
                  >
                    {downloading === session.id ? "Generating..." : "Re-download Event Pack"}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void onDelete(session)}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
