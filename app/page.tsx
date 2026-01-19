"use client";

import { useMemo, useState, useRef, useEffect } from "react";

function todayIso(): string {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function HomePage() {
  const [eventDate, setEventDate] = useState<string>(todayIso());
  const [count, setCount] = useState<number>(200);
  const [seed, setSeed] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [songsText, setSongsText] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [qrNotice, setQrNotice] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);
  const [spotifyConnecting, setSpotifyConnecting] = useState<boolean>(false);
  const [spotifyCreating, setSpotifyCreating] = useState<boolean>(false);
  const [spotifyResult, setSpotifyResult] = useState<{
    playlistName: string;
    playlistUrl: string | null;
    totalSongs: number;
    addedCount: number;
    notFoundCount: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [spotifyCallbackUrl, setSpotifyCallbackUrl] = useState<string>("/api/spotify/callback");

  useEffect(() => {
    setSpotifyCallbackUrl(`${window.location.origin}/api/spotify/callback`);
    fetch("/api/spotify/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSpotifyConnected(Boolean(data?.connected)))
      .catch(() => {});
  }, []);

  const canSubmit = useMemo(() => {
    if (!eventDate.trim()) return false;
    if (!count || count < 1) return false;
    if (!file && !songsText.trim()) return false;
    return true;
  }, [eventDate, count, file, songsText]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setQrNotice("");
    setSpotifyResult(null);
    setBusy(true);
    try {
      const pdfForm = new FormData();
      pdfForm.set("event_date", eventDate);
      pdfForm.set("count", String(count));
      if (seed.trim()) pdfForm.set("seed", seed.trim());
      if (file) pdfForm.set("file", file, file.name);
      else pdfForm.set("songs", songsText);

      const spotifyForm = new FormData();
      spotifyForm.set("event_date", eventDate);
      if (file) spotifyForm.set("file", file, file.name);
      else spotifyForm.set("songs", songsText);

      const pdfPromise = (async () => {
        const res = await fetch("/api/generate", { method: "POST", body: pdfForm });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || "Failed to generate PDF.");
        }

        const qrStatus = res.headers.get("x-music-bingo-qr-status");
        const requestedRaw = res.headers.get("x-music-bingo-events-requested");
        const eventsCount = res.headers.get("x-music-bingo-events-count");
        const eventsWithUrl = res.headers.get("x-music-bingo-events-with-url");
        const qrError = res.headers.get("x-music-bingo-qr-error");

        const expectedEvents = (() => {
          const n = requestedRaw ? Number.parseInt(requestedRaw, 10) : 3;
          return Number.isFinite(n) && n > 0 ? n : 3;
        })();

        if (qrStatus && qrStatus !== "ok") {
          if (qrStatus === "missing_config") {
            setQrNotice(
              "Upcoming event QRs: management API not configured (set MANAGEMENT_API_BASE_URL + MANAGEMENT_API_TOKEN in music bingo/.env.local, then restart npm run dev)."
            );
          } else if (qrStatus === "no_events") {
            setQrNotice("Upcoming event QRs: no upcoming events found after this date (placeholders used).");
          } else if (qrStatus === "error") {
            setQrNotice(`Upcoming event QRs: ${qrError || "failed to fetch events"} (placeholders used).`);
          }
        } else if (eventsWithUrl && eventsWithUrl !== String(expectedEvents)) {
          const count = Number.parseInt(eventsWithUrl, 10);
          if (Number.isFinite(count) && count >= 0 && count < expectedEvents) {
            setQrNotice(`Upcoming event QRs: only ${count}/${expectedEvents} event URLs resolved (placeholders used).`);
          }
        } else if (eventsCount && eventsCount !== String(expectedEvents)) {
          const count = Number.parseInt(eventsCount, 10);
          if (Number.isFinite(count) && count >= 0 && count < expectedEvents) {
            setQrNotice(`Upcoming event QRs: only ${count}/${expectedEvents} upcoming events found (placeholders used).`);
          }
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        const filename = res.headers.get("content-disposition")?.match(/filename=\"(.+)\"/)?.[1];
        a.download = filename ?? "music-bingo.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })();

      const spotifyPromise = (async () => {
        if (!spotifyConnected) {
          const ok = await connectSpotify({ clearError: false });
          if (!ok) return;
        }
        await createSpotifyPlaylist({ form: spotifyForm, clearError: false });
      })();

      await Promise.all([pdfPromise, spotifyPromise]);
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
                  + "If you saw “INVALID_CLIENT: Invalid redirect URI”, add this Redirect URI in your Spotify app settings:\n"
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

  async function createSpotifyPlaylist(opts: { form?: FormData; clearError?: boolean } = {}) {
    const clearError = opts.clearError ?? true;
    if (clearError) {
      setError("");
      setSpotifyResult(null);
    }
    setSpotifyCreating(true);
    try {
      const form = opts.form ?? (() => {
        const fd = new FormData();
        fd.set("event_date", eventDate);
        if (file) fd.set("file", file, file.name);
        else fd.set("songs", songsText);
        return fd;
      })();

      const res = await fetch("/api/spotify/create-playlist", { method: "POST", body: form });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        if (res.status === 401) setSpotifyConnected(false);
        throw new Error(msg || "Failed to create Spotify playlist.");
      }
      const data = await res.json();
      setSpotifyResult({
        playlistName: String(data?.playlistName ?? "Music Bingo"),
        playlistUrl: typeof data?.playlistUrl === "string" ? data.playlistUrl : null,
        totalSongs: Number(data?.totalSongs ?? 0),
        addedCount: Number(data?.addedCount ?? 0),
        notFoundCount: Number(data?.notFoundCount ?? 0),
      });
    } catch (err: any) {
      setError(err?.message ?? "Failed to create Spotify playlist.");
    } finally {
      setSpotifyCreating(false);
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  return (
    <main>
      <header style={{ textAlign: "center", marginBottom: 60 }}>
        <h1>Music Bingo</h1>
        <p className="lead" style={{ margin: "0 auto" }}>
          Generate professional, randomised bingo cards for your next event.
          Simply upload your playlist or paste your songs to get started.
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
            <div className="small">Printed on every card header</div>
          </div>
          <div>
            <label>Number of Cards</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
            <div className="small">200 cards recommended for most events</div>
          </div>
        </div>

        <div className="grid-2">
          <div>
            <label>Random Seed (Optional)</label>
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="e.g. 12345"
            />
            <div className="small">Leave blank for fresh random cards each time. Use a seed to reproduce the exact same cards.</div>
          </div>

          <div>
            <label>Song List File (Optional)</label>
            <div className="file-input-wrapper">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,text/plain"
                onChange={handleFileChange}
              />
              <div className="file-drop-label">
                {file ? (
                  <span style={{ color: "var(--text-accent)" }}>{file.name}</span>
                ) : (
                  <span>Drag file here or click to browse</span>
                )}
              </div>
            </div>
            <div className="small">Overrides manual text entry if selected</div>
          </div>
        </div>

        <div className="mt-8">
          <label>Song List (Plain Text)</label>
          <textarea
            value={songsText}
            onChange={(e) => setSongsText(e.target.value)}
            placeholder={`Elvis Presley – Jailhouse Rock\nThe Beatles – Hey Jude\nQueen – Bohemian Rhapsody...`}
            disabled={!!file}
            style={{ opacity: file ? 0.5 : 1 }}
          />
        </div>

        <button type="submit" className="primary-btn" disabled={!canSubmit || busy}>
          <span>
            {spotifyConnecting
              ? "Connecting Spotify..."
              : spotifyCreating
                ? "Creating Spotify playlist..."
                : busy
                  ? "Generating PDF..."
                  : "Generate PDF + Create Spotify Playlist"}
          </span>
        </button>

        <div className="small" style={{ textAlign: "center", marginTop: 16 }}>
          Each 5x5 grid includes optimised blank squares (max 1 per row/column)
        </div>
        <div className="small" style={{ textAlign: "center", marginTop: 8 }}>
          Menu QR is always included. Event QR codes require `MANAGEMENT_API_BASE_URL` + `MANAGEMENT_API_TOKEN` on the server.
        </div>
        {qrNotice ? (
          <div className="small" style={{ textAlign: "center", marginTop: 8 }}>
            {qrNotice}
          </div>
        ) : null}

        {error && <div className="error-message">{error}</div>}
      </form>

      <div className="card helper-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <h2>Spotify</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
              Connect Spotify once, then use the main button above to generate your PDF and create a <strong>private</strong> playlist.
            </p>
            <div className="small" style={{ marginTop: 8 }}>
              Add this exact Redirect URI in your Spotify app settings (not just the site URL):
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
                <>
                  <button
                    type="button"
                    onClick={disconnectSpotify}
                    className="secondary-btn"
                    disabled={spotifyConnecting || spotifyCreating}
                    style={{ width: "auto", marginTop: 0 }}
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
            {spotifyResult ? (
              <div className="small" style={{ marginTop: 12 }}>
                Created: <strong>{spotifyResult.playlistName}</strong> — added {spotifyResult.addedCount}/{spotifyResult.totalSongs}
                {spotifyResult.notFoundCount ? ` (${spotifyResult.notFoundCount} not found)` : ""}
                {spotifyResult.playlistUrl ? (
                  <>
                    {" "}
                    —{" "}
                    <a href={spotifyResult.playlistUrl} target="_blank" rel="noreferrer" style={{ color: "var(--text-accent)" }}>
                      Open in Spotify
                    </a>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <div style={{ flex: 1, minWidth: 280, background: "rgba(0,0,0,0.2)", padding: 16, borderRadius: 8 }}>
            <div className="small" style={{ marginTop: 0 }}>
              Spotify settings checklist:
              <div className="small" style={{ marginTop: 8 }}>
                - In Spotify Dashboard → your app → Settings → Redirect URIs, add:
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
