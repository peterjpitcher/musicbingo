"use client";

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
  spotifyCallbackUrl,
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
    ? "Connecting Spotify..."
    : spotifyCreating
    ? "Creating Playlists..."
    : "Create Spotify Playlists";

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Spotify</h2>
        <p className="text-sm text-slate-500 mb-4">
          Connect Spotify once, then create one private playlist per game.
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

      <Card>
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          {playlistsCreated ? "Playlist Status" : "Step 1: Create Playlists"}
        </h2>

        {error ? <Notice variant="error" className="mb-4">{error}</Notice> : null}
        {qrNotice ? <Notice variant="info" className="mb-4">{qrNotice}</Notice> : null}

        {!playlistsCreated ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Create private Spotify playlists for each game, then review them before generating your event pack.
            </p>

            <Button
              variant="primary"
              fullWidth
              disabled={!spotifyConnected || !canSubmit || busy || spotifyCreating}
              onClick={onCreatePlaylists}
            >
              {createPlaylistsLabel}
            </Button>

            <Button
              variant="secondary"
              fullWidth
              disabled={!canSubmit || busy}
              onClick={onDownloadOnly}
            >
              {busy ? "Generating..." : "Download Only (No Spotify)"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {playlistResults && playlistResults.length > 0 ? (
              <div className="space-y-3">
                {playlistResults.map((result) => (
                  <div
                    key={result.gameNumber}
                    className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm"
                  >
                    <p className="font-semibold text-slate-700">
                      Game {result.gameNumber}
                    </p>
                    <p className={helpClass}>
                      <span className="text-emerald-600 font-medium">
                        &#10003; {result.addedCount}/{result.totalSongs} tracks matched
                      </span>
                      {" "}&mdash;{" "}
                      <a
                        href={result.playlistUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-600 underline underline-offset-2"
                      >
                        Open in Spotify &#8599;
                      </a>
                    </p>
                    {result.notFoundSongs.length > 0 ? (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-amber-700">
                          Not found ({result.notFoundSongs.length}):
                        </p>
                        <ul className="mt-1 text-xs text-slate-600 space-y-0.5 pl-3">
                          {result.notFoundSongs.map((song) => (
                            <li key={`${song.artist}-${song.title}`}>
                              &bull; {song.artist} &ndash; {song.title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex gap-3 flex-wrap">
              <Button
                variant="secondary"
                onClick={onRefreshFromSpotify}
                disabled={refreshing}
              >
                {refreshing ? "Refreshing..." : "Refresh from Spotify"}
              </Button>
            </div>

            <p className="text-sm text-slate-500">
              Review your playlists in Spotify, then generate your event pack.
            </p>
          </div>
        )}

        {spotifyResult && spotifyResult.length > 0 && !playlistResults ? (
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
                      {" "}&mdash;{" "}
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

        <div className="flex justify-start mt-6">
          <Button variant="secondary" onClick={onBack} as="button" type="button">
            &larr; Back
          </Button>
        </div>
      </Card>

      {playlistsCreated ? (
        <Card>
          <h2 className="text-xl font-bold text-slate-800 mb-4">
            Step 2: Generate Event Pack
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            Downloads: Game 1 PDF, Game 2 PDF, Event Clipboard DOCX, and QR codes.
          </p>

          <Button
            variant="primary"
            fullWidth
            disabled={busy}
            onClick={onGenerateEventPack}
          >
            {busy ? "Generating Event Pack..." : "Generate Event Pack"}
          </Button>

          <p className={[helpClass, "text-center mt-3"].join(" ")}>
            Menu QR is always included. Event QR codes require{" "}
            <code className="bg-slate-100 px-1 rounded text-slate-700">MANAGEMENT_API_BASE_URL</code> +{" "}
            <code className="bg-slate-100 px-1 rounded text-slate-700">MANAGEMENT_API_TOKEN</code> on the server.
          </p>
        </Card>
      ) : null}

      {livePlaylistByGame ? (
        <Card>
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
        </Card>
      ) : null}
    </div>
  );
}
