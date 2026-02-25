"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { helpClass, inputClass, labelClass } from "@/components/ui/formStyles";
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
  liveSessionName: string;
  onLiveSessionName: (v: string) => void;
  liveSessionNotice: string;
  error: string;
  qrNotice: string;
  onSubmit: (e: React.FormEvent) => void;
  onConnectSpotify: () => void;
  onDisconnectSpotify: () => void;
  onSaveLiveSession: () => void;
  onExportLiveSession: () => void;
  onBack: () => void;
};

export function StepGenerateConnect({
  canSubmit,
  busy,
  spotifyConnected,
  spotifyConnecting,
  spotifyCreating,
  spotifyCallbackUrl,
  spotifyResult,
  livePlaylistByGame,
  liveSessionName,
  onLiveSessionName,
  liveSessionNotice,
  error,
  qrNotice,
  onSubmit,
  onConnectSpotify,
  onDisconnectSpotify,
  onSaveLiveSession,
  onExportLiveSession,
  onBack,
}: StepGenerateConnectProps) {
  const generateLabel = spotifyConnecting
    ? "Connecting Spotify..."
    : spotifyCreating
    ? "Creating Spotify playlists..."
    : busy
    ? "Generating event pack..."
    : "Generate Event Pack + Create Spotify Playlists";

  return (
    <div className="space-y-5">
      <Card as="form" onSubmit={onSubmit}>
        <h2 className="text-xl font-bold text-slate-800 mb-4">Generate</h2>
        <p className="text-sm text-slate-500 mb-6">
          Downloads: Game 1 PDF, Game 2 PDF, Event Clipboard DOCX, and QR codes. Also creates two private Spotify playlists.
        </p>

        {error ? <Notice variant="error" className="mb-4">{error}</Notice> : null}
        {qrNotice ? <Notice variant="info" className="mb-4">{qrNotice}</Notice> : null}

        <Button
          as="button"
          type="submit"
          variant="primary"
          fullWidth
          disabled={!canSubmit || busy}
        >
          {generateLabel}
        </Button>

        <p className={[helpClass, "text-center mt-3"].join(" ")}>
          Menu QR is always included. Event QR codes require{" "}
          <code className="bg-slate-100 px-1 rounded text-slate-700">MANAGEMENT_API_BASE_URL</code> +{" "}
          <code className="bg-slate-100 px-1 rounded text-slate-700">MANAGEMENT_API_TOKEN</code> on the server.
        </p>

        <div className="flex justify-start mt-6">
          <Button variant="secondary" onClick={onBack} as="button" type="button">
            ← Back
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Spotify</h2>
        <p className="text-sm text-slate-500 mb-4">
          Connect Spotify once, then use the Generate button above to create one private playlist per game.
        </p>

        <p className={helpClass}>
          Add this exact Redirect URI in your Spotify app settings:{" "}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 text-xs ml-1">
            {spotifyCallbackUrl || "/api/spotify/callback"}
          </code>
        </p>

        <div className="flex gap-3 mt-4 flex-wrap items-center">
          {!spotifyConnected ? (
            <Button
              variant="primary"
              onClick={onConnectSpotify}
              disabled={spotifyConnecting}
            >
              {spotifyConnecting ? "Connecting..." : "Connect Spotify"}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={onDisconnectSpotify}
              disabled={spotifyConnecting || spotifyCreating}
            >
              Disconnect Spotify
            </Button>
          )}
        </div>

        {spotifyResult && spotifyResult.length > 0 ? (
          <div className="mt-4 space-y-3">
            {spotifyResult.map((playlist) => (
              <div
                key={`${playlist.gameNumber}-${playlist.playlistName}`}
                className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm"
              >
                <p className="font-semibold text-slate-700">
                  Game {playlist.gameNumber} ({playlist.theme}):{" "}
                  {playlist.playlistName}
                </p>
                <p className={helpClass}>
                  Added {playlist.addedCount}/{playlist.totalSongs}
                  {playlist.notFoundCount
                    ? ` (${playlist.notFoundCount} not found)`
                    : ""}
                  {playlist.playlistUrl ? (
                    <>
                      {" "}—{" "}
                      <a
                        href={playlist.playlistUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-600 underline underline-offset-2"
                      >
                        Open in Spotify
                      </a>
                    </>
                  ) : null}
                </p>
                {playlist.notFoundCount && playlist.notFound.length ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-slate-500">
                      Show songs not found ({playlist.notFound.length})
                    </summary>
                    <pre className="mt-2 text-xs bg-slate-100 rounded p-2 whitespace-pre-wrap">
                      {playlist.notFound
                        .map((s) => `${s.artist} - ${s.title}`)
                        .join("\n")}
                    </pre>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {livePlaylistByGame ? (
          <div className="mt-5 pt-5 border-t border-slate-200">
            <h3 className="text-base font-bold text-slate-800 mb-3">Live Session</h3>
            <label className={labelClass}>Session Name</label>
            <input
              type="text"
              className={inputClass}
              value={liveSessionName}
              onChange={(e) => onLiveSessionName(e.target.value)}
              placeholder="Music Bingo - Event Date"
            />
            {liveSessionNotice ? (
              <Notice variant="success" className="mt-3">
                {liveSessionNotice}
              </Notice>
            ) : null}
            <div className="flex flex-wrap gap-2.5 mt-4">
              <Button variant="primary" onClick={onSaveLiveSession}>
                Save Live Session
              </Button>
              <Button variant="secondary" onClick={onExportLiveSession}>
                Export JSON
              </Button>
              <Button as="link" href="/host" variant="secondary">
                Open Live Host Console
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-1">
          <p>
            Spotify settings checklist: In Spotify Dashboard → your app → Settings → Redirect URIs, add:{" "}
            <code className="bg-slate-100 px-1 rounded">
              {spotifyCallbackUrl || "/api/spotify/callback"}
            </code>
          </p>
          <p>
            In Vercel Environment Variables, set{" "}
            <code className="bg-slate-100 px-1 rounded">SPOTIFY_CLIENT_ID</code> and{" "}
            <code className="bg-slate-100 px-1 rounded">SPOTIFY_CLIENT_SECRET</code>.
          </p>
        </div>
      </Card>
    </div>
  );
}
