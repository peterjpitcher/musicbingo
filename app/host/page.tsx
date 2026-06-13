"use client";

import { useEffect, useState } from "react";

import { BrandSelector } from "@/components/brand/BrandSelector";
import { AppHeader } from "@/components/layout/AppHeader";
import { Notice } from "@/components/ui/Notice";
import {
  deleteLiveSession,
  exportLiveSessionJson,
  importLiveSessionJson,
  listLiveSessions,
  upsertLiveSession,
} from "@/lib/live/sessionApi";
import { migrateLocalSessionsToSupabase } from "@/lib/live/migrateToSupabase";
import type { LiveSessionV1 } from "@/lib/live/types";
import { parseSongListText } from "@/lib/parser";


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

function formatSongsForClipboard(text: string): string {
  const parsed = parseSongListText(text);
  if (parsed.songs.length > 0) {
    return parsed.songs.map((song) => `${song.artist} - ${song.title}`).join("\n");
  }
  return text.trim();
}

async function writeTextToClipboard(text: string): Promise<void> {
  let clipboardError: unknown = null;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (err: unknown) {
      clipboardError = err;
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    const suffix = clipboardError instanceof Error ? ` ${clipboardError.message}` : "";
    throw new Error(`Could not copy songs to the clipboard.${suffix}`);
  }
}

/** A session is "Ready" when both games have a playlist and at least 1 song each. */
function deriveStatus(session: LiveSessionV1): "ready" | "draft" {
  const game1 = session.games.find((g) => g.gameNumber === 1);
  const game2 = session.games.find((g) => g.gameNumber === 2);
  if (
    game1?.playlistId &&
    game2?.playlistId &&
    (game1.totalSongs ?? game1.addedCount ?? 0) >= 1 &&
    (game2.totalSongs ?? game2.addedCount ?? 0) >= 1
  ) {
    return "ready";
  }
  return "draft";
}


export default function HostDashboardPage() {
  const [sessions, setSessions] = useState<LiveSessionV1[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [notice, setNotice] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [copyingSongs, setCopyingSongs] = useState<string | null>(null);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);
  const [updatingBrand, setUpdatingBrand] = useState<string | null>(null);

  async function refreshSessions() {
    setError("");
    try {
      const loaded = await listLiveSessions();
      setSessions(loaded);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load sessions.";
      setError(msg);
    }
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
    } catch (err: unknown) {
      setNotice("");
      setError(err instanceof Error ? err.message : "Failed to import session file.");
    }
  }

  async function onDelete(session: LiveSessionV1) {
    if (!window.confirm(`Delete live session "${session.name}"?`)) return;
    try {
      await deleteLiveSession(session.id);
      await refreshSessions();
      setNotice(`Deleted session: ${session.name}`);
      setError("");
    } catch (err: unknown) {
      setNotice("");
      setError(err instanceof Error ? err.message : "Failed to delete session.");
    }
  }

  function onExportJson(session: LiveSessionV1) {
    const json = exportLiveSessionJson(session);
    const blob = new Blob([json], { type: "application/json" });
    const safeName = session.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    downloadBlob(blob, `${safeName}.json`);
    setNotice(`Exported session: ${session.name}`);
  }

  async function onDuplicate(session: LiveSessionV1) {
    try {
      const copy: LiveSessionV1 = {
        ...JSON.parse(JSON.stringify(session)) as LiveSessionV1,
        id: crypto.randomUUID(),
        name: `${session.name} (copy)`,
        createdAt: new Date().toISOString(),
      };
      await upsertLiveSession(copy);
      await refreshSessions();
      setNotice(`Duplicated session: ${session.name}`);
    } catch (err: unknown) {
      setNotice("");
      setError(err instanceof Error ? err.message : "Failed to duplicate session.");
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
          const data = event.data as Record<string, unknown>;
          if (!data || typeof data !== "object" || data["type"] !== "spotify-auth") return;
          cleanup();
          if (data["ok"]) resolve();
          else reject(new Error(typeof data["error"] === "string" ? data["error"] : "Spotify auth failed."));
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect Spotify.");
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

  async function onCopyRoundSongs(session: LiveSessionV1, gameNumber: 1 | 2) {
    const key = `${session.id}:${gameNumber}`;
    setCopyingSongs(key);
    setError("");

    try {
      const game = session.games.find((g) => g.gameNumber === gameNumber);
      const prepSongsText = gameNumber === 1
        ? session.prepData?.game1SongsText
        : session.prepData?.game2SongsText;

      let songsText = prepSongsText?.trim() ?? "";
      if (!songsText) {
        if (!game?.playlistId) {
          throw new Error(`Game ${gameNumber} has no saved song list or playlist ID.`);
        }
        if (!spotifyConnected) {
          const ok = await connectSpotify();
          if (!ok) throw new Error("Spotify connection required to fetch songs for this older session.");
        }
        songsText = await fetchPlaylistSongsText(game.playlistId);
      }

      const clipboardText = formatSongsForClipboard(songsText);
      if (!clipboardText) throw new Error(`Game ${gameNumber} has no songs to copy.`);

      await writeTextToClipboard(clipboardText);
      const copiedCount = clipboardText.split(/\r?\n/).filter((line) => line.trim()).length;
      setNotice(`Copied Game ${gameNumber} songs for: ${session.name} (${copiedCount} songs).`);
    } catch (err: unknown) {
      setNotice("");
      setError(err instanceof Error ? err.message : "Failed to copy songs.");
    } finally {
      setCopyingSongs(null);
    }
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
      form.set("song_play_seconds", String(Math.round(session.revealConfig.nextMs / 1000)));
      form.set("game1_playlist_id", game1.playlistId);
      form.set("game2_playlist_id", game2.playlistId);
      if (session.brandId) {
        form.set("brand_id", session.brandId);
      }

      if (session.prepData) {
        // Use stored prep data directly — no Spotify connection needed
        form.set("count", String(session.prepData.cardCount));
        form.set("game1_theme", session.prepData.game1Theme);
        form.set("game2_theme", session.prepData.game2Theme);
        form.set("game1_songs", session.prepData.game1SongsText);
        form.set("game2_songs", session.prepData.game2SongsText);
        form.set("game1_challenge_song", session.prepData.game1ChallengeSong);
        form.set("game2_challenge_song", session.prepData.game2ChallengeSong);
        if (typeof session.prepData.game1ChallengeBonusPoints === "number") {
          form.set("game1_challenge_bonus_points", String(session.prepData.game1ChallengeBonusPoints));
        }
        if (typeof session.prepData.game2ChallengeBonusPoints === "number") {
          form.set("game2_challenge_bonus_points", String(session.prepData.game2ChallengeBonusPoints));
        }
        if (session.prepData.game1ChallengeSongs?.length) {
          form.set("game1_challenge_songs", JSON.stringify(session.prepData.game1ChallengeSongs));
        }
        if (session.prepData.game2ChallengeSongs?.length) {
          form.set("game2_challenge_songs", JSON.stringify(session.prepData.game2ChallengeSongs));
        }
        if (session.prepData.game1IntroSong) {
          form.set("game1_intro_song", session.prepData.game1IntroSong);
        }
        if (session.prepData.game2IntroSong) {
          form.set("game2_intro_song", session.prepData.game2IntroSong);
        }
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
    } catch (err: unknown) {
      setNotice("");
      setError(err instanceof Error ? err.message : "Failed to download event pack.");
    } finally {
      setDownloading(null);
    }
  }

  async function openController(session: LiveSessionV1): Promise<void> {
    try {
      setError("");
      const res = await fetch(`/api/sessions/${encodeURIComponent(session.id)}/links`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Could not create private host link.");
      const data = await res.json() as { hostUrl?: string };
      window.location.href = data.hostUrl || `/host/${session.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open host controller.");
    }
  }

  return (
    <div className="host-root">
      <AppHeader
        title="Music Bingo"
        subtitle="Setup &amp; Manage"
        actions={
          <>
            <a href="/brands" className="hbtn">Manage Brands</a>
            <label className="hbtn" style={{ cursor: "pointer" }}>
              &#8595; Import Session JSON
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
            <a href="/prep" className="hbtn hbtn--primary">+ New Game</a>
          </>
        }
      />

      <div className="host-main" style={{ display: "block" }}>
        {notice ? (
          <div style={{ marginBottom: 16 }}>
            <Notice variant="success">{notice}</Notice>
          </div>
        ) : null}
        {error ? (
          <div style={{ marginBottom: 16 }}>
            <Notice variant="error">{error}</Notice>
          </div>
        ) : null}

        <div className="dash-head">
          <div>
            <h1>Your Games</h1>
            <p>Create a new game, or open any existing one to edit songs, themes, timing and details — nothing gets locked.</p>
          </div>
        </div>

        {loading ? (
          <div className="newcard" style={{ textAlign: "center", padding: "48px 24px" }}>
            <p style={{ margin: 0, opacity: 0.6 }}>Loading sessions&hellip;</p>
          </div>
        ) : !sessions.length ? (
          <div className="newcard" style={{ textAlign: "center", padding: "48px 24px" }}>
            <div className="plus">+</div>
            <div className="t">No saved live sessions</div>
            <p style={{ margin: "12px 0 20px", opacity: 0.6, fontSize: 14 }}>
              Generate playlists on the prep screen, then click &ldquo;Save Live Session&rdquo;.
            </p>
            <a href="/prep" className="hbtn hbtn--primary">+ New Game</a>
          </div>
        ) : (
          <div className="gtable-wrap">
            <table className="gtable">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Venue</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Game 1</th>
                  <th>Game 2</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const game1 = session.games.find((g) => g.gameNumber === 1);
                  const game2 = session.games.find((g) => g.gameNumber === 2);
                  const status = deriveStatus(session);
                  const isDownloading = downloading === session.id;
                  const isCopyingGame1 = copyingSongs === `${session.id}:1`;
                  const isCopyingGame2 = copyingSongs === `${session.id}:2`;
                  const isBrandUpdating = updatingBrand === session.id;

                  return (
                    <tr key={session.id}>
                      {/* Game */}
                      <td>
                        <div className="gt-name">{session.name || "Untitled game"}</div>
                        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 3 }}>
                          Created {new Date(session.createdAt).toLocaleDateString("en-GB")}
                        </div>
                      </td>

                      {/* Venue — brand chip + selector to change */}
                      <td>
                        <BrandSelector
                          value={session.brandId ?? null}
                          disabled={isBrandUpdating}
                          onChange={async (brandId) => {
                            setUpdatingBrand(session.id);
                            try {
                              const res = await fetch(`/api/sessions/${session.id}/brand`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ brand_id: brandId }),
                              });
                              if (!res.ok) throw new Error("Failed to update brand");
                              await refreshSessions();
                              setNotice(`Updated brand for: ${session.name}`);
                            } catch (err: unknown) {
                              setError(err instanceof Error ? err.message : "Failed to update brand.");
                            } finally {
                              setUpdatingBrand(null);
                            }
                          }}
                          className="hbtn"
                        />
                      </td>

                      {/* Date */}
                      <td className="gt-when">{session.eventDateDisplay}</td>

                      {/* Status — derived, never persisted */}
                      <td>
                        <span className={`statustag ${status}`}>
                          {status === "ready" ? "Ready" : "Draft"}
                        </span>
                      </td>

                      {/* Game 1 */}
                      <td className="gt-game">
                        <b>{game1?.theme || "Game 1"}</b>
                        <br />
                        <span>{game1 ? (game1.totalSongs ?? game1.addedCount ?? 0) : 0} songs</span>
                        <div className="gt-game-actions">
                          <button
                            className="hbtn gt-copy"
                            title="Copy Game 1 songs as plain text"
                            aria-label={`Copy Game 1 songs for ${session.name}`}
                            disabled={isCopyingGame1}
                            onClick={() => void onCopyRoundSongs(session, 1)}
                          >
                            {isCopyingGame1 ? "Copying..." : "Copy Songs"}
                          </button>
                        </div>
                      </td>

                      {/* Game 2 */}
                      <td className="gt-game">
                        <b>{game2?.theme || "Game 2"}</b>
                        <br />
                        <span>{game2 ? (game2.totalSongs ?? game2.addedCount ?? 0) : 0} songs</span>
                        <div className="gt-game-actions">
                          <button
                            className="hbtn gt-copy"
                            title="Copy Game 2 songs as plain text"
                            aria-label={`Copy Game 2 songs for ${session.name}`}
                            disabled={isCopyingGame2}
                            onClick={() => void onCopyRoundSongs(session, 2)}
                          >
                            {isCopyingGame2 ? "Copying..." : "Copy Songs"}
                          </button>
                        </div>
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="gt-actions">
                          <button
                            type="button"
                            className="hbtn hbtn--primary"
                            onClick={() => void openController(session)}
                          >
                            &#9654; Control
                          </button>
                          <a className="hbtn" href={`/prep?session=${session.id}`}>
                            &#9998; Edit
                          </a>
                          <button
                            className="hbtn"
                            title="Re-download event pack"
                            disabled={isDownloading || isBrandUpdating}
                            onClick={() => void onRedownload(session)}
                          >
                            {isDownloading ? "Generating…" : "Event Pack"}
                          </button>
                          <button
                            className="hbtn iconbtn"
                            title="Export session JSON"
                            onClick={() => onExportJson(session)}
                          >
                            &#8679;
                          </button>
                          <button
                            className="hbtn iconbtn"
                            title="Duplicate session"
                            onClick={() => void onDuplicate(session)}
                          >
                            &#10697;
                          </button>
                          <button
                            className="hbtn iconbtn hbtn--danger"
                            title="Delete session"
                            onClick={() => void onDelete(session)}
                          >
                            &#128465;
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
