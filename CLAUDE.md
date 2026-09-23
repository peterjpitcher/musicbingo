# CLAUDE.md: Music Bingo

Workspace standards live in `/Users/peterpitcher/Cursor/CLAUDE.md`. Read that first; nothing in it is repeated here. `AGENTS.md` is a relative symlink to this file, so Claude Code, Codex and Cursor read the same rules.

## What this is

A single-operator internal tool for running Music Bingo nights at The Anchor and other brands. The prep wizard turns two song lists into an event pack (card PDFs, run sheet, DOCX host clipboard) and two private Spotify playlists; the host controller at `/host/[sessionId]` then drives a private TV display at `/display/[sessionId]` through a fixed run of show. Players use printed cards; there is no per-player screen. Production: `https://music-bingo.vercel.app`.

## Stack, where it differs from the workspace default

- **Next.js 16.1.3** (not 15), **React 18.3** (not 19), TypeScript 5.5, no middleware. Node 20.9 or later.
- **Tailwind 3.4** with `tailwind.config.ts`; brand colours are runtime CSS variables exposed as `brand-primary`, `brand-accent`, `ink`, `cream`.
- **No user auth, no Supabase Auth, no server actions.** Every route uses the service-role client (`lib/supabase.ts`); mutations are API route handlers; RLS is on with `anon` and `authenticated` revoked. The workspace auth, RLS-policy and audit-log rules do not apply; the admin secret gates access (below).
- Tests: **Vitest**, **Playwright** flows (`scripts/e2e-flows.mjs`) and **pytest** for the legacy Python module; not Jest. ESLint 9 flat config, `no-explicit-any` off.

## Commands

```bash
npm run dev | build | start   # via scripts/next-with-localstorage.mjs
npm run lint                  # eslint . --max-warnings=0
npm run typecheck
npm run test:unit             # vitest run
npm run test:py               # python3 -m pytest -q (Python 3.11+)
npm run test:e2e              # Playwright; boots its own server on 127.0.0.1:3100
npm run verify                # lint, typecheck, test:unit, test:py, test:e2e, build
```

- The wrapper passes `--localstorage-file=.next/node-localstorage.json` via `NODE_OPTIONS` so Node's Web Storage API works server-side. Use the npm scripts, not `npx next`.
- E2E mocks Spotify and the app's own APIs, so it needs no credentials, only Chromium (`npx playwright install chromium`).
- `music_bingo/` and `tests/*.py` are the original offline Python generator (5x5 cards), unused by the web app but still run by `verify`.

## Architecture

```
app/prep                 Prep wizard
app/host, app/host/[id]  Dashboard and live controller
app/display/[id]         Private TV display
app/brands, app/admin    Brand management, admin unlock
app/guest/[id]           Retired stub
app/api/*                sessions, display, spotify, brands, generate, admin/unlock
lib/live/                Runtime types, reveal, run of show, repo, sync, access
supabase/migrations/     Applied with npx supabase db push; nothing runs them at deploy
```

### Data and sync model

- Tables: `live_sessions` (`data` and `runtime_data` JSONB, validated in app only), `session_runtime_snapshots` (latest host runtime), `session_events` (append-only; `runtime_snapshot` rows about every 2 seconds while the host holds the control lock; pg_cron keeps 90 days) and `brands`. Storage bucket `brand-assets`.
- **Sync is not Supabase Realtime.** The host `PUT`s runtime to `/api/sessions/[id]/runtime`; failed writes queue in localStorage (`lib/live/runtimeSync.ts`) and retry every 5 seconds. The display polls `/api/display/[id]/snapshot` every 1.5 seconds while running (5 idle). Same-device tabs share a `BroadcastChannel`. The control lock goes stale after 15 seconds; newest wins by `updatedAtMs`.
- Supabase is the source of truth; localStorage holds only prep drafts, the retry queue, the control lock and legacy saved sessions.

### Access model

- `APP_ADMIN_SECRET` turns protection on; in production it is always on and a deploy without it fails closed. Unlocking at `/admin` sets the `music_bingo_admin` cookie (400 days). Host and display links carry signed tokens that set a per-session role cookie for 14 days.
- An empty games list in production almost always means the admin cookie lapsed or the secret changed, not lost data: probe `GET /api/sessions` for a 401 before touching Supabase. `lib/live/adminGuard.ts` redirects to `/admin` on 401; let that error propagate rather than falling back to cached data.

## Game and show rules

- Input: one list per game, `Artist – Title` (en dash preferred; spaced hyphen or em dash also parse), decade headers ignored, max 50 songs per game, at least 25 unique pool items.
- Cards: 3 rows by 6 columns, one blank per row, drawn from a combined artists-and-titles pool. IDs are a SHA-256 prefix of the cells; duplicates are rejected; a seed makes generation reproducible.
- Show order is fixed in `lib/live/runOfShow.ts`. One intro song per game: dance-along for game 1, sing-along for game 2. Half-time standings show positions only.
- Timing (`lib/live/types.ts`): 45 seconds per song by default (15 to 300); album art at 10s, title 15s, artist 20s, scaled to song length; challenge songs run 90 seconds with reveals at 10/20/25s and a default 10-point bonus; hosts extend in 30-second steps.
- **Wooden spoon:** with three or more teams it goes to the second-lowest team, and to the lowest only with two. Deliberate anti-sandbagging rule, owner-confirmed 18 July 2026; never "fix" it.
- Live Spotify control needs an active Premium device; without one the show runs in manual host control mode. Auto-advance only runs while `mode === "running"`: a runtime left on `paused` while Spotify kept playing silently stalled auto-skip on 14 August 2026 (fixed in `4278518`).

## Integrations

- **Spotify:** tokens live in httpOnly cookies, not the database. The redirect URI defaults to `{origin}/api/spotify/callback` (`SPOTIFY_WEB_REDIRECT_URI` overrides it). Register both the `127.0.0.1:3000` and `localhost:3000` callbacks in the Spotify app or local auth fails with a redirect mismatch; production must match the deployed origin exactly. After a scope change, Disconnect then Connect again.
- **Event feeds per brand** (`lib/eventFeed/`): `anchor_management` (Anchor Management Tools API, key needs `read:events`) or `baronshub`, configured on `brands`; Anchor brands without their own URL and key fall back to the `MANAGEMENT_API_*` env vars. Feeds return an empty list on any error; the event pack must still generate when brand or feed resolution fails, and a failed QR render is skipped silently.
- Brand logos live in `brand-assets` and default logo paths are confined to `public/`; brand fonts come from the allowlist in `lib/brands/fonts.ts`.

## Environment variables

All server-side; none are `NEXT_PUBLIC_`. Next reads `.env.local` only at startup, so restart `npm run dev` after changing them.

| Variable | Purpose |
|---|---|
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_WEB_REDIRECT_URI` | Playlists and live control; the redirect URI is an optional override |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Required; routes throw `Missing env var` without them. Project ref `ihyazjaklyhacxixhwww` |
| `APP_ADMIN_SECRET` | Required in production |
| `MANAGEMENT_API_BASE_URL`, `MANAGEMENT_API_TOKEN`, `MANAGEMENT_PUBLIC_EVENTS_BASE_URL` | Optional Anchor feed fallback; events site defaults to `https://www.the-anchor.pub` |

## Known gotchas

- `.claude/worktrees/<name>` does not inherit the gitignored `.env.local`. Symlink it in and restart dev, or `/host` shows "Failed to load sessions" and `/api/generate` returns 500 even though the build passes.
- Diagnose live-show bugs by replaying the session's `session_events` rows before theorising from code; a sudden stop in rows means the host tab lost the lock or was suspended.
- Host and display each compute reveal phases locally from `progressMs` and `revealConfig` via `lib/live/reveal.ts`. Keep it deterministic; change ratios only in `lib/live/types.ts`.
- Prep wizard drafts persist in localStorage so work is never lost; do not clear them on navigation.
- PDF text is sanitised before drawing (pdf-lib's standard fonts cannot encode every character); keep new text paths on it.
- `ARCHITECTURE.md`, `PRD.md`, `IMPLEMENTATION_PLAN.md` and `docs/architecture/` are stale; trust the code and this file.
