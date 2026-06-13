"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import { Notice } from "@/components/ui/Notice";

export default function AdminUnlockPage() {
  const [nextPath, setNextPath] = useState("/host");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next?.startsWith("/")) setNextPath(next);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Could not unlock admin.");
      }
      window.location.href = nextPath.startsWith("/") ? nextPath : "/host";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock admin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="host-root">
      <AppHeader title="Music Bingo" subtitle="Admin Unlock" />
      <main className="host-main">
        <form className="newcard" onSubmit={submit} style={{ maxWidth: 520, margin: "60px auto" }}>
          <h1 style={{ marginTop: 0 }}>Unlock admin</h1>
          <p style={{ opacity: 0.7 }}>
            Enter the admin secret for this Music Bingo app.
          </p>
          {error ? <Notice variant="error">{error}</Notice> : null}
          <label className="field-label" htmlFor="admin-secret">Admin secret</label>
          <input
            id="admin-secret"
            className="input"
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.currentTarget.value)}
            autoComplete="current-password"
          />
          <div style={{ marginTop: 18 }}>
            <button className="hbtn hbtn--primary" disabled={busy} type="submit">
              {busy ? "Unlocking..." : "Unlock"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
