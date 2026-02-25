"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  deleteLiveSession,
  exportLiveSessionJson,
  importLiveSessionJson,
  listLiveSessions,
} from "@/lib/live/sessionApi";
import { migrateLocalSessionsToSupabase } from "@/lib/live/migrateToSupabase";
import type { LiveSessionV1 } from "@/lib/live/types";
import { sanitizeFilenamePart } from "@/lib/utils";

function downloadJson(text: string, filename: string): void {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
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

  async function refreshSessions() {
    const loaded = await listLiveSessions();
    setSessions(loaded);
  }

  useEffect(() => {
    async function init() {
      try {
        const { migrated } = await migrateLocalSessionsToSupabase();
        if (migrated.length > 0) {
          setNotice(`Migrated ${migrated.length} session${migrated.length > 1 ? "s" : ""} from local storage to Supabase.`);
        }
      } catch {
        // best-effort
      }
      try {
        await refreshSessions();
      } finally {
        setLoading(false);
      }
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function onExport(session: LiveSessionV1) {
    try {
      setError("");
      const json = exportLiveSessionJson(session);
      downloadJson(json, `music-bingo-live-session-${sanitizeFilenamePart(session.name, "session")}.json`);
      setNotice(`Exported session: ${session.name}`);
    } catch (err: any) {
      setNotice("");
      setError(err?.message ?? "Failed to export session.");
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

  return (
    <div className="music-live-shell">
      <header className="music-live-header">
        <div className="music-live-header-left">
          <Image
            src="/the-anchor-pub-logo-white-transparent.png"
            alt="The Anchor"
            className="music-live-logo"
            width={160}
            height={50}
            priority
          />
          <div>
            <h1 className="music-live-title">Music Bingo Host</h1>
            <p className="music-live-subtitle">Live session dashboard</p>
          </div>
        </div>
        <div className="music-live-header-actions">
          <label className="music-live-secondary-btn" style={{ cursor: "pointer" }}>
            Import Session JSON
            <input
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (!file) return;
                void onImportFile(file);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <Link href="/" className="music-live-secondary-btn">
            Back to Prep
          </Link>
        </div>
      </header>

      <section className="music-live-content">
        {notice ? <div className="music-live-notice">{notice}</div> : null}
        {error ? <div className="music-live-error">{error}</div> : null}

        {loading ? (
          <div className="music-live-card music-live-empty-state">
            <p className="music-live-muted">Loading sessions...</p>
          </div>
        ) : !sessions.length ? (
          <div className="music-live-card music-live-empty-state">
            <h2 className="music-live-card-title">No saved live sessions</h2>
            <p className="music-live-muted">
              Generate playlists on the prep screen, then click &quot;Save Live Session&quot;.
            </p>
            <div style={{ marginTop: 12 }}>
              <Link href="/" className="music-live-primary-btn">
                Open Prep Screen
              </Link>
            </div>
          </div>
        ) : (
          <div className="music-live-grid">
            {sessions.map((session) => (
              <article key={session.id} className="music-live-card">
                <h2 className="music-live-card-title">{session.name}</h2>
                <p className="music-live-muted">Event Date: {session.eventDateDisplay}</p>
                <p className="music-live-muted">Created: {new Date(session.createdAt).toLocaleString()}</p>
                <div className="music-live-tag-row">
                  {session.games
                    .slice()
                    .sort((a, b) => a.gameNumber - b.gameNumber)
                    .map((game) => (
                      <span key={game.gameNumber} className="music-live-tag">
                        Game {game.gameNumber}: {game.theme}
                      </span>
                    ))}
                </div>
                <div className="music-live-row-actions">
                  <Link href={`/host/${session.id}`} className="music-live-primary-btn">
                    Open Host Controller
                  </Link>
                  <button type="button" className="music-live-secondary-btn" onClick={() => onExport(session)}>
                    Export
                  </button>
                  <button type="button" className="music-live-danger-btn" onClick={() => void onDelete(session)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
