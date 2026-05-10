# Review Pack: guest-screen-fixes

**Generated:** 2026-05-10
**Mode:** B (A=Adversarial / B=Code / C=Spec Compliance)
**Project root:** `/Users/peterpitcher/Cursor/OJ-MusicBingo/.claude/worktrees/stupefied-swirles-7f4d3b`
**Base ref:** `HEAD`
**HEAD:** `e425c7f`
**Diff range:** `HEAD`
**Stats:**  2 files changed, 61 insertions(+), 12 deletions(-)

> This pack is the sole input for reviewers. Do NOT read files outside it unless a specific finding requires verification. If a file not in the pack is needed, mark the finding `Needs verification` and describe what would resolve it.

## Changed Files

```
app/guest/[sessionId]/page.tsx
app/host/[sessionId]/page.tsx
```

## User Concerns

Challenge song detection logic and progress interpolation hook correctness

## Diff (`HEAD`)

```diff
diff --git a/app/guest/[sessionId]/page.tsx b/app/guest/[sessionId]/page.tsx
index 78f32be..f5c78f1 100644
--- a/app/guest/[sessionId]/page.tsx
+++ b/app/guest/[sessionId]/page.tsx
@@ -16,6 +16,7 @@ import {
   type LiveSessionV1,
   type RevealConfig,
 } from "@/lib/live/types";
+import { computeRevealState } from "@/lib/live/reveal";
 import { useWakeLock } from "@/hooks/useWakeLock";
 import { BrandProvider } from "@/components/brand/BrandProvider";
 import type { BrandConfig } from "@/lib/brands/types";
@@ -25,6 +26,44 @@ function formatSeconds(ms: number): string {
   return `${Math.floor(safeMs / 1000)}s`;
 }
 
+/**
+ * Interpolates progressMs locally between server updates so the UI ticks
+ * smoothly every second rather than jumping every 2s when a new poll arrives.
+ * Stores the server-provided anchor point and a local tick counter.
+ */
+function useInterpolatedProgress(runtime: LiveRuntimeState): number {
+  const serverProgress = runtime.currentTrack?.progressMs ?? 0;
+  const isPlaying = runtime.currentTrack?.isPlaying ?? false;
+  const trackId = runtime.currentTrack?.trackId ?? null;
+  const updatedAt = runtime.updatedAtMs;
+
+  // Anchor: the last known server state. Memoised so it only recalculates
+  // when the server actually sends new data (trackId or updatedAt changes).
+  const anchor = useMemo(
+    () => ({ progress: serverProgress, updatedAt, trackId }),
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+    [updatedAt, trackId]
+  );
+
+  // Tick counter to drive re-renders every second
+  const [tick, setTick] = useState(0);
+
+  useEffect(() => {
+    setTick(0);
+  }, [anchor]);
+
+  useEffect(() => {
+    if (!isPlaying || !trackId) return;
+    const id = window.setInterval(() => {
+      setTick((t) => t + 1);
+    }, 1000);
+    return () => window.clearInterval(id);
+  }, [isPlaying, trackId, anchor]);
+
+  if (!isPlaying) return anchor.progress;
+  return anchor.progress + tick * 1000;
+}
+
 export default function GuestDisplayPage() {
   const params = useParams<{ sessionId: string }>();
   const sessionId = useMemo(
@@ -117,6 +156,8 @@ export default function GuestDisplayPage() {
     return () => window.clearInterval(id);
   }, [sessionId]);
 
+  const interpolatedProgress = useInterpolatedProgress(runtime);
+
   if (sessionLoading) {
     return (
       <BrandProvider brand={brand}>
@@ -158,6 +199,11 @@ export default function GuestDisplayPage() {
     ? CHALLENGE_REVEAL_CONFIG
     : (session?.revealConfig ?? DEFAULT_REVEAL_CONFIG);
 
+  // Use locally interpolated progress for smooth reveal transitions
+  const localRevealState = (runtime.isIntroSong || runtime.freePlay)
+    ? { showAlbum: true, showTitle: true, showArtist: true, shouldAdvance: false }
+    : computeRevealState(interpolatedProgress, effectiveCfg);
+
   const showWaiting =
     runtime.mode === "idle" || (!runtime.currentTrack && runtime.mode === "running");
   const showBreak = runtime.mode === "break";
@@ -348,7 +394,7 @@ export default function GuestDisplayPage() {
           <div className="grid grid-cols-1 lg:[grid-template-columns:minmax(260px,560px)_minmax(0,1fr)] gap-7 items-center">
             {/* Album art */}
             <div className="flex items-center justify-center">
-              {(runtime.isIntroSong || runtime.freePlay || runtime.revealState.showAlbum) ? (
+              {(runtime.isIntroSong || runtime.freePlay || localRevealState.showAlbum) ? (
                 runtime.currentTrack.albumImageUrl ? (
                   <img
                     src={runtime.currentTrack.albumImageUrl}
@@ -369,7 +415,7 @@ export default function GuestDisplayPage() {
 
             {/* Track metadata */}
             <div className="grid gap-3.5 lg:text-left text-center">
-              {(runtime.isIntroSong || runtime.freePlay || runtime.revealState.showTitle) ? (
+              {(runtime.isIntroSong || runtime.freePlay || localRevealState.showTitle) ? (
                 <h2 className="m-0 text-[clamp(1.6rem,4.5vw,4.2rem)] uppercase font-black tracking-wide text-white">
                   {runtime.currentTrack.title || "Unknown Title"}
                 </h2>
@@ -379,7 +425,7 @@ export default function GuestDisplayPage() {
                 </h2>
               )}
 
-              {(runtime.isIntroSong || runtime.freePlay || runtime.revealState.showArtist) ? (
+              {(runtime.isIntroSong || runtime.freePlay || localRevealState.showArtist) ? (
                 <p className="m-0 text-[clamp(1.3rem,3vw,2.8rem)] font-bold text-white">
                   {runtime.currentTrack.artist || "Unknown Artist"}
                 </p>
@@ -393,7 +439,7 @@ export default function GuestDisplayPage() {
                 <p className="mt-1.5 text-white/70 text-[clamp(1rem,2vw,1.7rem)] uppercase tracking-[0.05em]">
                   Free Play
                 </p>
-              ) : runtime.revealState.shouldAdvance ? (
+              ) : localRevealState.shouldAdvance ? (
                 <p className="mt-1.5 text-white/90 text-[clamp(1rem,2vw,1.7rem)] uppercase tracking-[0.05em]">
                   Advancing to next song...
                 </p>
@@ -424,7 +470,7 @@ export default function GuestDisplayPage() {
         </div>
         <div className="text-right">
           <p className="m-0 text-[clamp(0.85rem,1.4vw,1.2rem)] text-white/92">
-            Progress: {formatSeconds(runtime.currentTrack?.progressMs ?? 0)}
+            Progress: {formatSeconds(interpolatedProgress)}
           </p>
           <p className="m-0 text-[clamp(0.85rem,1.4vw,1.2rem)] text-white/92">
             Updated: {new Date(runtime.updatedAtMs).toLocaleTimeString()}
diff --git a/app/host/[sessionId]/page.tsx b/app/host/[sessionId]/page.tsx
index 98d8bfb..0492a36 100644
--- a/app/host/[sessionId]/page.tsx
+++ b/app/host/[sessionId]/page.tsx
@@ -328,16 +328,19 @@ export default function HostSessionControllerPage() {
 
         // --- Challenge song detection (uses resolved Set; falls back to text matching) ---
         // Intro takes precedence: when intro is playing, challenge is false.
+        // Always try both detection methods: ID-based first, then text-based fallback.
+        // This handles the case where the playlist loaded but a particular challenge
+        // song wasn't matched by the fuzzy ID resolution.
+        const detectChallenge = (t: typeof track): boolean => {
+          if (!t) return false;
+          if (challengeTrackIdsRef.current.has(t.trackId ?? "")) return true;
+          return matchesChallengeSong(t, game);
+        };
         const isChallengeSong = isIntroSong
           ? false
           : trackChanged
-            ? (challengeTrackIdsRef.current.size > 0
-                ? challengeTrackIdsRef.current.has(track?.trackId ?? "")
-                : matchesChallengeSong(track, game))
-            : (prev.isChallengeSong ||
-                (challengeTrackIdsRef.current.size > 0
-                  ? challengeTrackIdsRef.current.has(track?.trackId ?? "")
-                  : matchesChallengeSong(track, game)));
+            ? detectChallenge(track)
+            : (prev.isChallengeSong || detectChallenge(track));
         const baseCfg = isChallengeSong ? CHALLENGE_REVEAL_CONFIG : session.revealConfig;
         const extensionMs = trackChanged ? 0 : prev.extensionMs;
         const cfg = extensionMs > 0 ? { ...baseCfg, nextMs: baseCfg.nextMs + extensionMs } : baseCfg;
```

## Changed File Contents

### `app/guest/[sessionId]/page.tsx`

```
"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { subscribeLiveChannel } from "@/lib/live/channel";
import { getLiveSession } from "@/lib/live/sessionApi";
import { readRuntimeState, validateRuntimeState } from "@/lib/live/storage";
import {
  CHALLENGE_REVEAL_CONFIG,
  DEFAULT_REVEAL_CONFIG,
  makeEmptyRuntimeState,
  type LiveRuntimeState,
  type LiveSessionV1,
  type RevealConfig,
} from "@/lib/live/types";
import { computeRevealState } from "@/lib/live/reveal";
import { useWakeLock } from "@/hooks/useWakeLock";
import { BrandProvider } from "@/components/brand/BrandProvider";
import type { BrandConfig } from "@/lib/brands/types";

function formatSeconds(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
  return `${Math.floor(safeMs / 1000)}s`;
}

/**
 * Interpolates progressMs locally between server updates so the UI ticks
 * smoothly every second rather than jumping every 2s when a new poll arrives.
 * Stores the server-provided anchor point and a local tick counter.
 */
function useInterpolatedProgress(runtime: LiveRuntimeState): number {
  const serverProgress = runtime.currentTrack?.progressMs ?? 0;
  const isPlaying = runtime.currentTrack?.isPlaying ?? false;
  const trackId = runtime.currentTrack?.trackId ?? null;
  const updatedAt = runtime.updatedAtMs;

  // Anchor: the last known server state. Memoised so it only recalculates
  // when the server actually sends new data (trackId or updatedAt changes).
  const anchor = useMemo(
    () => ({ progress: serverProgress, updatedAt, trackId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updatedAt, trackId]
  );

  // Tick counter to drive re-renders every second
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick(0);
  }, [anchor]);

  useEffect(() => {
    if (!isPlaying || !trackId) return;
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isPlaying, trackId, anchor]);

  if (!isPlaying) return anchor.progress;
  return anchor.progress + tick * 1000;
}

export default function GuestDisplayPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = useMemo(
    () => (typeof params?.sessionId === "string" ? params.sessionId : ""),
    [params?.sessionId]
  );

  useWakeLock();

  const [session, setSession] = useState<LiveSessionV1 | null>(null);
  const [sessionLoading, setSessionLoading] = useState<boolean>(true);
  const sessionLoadedRef = useRef<boolean>(false);
  const [brand, setBrand] = useState<BrandConfig | null>(null);
  const error = useMemo(() => {
    if (!sessionId) return "Invalid guest session id.";
    if (!sessionLoading && !session)
      return "Live session not found. Open /host on this device and create or import a session first.";
    return "";
  }, [session, sessionId, sessionLoading]);

  const [runtime, setRuntime] = useState<LiveRuntimeState>(() => {
    if (!sessionId) return makeEmptyRuntimeState("pending");
    return readRuntimeState(sessionId) ?? makeEmptyRuntimeState(sessionId);
  });

  useEffect(() => {
    if (!sessionId || sessionLoadedRef.current) return;
    sessionLoadedRef.current = true;
    let cancelled = false;
    getLiveSession(sessionId)
      .then((loaded) => {
        if (!cancelled) {
          setSession(loaded);
          setSessionLoading(false);
          // Fetch the brand config from the full session API response
          if (loaded) {
            fetch(`/api/sessions/${encodeURIComponent(sessionId)}`)
              .then((res) => res.ok ? res.json() : null)
              .then((data) => { if (data?.brand && !cancelled) setBrand(data.brand); })
              .catch(() => {});
          }
        }
      })
      .catch(() => {
        if (!cancelled) setSessionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = subscribeLiveChannel(sessionId, (message) => {
      if (message.type === "runtime_update") {
        setRuntime(message.runtime);
      }
      if (message.type === "brand_update") {
        setBrand(message.brand);
      }
    });
    const id = window.setInterval(() => {
      const persisted = readRuntimeState(sessionId);
      if (persisted) setRuntime((prev) => persisted.updatedAtMs > prev.updatedAtMs ? persisted : prev);
    }, 2_000);
    return () => {
      unsubscribe();
      window.clearInterval(id);
    };
  }, [sessionId]);

  // Cross-device sync: poll server-side runtime state every 2s so guests on
  // a different device (e.g. laptop) receive updates from the host's phone.
  useEffect(() => {
    if (!sessionId) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/runtime`, { cache: "no-store" });
        if (res.ok) {
          const data: unknown = await res.json();
          const validated = validateRuntimeState(data);
          if (validated) setRuntime((prev) => validated.updatedAtMs > prev.updatedAtMs ? validated : prev);
        }
      } catch {
        // best-effort — local state remains until next successful poll
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 2_000);
    return () => window.clearInterval(id);
  }, [sessionId]);

  const interpolatedProgress = useInterpolatedProgress(runtime);

  if (sessionLoading) {
    return (
      <BrandProvider brand={brand}>
        <div className="guest-projection-shell min-h-screen w-screen text-white flex flex-col items-center justify-center p-8">
          <div className="bg-brand-green/80 border border-brand-gold/60 rounded-3xl p-8 max-w-lg text-center">
            <p className="text-white/80 text-lg animate-pulse">Loading session…</p>
          </div>
        </div>
      </BrandProvider>
    );
  }

  if (error) {
    return (
      <BrandProvider brand={brand}>
        <div className="guest-projection-shell min-h-screen w-screen text-white flex flex-col items-center justify-center p-8">
          <div className="bg-brand-green/80 border border-brand-gold/60 rounded-3xl p-8 max-w-lg text-center">
            <h1 className="text-2xl font-extrabold uppercase tracking-wide mb-4">
              Guest Display
            </h1>
            <p className="text-red-300 mb-6">{error}</p>
            <Link
              href="/host"
              className="inline-flex items-center justify-center bg-brand-gold text-white rounded-xl px-5 py-2.5 font-bold text-sm"
            >
              Open Host Dashboard
            </Link>
          </div>
        </div>
      </BrandProvider>
    );
  }

  const activeGame = runtime.activeGameNumber
    ? session?.games.find((game) => game.gameNumber === runtime.activeGameNumber) ?? null
    : null;

  const effectiveCfg: RevealConfig = runtime.isChallengeSong
    ? CHALLENGE_REVEAL_CONFIG
    : (session?.revealConfig ?? DEFAULT_REVEAL_CONFIG);

[truncated at line 200 — original has 483 lines]
```

### `app/host/[sessionId]/page.tsx`

```
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useWakeLock } from "@/hooks/useWakeLock";
import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { publishLiveMessage } from "@/lib/live/channel";
import { computeRevealState, shouldTriggerNextForTrack, updateAdvanceTrackMarker } from "@/lib/live/reveal";
import { getLiveSession } from "@/lib/live/sessionApi";
import {
  acquireControlLock,
  isControlLockStale,
  readControlLock,
  readRuntimeState,
  releaseControlLock,
  updateControlHeartbeat,
  writeRuntimeState,
} from "@/lib/live/storage";
import {
  CHALLENGE_REVEAL_CONFIG,
  DEFAULT_REVEAL_CONFIG,
  LIVE_RUNTIME_VERSION,
  getChallengeSongs,
  getIntroSongs,
  makeEmptyRuntimeState,
  type LiveGameConfig,
  type LiveRuntimeState,
  type LiveSessionV1,
  type LiveTrackSnapshot,
  type RevealConfig,
} from "@/lib/live/types";

/** True if the Spotify track matches any of the game's challenge songs (case-insensitive contains). */
function matchesChallengeSong(
  track: { title: string; artist: string } | null,
  game: LiveGameConfig | null | undefined
): boolean {
  if (!track || !game) return false;
  const songs = getChallengeSongs(game);
  if (songs.length === 0) return false;
  const norm = (s: string) => s.trim().toLowerCase();
  const t = norm(track.title);
  const a = norm(track.artist);
  return songs.some((cs) => {
    const ct = norm(cs.title);
    const ca = norm(cs.artist);
    return (t.includes(ct) || ct.includes(t)) && (a.includes(ca) || ca.includes(a));
  });
}

function getRevealConfig(
  session: LiveSessionV1,
  activeGameNumber: 1 | 2 | null,
  track: { title: string; artist: string } | null
): RevealConfig {
  const game = activeGameNumber
    ? session.games.find((g) => g.gameNumber === activeGameNumber) ?? null
    : null;
  return matchesChallengeSong(track, game) ? CHALLENGE_REVEAL_CONFIG : session.revealConfig;
}

type LiveStatusResponse = {
  connected?: boolean;
  canControlPlayback?: boolean;
  activeDevice?: {
    id?: string | null;
    name?: string;
    type?: string;
    isActive?: boolean;
    isRestricted?: boolean;
  } | null;
  playback?: {
    trackId?: string | null;
    title?: string;
    artist?: string;
    albumImageUrl?: string | null;
    progressMs?: number;
    durationMs?: number;
    isPlaying?: boolean;
  } | null;
  warnings?: unknown;
  error?: { code?: string; message?: string };
};

type LiveCommandResponse = LiveStatusResponse & {
  ok?: boolean;
  action?: string;
};

function makeTabId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `host-tab-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeWarnings(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => (typeof value === "string" && value.trim() ? value.trim() : null))
    .filter((value): value is string => Boolean(value));
}

function normalizeTrackSnapshot(
  playback: LiveStatusResponse["playback"]
): LiveTrackSnapshot | null {
  if (!playback || typeof playback !== "object") return null;
  return {
    trackId: typeof playback.trackId === "string" ? playback.trackId : null,
    title: typeof playback.title === "string" ? playback.title : "",
    artist: typeof playback.artist === "string" ? playback.artist : "",
    albumImageUrl:
      typeof playback.albumImageUrl === "string" ? playback.albumImageUrl : null,
    progressMs:
      typeof playback.progressMs === "number" && Number.isFinite(playback.progressMs)
        ? playback.progressMs
        : 0,
    durationMs:
      typeof playback.durationMs === "number" && Number.isFinite(playback.durationMs)
        ? playback.durationMs
        : 0,
    isPlaying: Boolean(playback.isPlaying),
  };
}

export default function HostSessionControllerPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = useMemo(
    () => (typeof params?.sessionId === "string" ? params.sessionId : ""),
    [params?.sessionId]
  );

  useWakeLock();

  const tabIdRef = useRef<string>(makeTabId());
  const runtimeRef = useRef<LiveRuntimeState>(makeEmptyRuntimeState(sessionId || "pending"));
  const pollAbortRef = useRef<AbortController | null>(null);
  // Circuit-breaker: stop polling after a 401 until the user reconnects Spotify.
  const spotifyDisconnectedRef = useRef<boolean>(false);
  // Throttle for cross-device runtime sync: push at most once per 2s.
  const lastRuntimePushMsRef = useRef<number>(0);

  const [session, setSession] = useState<LiveSessionV1 | null>(null);
  const [runtime, setRuntime] = useState<LiveRuntimeState>(
    makeEmptyRuntimeState(sessionId || "pending")
  );
  const [notice, setNotice] = useState<string>("");
  const [noticeVariant, setNoticeVariant] = useState<"success" | "warning">("success");
  const pollFailCountRef = useRef<number>(0);
  const [error, setError] = useState<string>("");
  const [isController, setIsController] = useState<boolean>(false);
  const [spotifyDisconnected, setSpotifyDisconnected] = useState<boolean>(false);
  const [lockOwnerLabel, setLockOwnerLabel] = useState<string>("");
  const [commandBusy, setCommandBusy] = useState<boolean>(false);
  const [playedTrackIds, setPlayedTrackIds] = useState<Set<string>>(new Set());
  const lastPlayedTrackIdRef = useRef<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<{ trackId: string; title: string; artist: string }[]>([]);
  const playlistTracksRef = useRef<{ trackId: string; title: string; artist: string }[]>([]);
  const loadedPlaylistIdRef = useRef<string | null>(null);
  // Guards against concurrent in-flight fetches for the same playlist.
  const fetchingPlaylistIdRef = useRef<string | null>(null);
  const [playlistLoadError, setPlaylistLoadError] = useState<boolean>(false);
  const [playlistRetryCount, setPlaylistRetryCount] = useState<number>(0);
  // Resolved Spotify track IDs for all challenge songs of the active game (exact match, no text guessing).
  const challengeTrackIdsRef = useRef<Set<string>>(new Set());
  // Resolved Spotify track ID for the intro song (first track in playlist when introSongArtist is set).
  const introTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  useEffect(() => {
    playlistTracksRef.current = playlistTracks;
  }, [playlistTracks]);

  // Track which song IDs have been played so far.
  // When the playlist is loaded, mark all tracks up to and including the current one
  // as played — this ensures resuming from a break shows the correct history.
  useEffect(() => {
    const track = runtime.currentTrack;
    if (!track?.trackId || track.trackId === lastPlayedTrackIdRef.current) return;
    lastPlayedTrackIdRef.current = track.trackId;
    const tracks = playlistTracksRef.current;
    const currentIndex = tracks.findIndex((t) => t.trackId === track.trackId);
    if (currentIndex >= 0) {
      // Mark every track up to the current one as played.
      const preceding = tracks.slice(0, currentIndex + 1).map((t) => t.trackId);
      setPlayedTrackIds((prev) => new Set([...prev, ...preceding]));
    } else {
      // Playlist not loaded yet or track not found — fall back to incremental add.
      setPlayedTrackIds((prev) => new Set([...prev, track.trackId!]));
    }
  }, [runtime.currentTrack]);

[truncated at line 200 — original has 1336 lines]
```

## Related Files (grep hints)

These files reference the basenames of changed files. They are hints for verification — not included inline. Read them only if a specific finding requires it.

```
ARCHITECTURE.md
IMPLEMENTATION_PLAN.md
PRD.md
app/api/generate/route.ts
app/api/spotify/playlist-tracks/[playlistId]/route.ts
app/prep/StepEventSetup.tsx
components/brand/BrandForm.tsx
components/brand/BrandProvider.tsx
docs/architecture/README.md
docs/architecture/relationships.md
```

## Project Conventions (`CLAUDE.md`)

```markdown
# CLAUDE.md — Music Bingo

This file provides project-specific guidance. See the workspace-level `CLAUDE.md` one directory up for shared conventions.

## Quick Profile

- **Framework**: Next.js 16, React 18.3
- **Test runners**: Playwright (E2E), Python pytest, Node (custom scripts)
- **Database**: Supabase (live sessions, persistent storage)
- **Key integrations**: Spotify Web API, Anchor Management API, PDF generation (pdf-lib), QR codes
- **Size**: ~23 files in lib/, 10+ routes, custom Python module
- **Novel aspects**: Dual test suite (JS + Python), localStorage-to-Supabase live session sync, multi-device gameplay

## Commands

```bash
npm run dev          # Start Next.js dev with custom localStorage script
npm run build        # Production build with custom script
npm run start        # Production server
npm run lint         # ESLint (zero warnings)
npm run typecheck    # TypeScript (no emit)
npm run test:e2e     # Playwright flows (scripts/e2e-flows.mjs)
npm run test:py      # Python pytest -q
npm run verify       # Full pipeline: lint → typecheck → test:py → test:e2e → build
```

## Architecture

**Routes & Pages**
- `/` — Home/landing
- `/host` — Game host view (prep + gameplay)
- `/guest/[sessionId]` — Guest player view
- `/api/sessions/*` — Live session management (Supabase Realtime)
- `/api/spotify/*` — Spotify OAuth + playlist creation
- `/api/generate/*` — PDF & DOCX export

**Key Patterns**
- **Live Sessions**: WebSocket-like via Supabase Realtime on `live_sessions` table; clients subscribe to session channel
- **Game State**: Hosted in localStorage (client) synced to Supabase; reveals (clues/answers) computed on-the-fly
- **PDF Generation**: Custom lib/pdf.ts using pdf-lib + Sharp for image rendering
- **Spotify Auth**: OAuth 2.0 callback → token stored server-side, used to create/populate playlists
- **Custom Scripts**:
  - `next-with-localstorage.mjs` wraps Next.js CLI to enable localStorage in Node/SSR
  - `e2e-flows.mjs` runs Playwright flows end-to-end

## Key Files

| Path | Purpose |
|------|---------|
| `lib/live/types.ts` | Session, game, card, reveal types |
| `lib/live/channel.ts` | Supabase Realtime subscription logic |
| `lib/live/sessionRepo.ts` | CRUD for `live_sessions` table |
| `lib/live/storage.ts` | localStorage ↔ Session object conversion |
| `lib/live/reveal.ts` | Clue/answer reveal computation |
| `lib/generator.ts` | Create bingo cards from tracks |
| `lib/pdf.ts` | PDF export (pdf-lib + Sharp) |
| `lib/spotifyWeb.ts` | Spotify OAuth & web API calls |
| `lib/spotifyLive.ts` | Live Spotify player control |
| `lib/supabase.ts` | Supabase client init (service-role for migrations) |
| `components/` | Game UI (host, guest, card display) |
| `app/api/sessions/` | Session CRUD endpoints |
| `app/api/spotify/` | OAuth callback, playlist creation |
| `app/api/generate/` | PDF/DOCX generation |
| `supabase/migrations/` | DB schema: `live_sessions`, `session_events` |

## Environment Variables

```
# Spotify OAuth (from developer.spotify.com)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
# Optional: override callback URI if default doesn't match Spotify app settings
SPOTIFY_WEB_REDIRECT_URI=http://localhost:3000/api/spotify/callback

# Supabase (required)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Optional: Anchor Management API (for next 3 events in PDF QR codes)
MANAGEMENT_API_BASE_URL=https://management.orangejelly.co.uk
MANAGEMENT_API_TOKEN=anch_your_api_key_here
```

## Project-Specific Rules / Gotchas

### localStorage in Node/SSR
Next.js doesn't provide localStorage natively on the server. The project works around this:
- `next-with-localstorage.mjs` monkeypatches `globalThis.localStorage` during builds and server runs
- All DB writes go through `lib/live/sessionRepo.ts` (Supabase client)
- Client components hydrate from session data passed as props

### Supabase Realtime Subscriptions
- Live sessions use `supabase.channel()` for real-time updates
- Clients subscribe on mount; unsubscribe on unmount to avoid connection leaks
- Message format defined in `lib/live/types.ts` — stay consistent

### Reveal Logic
- `lib/live/reveal.ts` computes clues on-the-fly from card + reveal index
- **Critical**: all clients must use the same seed/reveal algorithm for consistency
- Test with `npm run test:py` (Python implementation also available)

### PDF Export Path
- Uses Sharp + pdf-lib to render images + embed fonts
- Spotify metadata fetched at export time (may vary if playlist updated mid-game)
- QR codes generated via `qrcode` library; embed in PDF with dimensions ~50x50px

### Python Test Suite
- Located in `music_bingo/` (Python module)
- Tests game logic, reveal computation, PDF parsing
- Run with `npm run test:py`; requires Python 3.8+
- Useful for validating cross-language consistency

### Spotify Redirect URI Mismatch
- Common issue: localhost vs 127.0.0.1
- Spotify app settings must list **both** URIs if testing locally
- Production: ensure `SPOTIFY_WEB_REDIRECT_URI` matches your domain exactly

## Deployment Notes

- Build requires `SUPABASE_SERVICE_ROLE_KEY` (used during migration setup)
- Vercel: set all env vars in project settings
- DB migrations auto-run on first deploy (see `supabase/migrations/`)
- Playwright tests can run in CI via `test:e2e` (uses native browser locally; set `BROWSERLESS_URL` in CI)
```

---

_End of pack._
