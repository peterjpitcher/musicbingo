"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

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

type PlaylistResult = {
  gameNumber: 1 | 2;
  playlistId: string;
  playlistUrl: string;
  addedCount: number;
  totalSongs: number;
  notFoundSongs: Array<{ artist: string; title: string }>;
};

type ResolveResult =
  | { ok: true; trackId: string }
  | { ok: false; error: string };

type StepGenerateConnectProps = {
  canSubmit: boolean;
  busy: boolean;
  spotifyConnected: boolean;
  spotifyConnecting: boolean;
  spotifyCreating: boolean;
  spotifyCallbackUrl: string;
  spotifyResult: SpotifyPlaylistResult[] | null;
  livePlaylistByGame: {
    game1: SpotifyPlaylistResult;
    game2: SpotifyPlaylistResult;
  } | null;
  playlistsCreated: boolean;
  playlistResults: PlaylistResult[] | null;
  liveSessionName: string;
  onLiveSessionName: (v: string) => void;
  liveSessionNotice: string;
  error: string;
  qrNotice: string;
  onCreatePlaylists: () => void;
  onRefreshFromSpotify: () => void;
  onGenerateEventPack: () => void;
  onDownloadOnly: () => void;
  onConnectSpotify: () => void;
  onDisconnectSpotify: () => void;
  onSaveLiveSession: () => void;
  onExportLiveSession: () => void;
  onBack: () => void;
  refreshing: boolean;
  onResolveMissingSong: (opts: {
    gameNumber: 1 | 2;
    artist: string;
    title: string;
    spotifyTrackUrl: string;
  }) => Promise<ResolveResult>;
};

// Per-row resolution state keyed by "{gameNumber}:{artist}:{title}"
type RowResolutionState =
  | { status: "idle"; input: string }
  | { status: "resolving"; input: string }
  | { status: "resolved"; trackId: string }
  | { status: "skipped" }
  | { status: "error"; input: string; error: string };

function makeRowKey(gameNumber: number, artist: string, title: string) {
  return `${gameNumber}:${artist}:${title}`;
}

export function StepGenerateConnect({
  canSubmit,
  busy,
  spotifyConnected,
  spotifyConnecting,
  spotifyCreating,
  spotifyCallbackUrl: _spotifyCallbackUrl,
  spotifyResult,
  livePlaylistByGame,
  playlistsCreated,
  playlistResults,
  liveSessionName,
  onLiveSessionName,
  liveSessionNotice,
  error,
  qrNotice,
  onCreatePlaylists,
  onRefreshFromSpotify,
  onGenerateEventPack,
  onDownloadOnly,
  onConnectSpotify,
  onDisconnectSpotify,
  onSaveLiveSession,
  onExportLiveSession,
  onBack,
  refreshing,
  onResolveMissingSong,
}: StepGenerateConnectProps) {
  // Per-row resolve state — keyed by "gameNumber:artist:title"
  const [rowStates, setRowStates] = useState<Record<string, RowResolutionState>>({});

  const createPlaylistsLabel = spotifyConnecting
    ? "Connecting Spotify…"
    : spotifyCreating
    ? "Creating Playlists…"
    : "Create Spotify Playlists";

  // Collect all not-found songs from playlist results for the .notfound block
  const allNotFound = playlistResults
    ? playlistResults.flatMap((r) =>
        r.notFoundSongs.map((s) => ({ ...s, gameNumber: r.gameNumber }))
      )
    : spotifyResult
    ? spotifyResult.flatMap((r) =>
        r.notFound.map((s) => ({ ...s, gameNumber: r.gameNumber }))
      )
    : [];

  function getRowState(gameNumber: number, artist: string, title: string): RowResolutionState {
    return rowStates[makeRowKey(gameNumber, artist, title)] ?? { status: "idle", input: "" };
  }

  function setRowState(gameNumber: number, artist: string, title: string, state: RowResolutionState) {
    setRowStates((prev) => ({ ...prev, [makeRowKey(gameNumber, artist, title)]: state }));
  }

  async function handleResolve(gameNumber: 1 | 2, artist: string, title: string) {
    const key = makeRowKey(gameNumber, artist, title);
    const current = rowStates[key] ?? { status: "idle", input: "" };
    const input = current.status === "idle" || current.status === "error" ? (current as any).input as string : "";
    if (!input.trim()) return;
    setRowState(gameNumber, artist, title, { status: "resolving", input });
    const result = await onResolveMissingSong({ gameNumber, artist, title, spotifyTrackUrl: input.trim() });
    if (result.ok) {
      setRowState(gameNumber, artist, title, { status: "resolved", trackId: result.trackId });
    } else {
      setRowState(gameNumber, artist, title, { status: "error", input, error: result.error });
    }
  }

  function handleSkip(gameNumber: number, artist: string, title: string) {
    setRowState(gameNumber, artist, title, { status: "skipped" });
  }

  function handleInputChange(gameNumber: number, artist: string, title: string, value: string) {
    const prev = rowStates[makeRowKey(gameNumber, artist, title)] ?? { status: "idle", input: "" };
    if (prev.status === "resolved" || prev.status === "skipped") return;
    setRowState(gameNumber, artist, title, { status: prev.status === "error" ? "error" : "idle", input: value, ...(prev.status === "error" ? { error: (prev as any).error } : {}) } as RowResolutionState);
  }

  return (
    <div className="wizpanel">
      <h2>Generate &amp; Connect</h2>

      {error ? <Notice variant="error" className="mb-4">{error}</Notice> : null}
      {qrNotice ? <Notice variant="info" className="mb-4">{qrNotice}</Notice> : null}

      {/* Spotify connect row */}
      <div className="genrow">
        <div className="ic">🎧</div>
        <div className="gx">
          <b>Spotify</b>
          <p>
            {spotifyConnected
              ? "Connected — playback &amp; playlist creation ready"
              : "Connect your Spotify account to build playlists &amp; control playback"}
          </p>
        </div>
        {spotifyConnected ? (
          <Button
            variant="secondary"
            onClick={onDisconnectSpotify}
            disabled={spotifyConnecting || spotifyCreating}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={onConnectSpotify}
            disabled={spotifyConnecting}
          >
            {spotifyConnecting ? "Connecting…" : "Connect Spotify"}
          </Button>
        )}
      </div>

      {/* Create playlists row */}
      <div className="genrow">
        <div className="ic">🎵</div>
        <div className="gx">
          <b>Playlists</b>
          <p>
            {playlistsCreated
              ? (() => {
                  const results = playlistResults ?? [];
                  return results.map((r) => (
                    <span key={r.gameNumber} style={{ display: "block" }}>
                      Game {r.gameNumber}: ✓ {r.addedCount}/{r.totalSongs} tracks
                      {r.playlistUrl ? (
                        <>
                          {" "}—{" "}
                          <a href={r.playlistUrl} target="_blank" rel="noreferrer" style={{ color: "var(--brand-accent-light)", textDecoration: "underline" }}>
                            Open ↗
                          </a>
                        </>
                      ) : null}
                    </span>
                  ));
                })()
              : "Search Spotify &amp; build a shuffled playlist per game"}
          </p>
        </div>
        {playlistsCreated ? (
          <Button variant="secondary" onClick={onRefreshFromSpotify} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!spotifyConnected || !canSubmit || busy || spotifyCreating}
            onClick={onCreatePlaylists}
          >
            {createPlaylistsLabel}
          </Button>
        )}
      </div>

      {/* Songs not found on Spotify */}
      {allNotFound.length > 0 && (
        <div className="notfound">
          <div className="nf-head">
            ⚠ {allNotFound.length} song(s) not found on Spotify — paste a Spotify track link to resolve, or skip
          </div>
          {allNotFound.map((m, i) => {
            const rs = getRowState(m.gameNumber, m.artist, m.title);
            if (rs.status === "skipped") return null;
            const inputVal = rs.status === "idle" || rs.status === "error" ? (rs as any).input as string : "";
            const isResolving = rs.status === "resolving";
            const isResolved = rs.status === "resolved";
            return (
              <div className="nf-row" key={i}>
                <span className="nf-song">
                  <b>Game {m.gameNumber}</b> · {m.artist} – {m.title}
                </span>
                {isResolved ? (
                  <span className="nf-ok">✓ Matched</span>
                ) : (
                  <>
                    <input
                      type="url"
                      className="nf-input"
                      placeholder="Paste Spotify track link…"
                      value={inputVal}
                      onChange={(e) => handleInputChange(m.gameNumber, m.artist, m.title, e.target.value)}
                      disabled={isResolving}
                      aria-label={`Spotify link for ${m.artist} – ${m.title}`}
                    />
                    <button
                      type="button"
                      className="hbtn hbtn--primary"
                      style={{ minHeight: 36, fontSize: 13, padding: "0 12px", flexShrink: 0 }}
                      disabled={isResolving || !inputVal.trim()}
                      onClick={() => void handleResolve(m.gameNumber as 1 | 2, m.artist, m.title)}
                    >
                      {isResolving ? "Resolving…" : "Resolve"}
                    </button>
                    <button
                      type="button"
                      className="hbtn"
                      style={{ minHeight: 36, fontSize: 13, padding: "0 10px", flexShrink: 0 }}
                      disabled={isResolving}
                      onClick={() => handleSkip(m.gameNumber, m.artist, m.title)}
                    >
                      Skip
                    </button>
                  </>
                )}
                {rs.status === "error" && (
                  <span style={{ fontSize: 12, color: "#e87f7f", flexBasis: "100%", paddingTop: 4 }}>
                    {rs.error}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Download only row */}
      <div className="genrow">
        <div className="ic">📥</div>
        <div className="gx">
          <b>Download Only</b>
          <p>Generate bingo cards without Spotify playlists</p>
        </div>
        <Button
          variant="secondary"
          disabled={!canSubmit || busy}
          onClick={onDownloadOnly}
        >
          {busy ? "Generating…" : "Download Only"}
        </Button>
      </div>

      {/* Generate event pack row */}
      <div className="genrow">
        <div className="ic">🗜️</div>
        <div className="gx">
          <b>Event Pack ZIP</b>
          <p>Game 1 &amp; 2 PDFs, What&apos;s On backs, run sheet</p>
        </div>
        <Button
          variant="primary"
          disabled={!playlistsCreated || busy}
          onClick={onGenerateEventPack}
        >
          {busy ? "Generating…" : "Generate Event Pack"}
        </Button>
      </div>

      {/* Live session block */}
      {livePlaylistByGame ? (
        <div className="genrow" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", width: "100%" }}>
            <div className="ic">📡</div>
            <div className="gx"><b>Live Session</b><p>Save to host console or export as JSON</p></div>
          </div>
          <div className="fg" style={{ width: "100%" }}>
            <label style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "rgb(var(--cream-rgb)/.65)", fontWeight: 700 }}>
              Session name
            </label>
            <input
              type="text"
              value={liveSessionName}
              onChange={(e) => onLiveSessionName(e.target.value)}
              placeholder="Music Bingo - Event Date"
            />
          </div>
          {liveSessionNotice ? (
            <Notice variant="success">{liveSessionNotice}</Notice>
          ) : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={onSaveLiveSession}>Save Live Session</Button>
            <Button variant="secondary" onClick={onExportLiveSession}>Export JSON</Button>
            <Button as="link" href="/host" variant="secondary">Open Host Console</Button>
          </div>
        </div>
      ) : null}

      <div className="wiznav">
        <Button variant="secondary" onClick={onBack}>← Back</Button>
        <span />
      </div>
    </div>
  );
}
