import type { LiveSessionV1 } from "@/lib/live/types";

export async function listLiveSessions(): Promise<LiveSessionV1[]> {
  const res = await fetch("/api/sessions", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load sessions.");
  return res.json() as Promise<LiveSessionV1[]>;
}

export async function getLiveSession(id: string): Promise<LiveSessionV1 | null> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load session.");
  return res.json() as Promise<LiveSessionV1>;
}

export async function upsertLiveSession(session: LiveSessionV1): Promise<LiveSessionV1> {
  const res = await fetch("/api/sessions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || "Failed to save session.");
  }
  return res.json() as Promise<LiveSessionV1>;
}

export async function deleteLiveSession(id: string): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete session.");
}

export async function importLiveSessionJson(rawJson: string): Promise<LiveSessionV1> {
  const res = await fetch("/api/sessions/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawJson,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || "Failed to import session.");
  }
  return res.json() as Promise<LiveSessionV1>;
}

export function exportLiveSessionJson(session: LiveSessionV1): string {
  return JSON.stringify(session, null, 2);
}
