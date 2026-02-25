"use client";

import { useEffect, useState } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
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
      downloadJson(
        json,
        `music-bingo-live-session-${sanitizeFilenamePart(session.name, "session")}.json`
      );
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
                  <Button variant="secondary" size="sm" onClick={() => onExport(session)}>
                    Export
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
