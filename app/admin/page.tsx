"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import { safeNextPath } from "@/lib/live/adminGuard";
import { Banner, buttonClass, Card, fieldClass, fieldHintClass, fieldLabelClass } from "@anchor-nights/kit/ui";

export default function AdminUnlockPage() {
  const [nextPath, setNextPath] = useState("/host");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNextPath(safeNextPath(new URLSearchParams(window.location.search).get("next")));
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
      window.location.href = safeNextPath(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock admin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="host-root theme-desk">
      <AppHeader title="Music Bingo" subtitle="Admin Unlock" />
      <main className="mx-auto w-full max-w-[520px] px-4 py-10 sm:py-16">
        <Card className="p-6 sm:p-8">
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div>
              <h1 className="m-0 text-3xl text-fg-strong">Unlock admin</h1>
              <p className={`mt-2 ${fieldHintClass}`}>
                Enter the admin secret for this Music Bingo app.
              </p>
            </div>
            {error ? <Banner tone="danger">{error}</Banner> : null}
            <div className="flex flex-col gap-2">
              <label className={fieldLabelClass} htmlFor="admin-secret">Admin secret</label>
              <input
                id="admin-secret"
                className={fieldClass}
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.currentTarget.value)}
                autoComplete="current-password"
              />
            </div>
            <button className={buttonClass({ variant: "primary", size: "lg", block: true })} disabled={busy} type="submit">
              {busy ? "Unlocking..." : "Unlock"}
            </button>
          </form>
        </Card>
      </main>
    </div>
  );
}
