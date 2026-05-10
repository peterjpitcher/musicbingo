# Review Pack: timing-60s-host-table

**Generated:** 2026-05-09
**Mode:** A (A=Adversarial / B=Code / C=Spec Compliance)
**Project root:** `/Users/peterpitcher/Cursor/OJ-MusicBingo/.claude/worktrees/quizzical-fermi-daf28c`
**Base ref:** `main`
**HEAD:** `49dd242`
**Diff range:** `main...HEAD`

> This pack is the sole input for reviewers. Do NOT read files outside it unless a specific finding requires verification. If a file not in the pack is needed, mark the finding `Needs verification` and describe what would resolve it.

## Changed Files

_(none detected for this diff range)_

## User Concerns

Changing song timing from 40s to 60s across default config, display text, and tests. Converting host dashboard from card grid to table. Need to verify no hardcoded timing values are missed and that existing sessions with stored 40s config still work correctly.

## Diff (`main...HEAD`)

_(no diff output)_

## Changed File Contents

_(no files to include)_
## Related Files (grep hints)

_(no related files found by basename grep)_

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

---

## Supplementary: Spec Under Review

This is a pre-implementation adversarial review. The spec below describes planned changes. Challenge the spec's completeness, correctness, and assumptions.


```markdown
# Spec: 60-Second Song Duration + Host Dashboard Table Layout

## Problem Statement

1. **Song duration too short** — songs currently auto-advance after 40 seconds (with reveals at 13s/27s/33s). Users want 60 seconds per song to give players more time.
2. **Host dashboard layout** — the `/host` page uses a card grid (`grid-cols-1 sm:grid-cols-2`) which doesn't scale well with multiple sessions. Needs converting to a table.

## Change 1: Song Duration 40s → 60s

### What changes

The `DEFAULT_REVEAL_CONFIG` in `lib/live/types.ts` controls all timing. Currently:

```
albumMs:  13,000  (album art appears at 13s)
titleMs:  27,000  (title appears at 27s)
artistMs: 33,000  (artist appears at 33s)
nextMs:   40,000  (auto-advance at 40s)
```

New timings (proportionally scaled to fill 60s, with more breathing room):

```
albumMs:  15,000  (album art at 15s)
titleMs:  30,000  (title at 30s)
artistMs: 40,000  (artist at 40s)
nextMs:   60,000  (auto-advance at 60s)
```

The `CHALLENGE_REVEAL_CONFIG` stays at 90s (`nextMs: 90_000`) — no change needed.

### Files to change

| File | Change | Line(s) |
|------|--------|---------|
| `lib/live/types.ts` | Update `DEFAULT_REVEAL_CONFIG` values | 13-18 |
| `lib/live/reveal.test.ts` | Update test thresholds to match new config | 11-21, 31-57, 61 |
| `app/host/[sessionId]/page.tsx` | Update hardcoded badge labels: `@10s`→`@15s`, `@20s`→`@30s`, `@25s`→`@40s` | 1052-1054 |
| `app/host/[sessionId]/page.tsx` | Update challenge song description: `90s instead of 40s` → `90s instead of 60s` | 1108 |
| `app/host/[sessionId]/page.tsx` | Update fallback `nextMs: 30_000` to `60_000` (2 places) | 1025, 1057 |
| `app/guest/[sessionId]/page.tsx` | Update placeholder text: `Album reveals at 10s` → `15s`, `Title reveals at 20s` → `30s`, `Artist reveals at 25s` → `40s` | 317, 330, 340 |
| `app/guest/[sessionId]/page.tsx` | Update "Next song at" calculation: `30_000` → `60_000` | 354 |

### What does NOT change
- `CHALLENGE_REVEAL_CONFIG` (stays 90s)
- `extensionMs` logic (+30s button, skip 30s) — these are relative increments, still valid
- Spotify playback control — no timing hardcoded there
- Python test suite — doesn't test reveal timing
- Database schema — `revealConfig` is stored per-session in JSONB; existing sessions keep their saved config

### Existing sessions
Existing saved sessions store their own `revealConfig` in the `data` JSONB blob. Those sessions will keep their 40s timing until re-created. The default only affects new sessions. This is correct behaviour — no migration needed.

## Change 2: Host Dashboard Cards → Table

### Current layout (`app/host/page.tsx`)
- Uses `<Card>` components in a `grid-cols-1 sm:grid-cols-2` grid
- Each card shows: name, event date, created date, brand ID, game badges, action buttons, optional brand selector
- With many sessions, cards create a long scrolling page and waste horizontal space

### New layout
Replace the card grid with a responsive table:

| Column | Content |
|--------|---------|
| Name | Session name (bold, linked to host controller) |
| Event Date | `eventDateDisplay` |
| Games | Game badges inline (Game 1: Theme, Game 2: Theme) |
| Brand | Brand selector dropdown (inline, no toggle needed) |
| Actions | Re-download, Delete buttons |

### Design decisions
- **Responsive**: On mobile (`< md`), fall back to a stacked card-like layout per row using CSS
- **Link the name**: Session name links directly to `/host/[sessionId]` — removes the need for a separate "Open Host Controller" button
- **Inline brand selector**: Always visible as a dropdown in the Brand column — removes the "Change Brand" toggle
- **Slim actions**: Only "Re-download" and "Delete" remain as explicit buttons
- **Table wrapper**: Use `overflow-x-auto` for horizontal scroll on narrow screens
- **Consistent styling**: Use the existing `text-slate-*` colour palette, no new design tokens

### Files to change

| File | Change |
|------|--------|
| `app/host/page.tsx` | Replace card grid (lines 279-357) with table markup |

### What does NOT change
- All existing functionality (import, delete, re-download, brand change)
- `AppHeader` and action buttons in the header
- Loading/empty/error states (just re-styled for table context)
- No new components needed — plain HTML `<table>` with Tailwind

## Complexity Score

**Score: 2 (S)** — 5 files touched, no schema changes, no new dependencies, straightforward find-and-replace for timing, layout swap for table.

## Testing Plan

- [ ] Update `lib/live/reveal.test.ts` with new thresholds — run `npm test`
- [ ] Verify host controller badges show correct times
- [ ] Verify guest display placeholder text shows correct times
- [ ] Verify "Next song at" countdown uses 60s baseline
- [ ] Verify challenge song still shows 90s
- [ ] Verify +30s extension still works correctly
- [ ] Verify host dashboard table renders correctly with 0, 1, and multiple sessions
- [ ] Verify brand selector works inline in table
- [ ] Verify delete and re-download work from table actions
- [ ] Run full verification pipeline: `npm run verify`
```

## Key Source Files

### `lib/live/types.ts`
```typescript
export const LIVE_SESSION_VERSION = "music-bingo-live-session-v1" as const;
export const LIVE_RUNTIME_VERSION = "music-bingo-live-runtime-v1" as const;

export type LiveMode = "idle" | "running" | "paused" | "break" | "ended";

export type RevealConfig = {
  albumMs: number;
  titleMs: number;
  artistMs: number;
  nextMs: number;
};

export const DEFAULT_REVEAL_CONFIG: RevealConfig = {
  albumMs: 13_000,
  titleMs: 27_000,
  artistMs: 33_000,
  nextMs: 40_000,
};

/** Challenge songs play for 90 seconds instead of 40. */
export const CHALLENGE_REVEAL_CONFIG: RevealConfig = {
  albumMs: 10_000,
  titleMs: 20_000,
  artistMs: 25_000,
  nextMs: 90_000,
};

export type LiveGameConfig = {
  gameNumber: 1 | 2;
  theme: string;
  playlistId: string;
  playlistName: string;
  playlistUrl: string | null;
  totalSongs: number;
  addedCount: number;
  /** Artist of the challenge song for this game (user-entered, may be "" for legacy sessions). */
  challengeSongArtist: string;
  /** Title of the challenge song for this game (user-entered, may be "" for legacy sessions). */
  challengeSongTitle: string;
};

/** Raw prep-screen inputs stored so the event pack ZIP can be re-generated from the host dashboard. */
export type PrepData = {
  game1SongsText: string;
  game2SongsText: string;
  game1Theme: string;
  game2Theme: string;
  game1ChallengeSong: string;
  game2ChallengeSong: string;
  cardCount: number;
};

export type LiveSessionV1 = {
  version: typeof LIVE_SESSION_VERSION;
  id: string;
  name: string;
  createdAt: string;
  eventDateInput: string;
  eventDateDisplay: string;
  games: [LiveGameConfig, LiveGameConfig] | LiveGameConfig[];
  revealConfig: RevealConfig;
  /** Spotify playlist URL/ID to play during breaks. Empty string = manual host control. */
  breakPlaylistId: string;
  /** Raw prep inputs for re-generating the event pack ZIP without revisiting the prep screen. */
  prepData?: PrepData;
  /** Brand ID for venue theming. Null = use default brand. */
  brandId?: string;
};

export type LiveTrackSnapshot = {
  trackId: string | null;
  title: string;
  artist: string;
  albumImageUrl: string | null;
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
};

export type LiveRevealState = {
  showAlbum: boolean;
  showTitle: boolean;
  showArtist: boolean;
  shouldAdvance: boolean;
};

export type LiveRuntimeState = {
  version: typeof LIVE_RUNTIME_VERSION;
  sessionId: string;
  mode: LiveMode;
  activeGameNumber: 1 | 2 | null;
  spotifyControlAvailable: boolean;
  currentTrack: LiveTrackSnapshot | null;
  revealState: LiveRevealState;
  advanceTriggeredForTrackId: string | null;
  warningMessage: string | null;
  /** True when the currently playing track is the challenge song for the active game. */
  isChallengeSong: boolean;
  /** Track ID stored before going to break, so resume can restart it from the beginning. */
  preBreakTrackId: string | null;
  /** Playlist ID stored before going to break, so resume can restart in the right context. */
  preBreakPlaylistId: string | null;
  /** Extra ms added to the auto-advance threshold via the +30s button. Resets to 0 on track change. */
  extensionMs: number;
  /** When true, auto-advance is disabled and songs play in full (free play / post-round mode). */
  freePlay: boolean;
  updatedAtMs: number;
};

export type LiveControlLock = {
  tabId: string;
  lastSeenMs: number;
};

export type LiveChannelMessage =
  | {
    type: "runtime_update";
    runtime: LiveRuntimeState;
  }
  | {
    type: "host_heartbeat";
    hostId: string;
    timestampMs: number;
  }
  | {
    type: "warning";
    message: string;
    timestampMs: number;
  }
  | {
    type: "brand_update";
    brand: import("@/lib/brands/types").BrandConfig;
  };

export function makeEmptyRuntimeState(sessionId: string): LiveRuntimeState {
  return {
    version: LIVE_RUNTIME_VERSION,
    sessionId,
    mode: "idle",
    activeGameNumber: null,
    spotifyControlAvailable: true,
    currentTrack: null,
    revealState: {
      showAlbum: false,
      showTitle: false,
      showArtist: false,
      shouldAdvance: false,
    },
    advanceTriggeredForTrackId: null,
    warningMessage: null,
    isChallengeSong: false,
    preBreakTrackId: null,
    preBreakPlaylistId: null,
    extensionMs: 0,
    freePlay: false,
    updatedAtMs: Date.now(),
  };
}
```

### `lib/live/reveal.ts`
```typescript
import { DEFAULT_REVEAL_CONFIG, type LiveRevealState, type RevealConfig } from "@/lib/live/types";

export type RevealPhase = "hidden" | "album" | "title" | "artist" | "advance";

function sanitizeProgressMs(progressMs: number): number {
  if (!Number.isFinite(progressMs)) return 0;
  return Math.max(0, Math.floor(progressMs));
}

export function getRevealPhase(progressMs: number, cfg: RevealConfig = DEFAULT_REVEAL_CONFIG): RevealPhase {
  const ms = sanitizeProgressMs(progressMs);
  if (ms >= cfg.nextMs) return "advance";
  if (ms >= cfg.artistMs) return "artist";
  if (ms >= cfg.titleMs) return "title";
  if (ms >= cfg.albumMs) return "album";
  return "hidden";
}

export function computeRevealState(progressMs: number, cfg: RevealConfig = DEFAULT_REVEAL_CONFIG): LiveRevealState {
  const phase = getRevealPhase(progressMs, cfg);
  return {
    showAlbum: phase === "album" || phase === "title" || phase === "artist" || phase === "advance",
    showTitle: phase === "title" || phase === "artist" || phase === "advance",
    showArtist: phase === "artist" || phase === "advance",
    shouldAdvance: phase === "advance",
  };
}

export function shouldTriggerNextForTrack(params: {
  trackId: string | null;
  revealState: LiveRevealState;
  advanceTriggeredForTrackId: string | null;
}): boolean {
  const { trackId, revealState, advanceTriggeredForTrackId } = params;
  if (!trackId || !revealState.shouldAdvance) return false;
  return advanceTriggeredForTrackId !== trackId;
}

export function updateAdvanceTrackMarker(params: {
  trackId: string | null;
  advanceTriggeredForTrackId: string | null;
}): string | null {
  const { trackId, advanceTriggeredForTrackId } = params;
  if (!trackId) return null;
  if (!advanceTriggeredForTrackId) return null;
  return advanceTriggeredForTrackId === trackId ? advanceTriggeredForTrackId : null;
}
```

### `lib/live/reveal.test.ts`
```typescript
import assert from "node:assert/strict";
import test from "node:test";

import {
  computeRevealState,
  getRevealPhase,
  shouldTriggerNextForTrack,
  updateAdvanceTrackMarker,
} from "@/lib/live/reveal";

test("getRevealPhase follows 13s/27s/33s/40s thresholds", () => {
  assert.equal(getRevealPhase(0), "hidden");
  assert.equal(getRevealPhase(12_999), "hidden");
  assert.equal(getRevealPhase(13_000), "album");
  assert.equal(getRevealPhase(26_999), "album");
  assert.equal(getRevealPhase(27_000), "title");
  assert.equal(getRevealPhase(32_999), "title");
  assert.equal(getRevealPhase(33_000), "artist");
  assert.equal(getRevealPhase(39_999), "artist");
  assert.equal(getRevealPhase(40_000), "advance");
});

test("computeRevealState maps phases to reveal booleans", () => {
  assert.deepEqual(computeRevealState(0), {
    showAlbum: false,
    showTitle: false,
    showArtist: false,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(13_000), {
    showAlbum: true,
    showTitle: false,
    showArtist: false,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(27_000), {
    showAlbum: true,
    showTitle: true,
    showArtist: false,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(33_000), {
    showAlbum: true,
    showTitle: true,
    showArtist: true,
    shouldAdvance: false,
  });

  assert.deepEqual(computeRevealState(40_000), {
    showAlbum: true,
    showTitle: true,
    showArtist: true,
    shouldAdvance: true,
  });
});

test("shouldTriggerNextForTrack fires once per track", () => {
  const reveal = computeRevealState(40_000);
  assert.equal(
    shouldTriggerNextForTrack({
      trackId: "abc",
      revealState: reveal,
      advanceTriggeredForTrackId: null,
    }),
    true
  );

  assert.equal(
    shouldTriggerNextForTrack({
      trackId: "abc",
      revealState: reveal,
      advanceTriggeredForTrackId: "abc",
    }),
    false
  );
});

test("updateAdvanceTrackMarker clears marker when track changes", () => {
  assert.equal(updateAdvanceTrackMarker({ trackId: "abc", advanceTriggeredForTrackId: "abc" }), "abc");
  assert.equal(updateAdvanceTrackMarker({ trackId: "xyz", advanceTriggeredForTrackId: "abc" }), null);
  assert.equal(updateAdvanceTrackMarker({ trackId: null, advanceTriggeredForTrackId: "abc" }), null);
});
```

### `app/host/page.tsx`
```typescript
"use client";

import { useEffect, useState } from "react";

import { BrandSelector } from "@/components/brand/BrandSelector";
import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import {
  deleteLiveSession,
  importLiveSessionJson,
  listLiveSessions,
} from "@/lib/live/sessionApi";
import { migrateLocalSessionsToSupabase } from "@/lib/live/migrateToSupabase";
import type { LiveSessionV1 } from "@/lib/live/types";


function downloadBlob(blob: Blob, filename: string): void {
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
  const [downloading, setDownloading] = useState<string | null>(null);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);
  const [changingBrand, setChangingBrand] = useState<string | null>(null);

  async function refreshSessions() {
    setError("");
    try {
      const loaded = await listLiveSessions();
      setSessions(loaded);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load sessions.";
      setError(msg);
    }
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
      fetch("/api/spotify/status", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setSpotifyConnected(Boolean(data?.connected)))
        .catch(() => {});
    }
    void init();
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

  async function connectSpotify(): Promise<boolean> {
    try {
      const callbackUrl = `${window.location.origin}/api/spotify/callback`;
      const w = window.open("/api/spotify/authorize", "spotify_auth", "popup,width=520,height=720");
      if (!w) throw new Error("Popup blocked. Please allow popups for this site and try again.");

      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          window.removeEventListener("message", onMessage);
          window.clearInterval(timer);
        };
        const onMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          const data = event.data as any;
          if (!data || typeof data !== "object" || data.type !== "spotify-auth") return;
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
                  + "If you saw \"INVALID_CLIENT: Invalid redirect URI\", add this Redirect URI in your Spotify app settings:\n"
                  + `  ${callbackUrl}`
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
    }
  }

  async function fetchPlaylistSongsText(playlistId: string): Promise<string> {
    const res = await fetch(`/api/spotify/playlist/${encodeURIComponent(playlistId)}/tracks`, { cache: "no-store" });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `Failed to fetch playlist tracks (HTTP ${res.status}). Make sure Spotify is connected.`);
    }
    const data = await res.json();
    const tracks = data?.tracks as Array<{ artist: string; title: string }> | undefined;
    if (!tracks?.length) throw new Error("Playlist returned no tracks.");
    return tracks.map((t) => `${t.artist} - ${t.title}`).join("\n");
  }

  async function onRedownload(session: LiveSessionV1) {
    setDownloading(session.id);
    setError("");
    try {
      const game1 = session.games.find((g) => g.gameNumber === 1);
      const game2 = session.games.find((g) => g.gameNumber === 2);
      if (!game1?.playlistId || !game2?.playlistId) {
        throw new Error("Session is missing playlist IDs. Re-create from the prep screen.");
      }

      const form = new FormData();
      form.set("event_date", session.eventDateInput);
      form.set("game1_playlist_id", game1.playlistId);
      form.set("game2_playlist_id", game2.playlistId);
      if (session.brandId) {
        form.set("brand_id", session.brandId);
      }

      if (session.prepData) {
        // Use stored prep data directly — no Spotify connection needed
        form.set("count", String(session.prepData.cardCount));
        form.set("game1_theme", session.prepData.game1Theme);
        form.set("game2_theme", session.prepData.game2Theme);
        form.set("game1_songs", session.prepData.game1SongsText);
        form.set("game2_songs", session.prepData.game2SongsText);
        form.set("game1_challenge_song", session.prepData.game1ChallengeSong);
        form.set("game2_challenge_song", session.prepData.game2ChallengeSong);
      } else {
        // Reconstruct from Spotify playlists — connect first if needed
        if (!spotifyConnected) {
          const ok = await connectSpotify();
          if (!ok) throw new Error("Spotify connection required to fetch playlist tracks for older sessions.");
        }
        const [game1Songs, game2Songs] = await Promise.all([
          fetchPlaylistSongsText(game1.playlistId),
          fetchPlaylistSongsText(game2.playlistId),
        ]);
        form.set("count", "40");
        form.set("game1_theme", game1.theme);
        form.set("game2_theme", game2.theme);
        form.set("game1_songs", game1Songs);
        form.set("game2_songs", game2Songs);
        form.set("game1_challenge_song", `${game1.challengeSongArtist}|||${game1.challengeSongTitle}`);
        form.set("game2_challenge_song", `${game2.challengeSongArtist}|||${game2.challengeSongTitle}`);
      }

      const res = await fetch("/api/generate", { method: "POST", body: form });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to generate event pack.");
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ??
        "music-bingo-event-pack.zip";
      downloadBlob(blob, filename);
      setNotice(`Downloaded event pack for: ${session.name}`);
    } catch (err: any) {
      setNotice("");
      setError(err?.message ?? "Failed to download event pack.");
    } finally {
      setDownloading(null);
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
            <Button as="link" href="/brands" variant="secondary" size="sm">
              Manage Brands
            </Button>
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
                <p className="text-xs text-slate-500 mb-0.5">
                  Created: {new Date(session.createdAt).toLocaleString()}
                </p>
                {session.brandId ? (
                  <p className="text-xs text-slate-500 mb-3">
                    Brand: {session.brandId.slice(0, 8)}…
                  </p>
                ) : (
                  <div className="mb-3" />
                )}
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
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={downloading === session.id}
                    onClick={() => void onRedownload(session)}
                  >
                    {downloading === session.id ? "Generating..." : "Re-download Event Pack"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setChangingBrand(changingBrand === session.id ? null : session.id)}
                  >
                    Change Brand
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void onDelete(session)}
                  >
                    Delete
                  </Button>
                </div>
                {changingBrand === session.id ? (
                  <div className="mt-2 w-full">
                    <BrandSelector
                      value={session.brandId ?? null}
                      onChange={async (brandId) => {
                        try {
                          const res = await fetch(`/api/sessions/${session.id}/brand`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ brand_id: brandId }),
                          });
                          if (!res.ok) throw new Error("Failed to update brand");
                          await refreshSessions();
                          setChangingBrand(null);
                          setNotice(`Updated brand for: ${session.name}`);
                        } catch (err: any) {
                          setError(err?.message ?? "Failed to update brand.");
                        }
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    />
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

### `app/guest/[sessionId]/page.tsx`
```typescript
"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { subscribeLiveChannel } from "@/lib/live/channel";
import { getLiveSession } from "@/lib/live/sessionApi";
import { readRuntimeState, validateRuntimeState } from "@/lib/live/storage";
import {
  makeEmptyRuntimeState,
  type LiveRuntimeState,
  type LiveSessionV1,
} from "@/lib/live/types";
import { useWakeLock } from "@/hooks/useWakeLock";
import { BrandProvider } from "@/components/brand/BrandProvider";
import type { BrandConfig } from "@/lib/brands/types";

function formatSeconds(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
  return `${Math.floor(safeMs / 1000)}s`;
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
  // Derive the guest URL once on mount (window is always available in client components).
  const guestUrl = useMemo(
    () => (sessionId && typeof window !== "undefined" ? `${window.location.origin}/guest/${sessionId}` : ""),
    [sessionId]
  );

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

  const showWaiting =
    runtime.mode === "idle" || (!runtime.currentTrack && runtime.mode === "running");
  const showBreak = runtime.mode === "break";
  const showPaused = runtime.mode === "paused";
  const showEnded = runtime.mode === "ended";
  const showRunning = runtime.mode === "running" && Boolean(runtime.currentTrack);

  return (
    <BrandProvider brand={brand}>
    <div className="guest-projection-shell min-h-screen w-screen text-white flex flex-col overflow-x-hidden">
      {/* Header */}
      <header className="flex items-center justify-between gap-5 px-6 py-4 border-b border-brand-gold/50 bg-brand-green/90 backdrop-blur-sm">
        <div className="flex items-center gap-3.5">
          <img
            src={brand?.logo_dark_url ?? "/the-anchor-pub-logo-white-transparent.png"}
            alt={brand?.name ?? "Logo"}
            width={140}
            height={44}
            className="max-h-11 w-auto object-contain"
          />
          <div>
            <h1 className="m-0 text-xl font-extrabold uppercase tracking-wide text-white leading-tight">
              {session?.name ?? "Music Bingo"}
            </h1>
            <p className="m-0 mt-0.5 text-xs uppercase tracking-widest text-white/70">
              Guest Display
            </p>
          </div>
        </div>
        {!runtime.spotifyControlAvailable ? (
          <div className="rounded-xl bg-amber-800/50 border border-amber-400/60 px-3 py-1.5 text-xs font-semibold text-amber-200">
            Manual host control mode
          </div>
        ) : null}
      </header>

      {/* Main stage */}
      <section className="flex-1 flex items-center justify-center p-7">
        {showWaiting ? (
          <div className="w-[min(980px,95vw)] bg-brand-green/88 border border-brand-gold/70 rounded-3xl p-8 text-center">
            <p className="uppercase tracking-[0.18em] text-white/84 text-[clamp(0.7rem,1.4vw,1.1rem)] m-0">
              Music Bingo Night
            </p>
            <h2 className="mt-2.5 mb-2 uppercase text-[clamp(2rem,6vw,5rem)] font-black text-white">
              Waiting To Start
            </h2>
            <p className="m-0 text-[clamp(1rem,2vw,1.6rem)] text-white/90">
              The host will start Game 1 or Game 2 shortly.
            </p>
            {guestUrl ? (
              <div className="mt-6 flex flex-col items-center gap-3">
                <p className="text-white/70 uppercase tracking-widest text-[clamp(0.65rem,1.2vw,0.9rem)]">
                  Follow along on your phone
                </p>
                <div className="bg-white p-3 rounded-2xl inline-block shadow-lg">
                  <QRCodeSVG
                    value={guestUrl}
                    size={160}
                    level="H"
                    fgColor={brand?.color_primary ?? "#003f27"}
                    bgColor="#ffffff"
                    aria-label={`QR code to join Music Bingo session at ${guestUrl}`}
                  />
                </div>
                <p className="text-white/65 text-[clamp(0.6rem,1vw,0.8rem)] break-all max-w-xs">
                  {guestUrl}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {showBreak ? (
          <div className="w-[min(980px,95vw)] bg-brand-green/88 border border-brand-gold/70 rounded-3xl p-8 text-center">
            <p className="uppercase tracking-[0.18em] text-white/84 text-[clamp(0.7rem,1.4vw,1.1rem)] m-0">
              Break
            </p>
            <h2 className="mt-2.5 mb-2 uppercase text-[clamp(2rem,6vw,5rem)] font-black text-white">
              Interval In Progress
            </h2>
            <p className="m-0 text-[clamp(1rem,2vw,1.6rem)] text-white/90">
              Keep your cards ready — we&apos;ll resume shortly.
            </p>
            {brand?.break_message ? (
              <p className="mt-4 text-[clamp(1rem,2vw,1.5rem)] text-brand-gold font-semibold">
                {brand.break_message}
              </p>
            ) : null}
          </div>
        ) : null}

        {showPaused ? (
          <div className="w-[min(980px,95vw)] bg-brand-green/88 border border-brand-gold/70 rounded-3xl p-8 text-center">
            <p className="uppercase tracking-[0.18em] text-white/84 text-[clamp(0.7rem,1.4vw,1.1rem)] m-0">
              Paused
            </p>
            <h2 className="mt-2.5 mb-2 uppercase text-[clamp(2rem,6vw,5rem)] font-black text-white">
              Playback Paused
            </h2>
            <p className="m-0 text-[clamp(1rem,2vw,1.6rem)] text-white/90">
              Host is paused. We&apos;ll continue in a moment.
            </p>
          </div>
        ) : null}

        {showEnded ? (
          <div className="w-[min(980px,95vw)] bg-brand-green/88 border border-brand-gold/70 rounded-3xl p-8 text-center">
            <p className="uppercase tracking-[0.18em] text-white/84 text-[clamp(0.7rem,1.4vw,1.1rem)] m-0">
              That&apos;s A Wrap!
            </p>
            <h2 className="mt-2.5 mb-2 uppercase text-[clamp(2rem,6vw,5rem)] font-black text-white">
              Thanks For Playing
            </h2>
            <p className="m-0 text-[clamp(1rem,2vw,1.6rem)] text-white/90">
              We hope you had a great time!
            </p>
            {brand?.end_message ? (
              <div className="mt-6">
                <p className="text-[clamp(1rem,2vw,1.5rem)] text-brand-gold font-semibold">
                  {brand.end_message}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {showRunning && runtime.currentTrack ? (
          <div className="w-[min(1400px,96vw)] flex flex-col gap-5">
            {/* Challenge banner */}
            {runtime.isChallengeSong ? (
              <div className="w-full bg-brand-gold/90 border-2 border-white/60 rounded-2xl py-4 px-6 text-center">
                <p className="m-0 uppercase tracking-[0.2em] text-white/80 text-[clamp(0.65rem,1.2vw,0.9rem)]">
                  {activeGame?.gameNumber === 1 ? "Dancing Challenge" : "Sing-Along Challenge"}
                </p>
                <h2 className="m-0 mt-1 uppercase font-black text-white text-[clamp(1.6rem,4vw,3.5rem)] leading-none tracking-wide">
                  {activeGame?.gameNumber === 1 ? "Get Up and Dance!" : "Sing Along!"}
                </h2>
              </div>
            ) : null}
          <div className="grid grid-cols-1 lg:[grid-template-columns:minmax(260px,560px)_minmax(0,1fr)] gap-7 items-center">
            {/* Album art */}
            <div className="flex items-center justify-center">
              {(runtime.freePlay || runtime.revealState.showAlbum) ? (
                runtime.currentTrack.albumImageUrl ? (
                  <img
                    src={runtime.currentTrack.albumImageUrl}
                    alt="Album cover"
                    className="w-[min(68vh,88vw)] max-w-[560px] aspect-square rounded-[22px] border-4 border-white/90 shadow-2xl object-cover bg-black"
                  />
                ) : (
                  <div className="w-[min(68vh,88vw)] max-w-[560px] aspect-square rounded-[22px] border-4 border-white/90 flex items-center justify-center text-[clamp(1rem,2vw,1.7rem)] uppercase tracking-[0.08em] bg-brand-green/72">
                    Album Cover
                  </div>
                )
              ) : (
                <div className="w-[min(68vh,88vw)] max-w-[560px] aspect-square rounded-[22px] border-4 border-dashed border-white/50 flex items-center justify-center text-[clamp(1rem,2vw,1.7rem)] uppercase tracking-[0.08em] bg-brand-green/72 opacity-50">
                  Album reveals at 10s
                </div>
              )}
            </div>

            {/* Track metadata */}
            <div className="grid gap-3.5 lg:text-left text-center">
              {(runtime.freePlay || runtime.revealState.showTitle) ? (
                <h2 className="m-0 text-[clamp(1.6rem,4.5vw,4.2rem)] uppercase font-black tracking-wide text-white">
                  {runtime.currentTrack.title || "Unknown Title"}
                </h2>
              ) : (
                <h2 className="m-0 text-[clamp(1.6rem,4.5vw,4.2rem)] uppercase font-black tracking-wide text-white/75">
                  Title reveals at 20s
                </h2>
              )}

              {(runtime.freePlay || runtime.revealState.showArtist) ? (
                <p className="m-0 text-[clamp(1.3rem,3vw,2.8rem)] font-bold text-white">
                  {runtime.currentTrack.artist || "Unknown Artist"}
                </p>
              ) : (
                <p className="m-0 text-[clamp(1.3rem,3vw,2.8rem)] font-bold text-white/75">
                  Artist reveals at 25s
                </p>
              )}

              {runtime.freePlay ? (
                <p className="mt-1.5 text-white/70 text-[clamp(1rem,2vw,1.7rem)] uppercase tracking-[0.05em]">
                  Free Play
                </p>
              ) : runtime.revealState.shouldAdvance ? (
                <p className="mt-1.5 text-white/90 text-[clamp(1rem,2vw,1.7rem)] uppercase tracking-[0.05em]">
                  Advancing to next song...
                </p>
              ) : (
                <p className="mt-1.5 text-white/90 text-[clamp(1rem,2vw,1.7rem)] uppercase tracking-[0.05em]">
                  Next song at {Math.floor(((runtime.isChallengeSong ? 90_000 : 30_000) + runtime.extensionMs) / 1000)}s
                </p>
              )}
            </div>
          </div>
          </div>
        ) : null}
      </section>

      {/* Footer */}
      <footer className="flex justify-between items-center gap-4 px-6 py-4 border-t border-brand-green-light/60 bg-brand-green/94">
        <div>
          <p className="m-0 text-[clamp(0.85rem,1.4vw,1.2rem)] text-white/92">
            Mode: {runtime.mode.toUpperCase()}
          </p>
          <p className="m-0 text-[clamp(0.85rem,1.4vw,1.2rem)] text-white/92">
            Active:{" "}
            {runtime.activeGameNumber
              ? `Game ${runtime.activeGameNumber}${activeGame ? ` — ${activeGame.theme}` : ""}`
              : "Not started"}
          </p>
        </div>
        <div className="text-right">
          <p className="m-0 text-[clamp(0.85rem,1.4vw,1.2rem)] text-white/92">
            Progress: {formatSeconds(runtime.currentTrack?.progressMs ?? 0)}
          </p>
          <p className="m-0 text-[clamp(0.85rem,1.4vw,1.2rem)] text-white/92">
            Updated: {new Date(runtime.updatedAtMs).toLocaleTimeString()}
          </p>
        </div>
      </footer>
    </div>
    </BrandProvider>
  );
}
```

