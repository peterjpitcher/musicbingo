"use client";

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
};

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
}: StepGenerateConnectProps) {
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
          <div className="nf-head">⚠ {allNotFound.length} song(s) not found on Spotify — check spelling or remove from song list</div>
          {allNotFound.map((m, i) => (
            <div className="nf-row" key={i}>
              <span className="nf-song"><b>Game {m.gameNumber}</b> · {m.artist} – {m.title}</span>
            </div>
          ))}
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
          <p>Game 1 &amp; 2 PDFs, Event Clipboard DOCX, QR codes</p>
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
