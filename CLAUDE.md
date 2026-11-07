# CLAUDE.md: Music Bingo

Workspace standards live in `/Users/peterpitcher/Cursor/CLAUDE.md`. Read that first; nothing in it is repeated here. `AGENTS.md` is a relative symlink to this file, so Claude Code, Codex and Cursor read the same rules.

## What this is

A single-operator internal tool for running Music Bingo nights at The Anchor (the only venue since 6 November 2026; Barons Pubs is archived, not deleted). The prep wizard turns two song lists into an event pack (card PDFs, run sheet, DOCX host clipboard) and two private Spotify playlists; the host controller at `/host/[sessionId]` then drives the pub TV through a fixed run of show. The TV is `/tv`, paired once with a 6-digit code, which finds tonight's game by itself (spec M-9); `/display/[sessionId]` with a signed TV link is the fallback for a screen that cannot be paired. Players use printed cards; there is no per-player screen. Production: `https://musicbingo.orangejelly.co.uk` and `https://music-bingo.vercel.app` (Vercel project `oj-music-bingo`; both checked live 6 November 2026). `musicbingo-iota.vercel.app` is retired and returns 404.

## Stack, where it differs from the workspace default

- **Next.js 16.4.1** (not 15), React 19.2, TypeScript 5.5. `proxy.ts` (Next 16's middleware) is the kit's sign-in adapter. Node 24 (`.nvmrc`, matching the Vercel project's Node.js 24.x).
- Tailwind 4 with the shared kit `@anchor-nights/kit` (git tag in `package.json`, TypeScript source, so `transpilePackages`). `app/globals.css` imports the kit's `tokens.css`: The Anchor's look (DM Serif Display, Outfit, Clicker Script; deep green, cream, gold). The TV and the host console use the night register; prep, the games list, venue and admin pages add `theme-desk`. No `tailwind.config.ts`.
- Kit pieces in use: `ui` (Button, `buttonClass`, Card, Banner, `fieldClass`, AnchorLogo, HoldButton, Dock), `tv` (Stage, `useWakeLock`, `useFitStep`, `measureLayout`, `layoutFits`), `qr` (the QR guard), `errors` (`reportError`), `env` (build checks), `events` and `promo` (the TV's events loops and Thank You screen), `auth` (staff sign-in: server actions, screens, proxy, security headers and SQL templates) and `pairing` (TV pairing: `createTvPairing` in `lib/tv-pairing.ts`, `TvPageShell`, `PairTvForm`, `TvDevicesPanel` and its SQL templates). Prefer them to local copies.
- TV screens sit on the kit Stage (a 1920 by 1080 canvas scaled to the TV), so their text sizes are canvas pixels from `lib/tvType.ts` (the kit's TV sizes at 1080p), never below 32px. The kit's vh-based TV tokens would scale twice there. Fit text with `useFitStep` and `(el) => layoutFits(measureLayout(el))` from the kit (since v2.0.1 it reads layout pixels, so it is right at any Stage scale). Any vh or vw of the app's own inside the Stage is `calc(n * var(--anchor-vh, 1vh))`; never read `var(--text-tv-*)` in app CSS.
- **Staff sign-in is Supabase Auth through `@anchor-nights/kit/auth`** (the workspace auth standard, spec M-8): invite-only accounts, roles `admin`, `host` and `pending`. Game data is still read and written only by API route handlers with the service-role client (`lib/supabase/service.ts`); RLS is on, `anon` reaches nothing, and `authenticated` reaches only `profiles` and `auth_audit` (read only, behind the restrictive `active_staff_gate` policy, which also sits on every game table, where `authenticated` has no grant at all). Server actions exist only for the kit's sign-in and staff screens (`app/auth/actions.ts`, `app/admin/actions.ts`). See Access model.
- Tests: **Vitest**, **Playwright** flows (`scripts/e2e-flows.mjs`) and **pytest** for the legacy Python module; not Jest. ESLint 9 flat config, `no-explicit-any` off.

## Commands

```bash
npm run dev | build | start   # via scripts/next-with-localstorage.mjs
npm run lint                  # eslint . --max-warnings=0
npm run typecheck
npm test                      # vitest run with TZ=Europe/London (the business zone)
npm run test:utc              # the same suite with TZ=UTC (the serverless runtime); keep both green
npm run test:unit             # vitest run in the machine's own zone
npm run test:py               # python3 -m pytest -q (Python 3.11+)
npm run test:e2e              # Playwright; boots its own server on 127.0.0.1:3100 and a stand-in Supabase Auth on :54399
npm run check:anon-access     # what the public key can reach; needs SUPABASE_DB_URL, skips without it
npm run verify                # lint, typecheck, test, test:utc, test:py, test:e2e, build
```

- The wrapper passes `--localstorage-file=.next/node-localstorage.json` via `NODE_OPTIONS` so Node's Web Storage API works server-side. Use the npm scripts, not `npx next`.
- E2E mocks Spotify and the app's own APIs, and signs in through the real `/login`, server action and proxy against a stand-in for Supabase Auth inside `scripts/e2e-flows.mjs` (Turnstile is stubbed; the keys are Cloudflare's test pair). It needs no credentials, only Chromium (`npx playwright install chromium`).
- `supabase/tests/replay.sh` (CI's database job) replays every migration on Postgres 17, runs `auth-checks.sh` as each role, and proves those checks fail on a database without the sign-in migrations. CI then runs the anon guard against the replayed database.
- `music_bingo/` and `tests/*.py` are the original offline Python generator (5x5 cards), unused by the web app but still run by `verify`.

## Architecture

```
proxy.ts                 Kit sign-in adapter: session refresh and the staff page gate
app/prep                 Prep wizard
app/host, app/host/[id]  Dashboard and live controller
app/tv                   The pub TV (never signed in): pairing code, tonight's game, or the laptop's Open Display
app/display/[id]         Fallback TV display for an unpairable screen (TV link token)
components/display/      LiveDisplay: the TV display both pages render
app/brands               Venue management
app/admin                Staff: invites, roles, deactivation (admins only)
app/account              Own account and change password
app/login, pending, forgot-password, invite, auth/*   Kit sign-in screens
app/guest/[id]           Retired stub
app/api/*                sessions, display, spotify, brands, generate, errors, cron/auth-maintenance
lib/auth/                Kit wiring (server.ts), route gate, route registry, cron check
lib/supabase/            service.ts (service role), admin.ts, server.ts (sign-in client)
lib/live/                Runtime types, reveal, run of show, repo, sync, control lock, link tokens, tonight's game, TV access, sign-in guard
lib/tv-pairing.ts        The kit's TV pairing, wired to this app
scripts/bootstrap-first-admin.mjs   Prints the first admin's invite link
supabase/migrations/     Nothing runs them at deploy; production applies them only through the prod-migrate skill (Supabase connector) in an approved change, never db push
```

### Data and sync model

- Tables: `live_sessions` (`data` and `runtime_data` JSONB, validated in app only; `runtime_version`, `controller_id`, `controller_seen_at`, `link_generation`), `session_runtime_snapshots` (latest host runtime), `session_events` (append-only; `runtime_snapshot` rows about every 2 seconds while the host holds the control lock; pg_cron keeps 90 days), `brands`, and the kit's `tv_*` pairing tables. Storage bucket `brand-assets`.
- **Sync is not Supabase Realtime.** Every console save goes to `POST /api/sessions/[id]/commands`, which calls `save_live_runtime`: the runtime, its snapshot row and its event in one transaction, held to the control lock and to the `runtime_version` the console last saw. Only a save that landed answers 200; a missing game is 404, another console's lock or a stale version 409, and the console shows each one (`lib/live/runtimeSync.ts`). A save that could not reach the server is kept in localStorage and retried every 5 seconds; a refusal is never retried. A trigger bumps `runtime_version` on every runtime change.
- **Control lock (spec M-9, S4.3)** is held in the database (migration `20261107120100`): one console tab in control (`x-host-device`, a per-tab id in sessionStorage), a heartbeat every 10 seconds, and **Take over** offered only after 30 seconds without contact and only when the host presses it. A console without control is read only and follows the game every 3 seconds.
- The TV polls `/api/display/[id]/snapshot` every 1.5 seconds while running (5 idle) and drops any runtime older than the newest version it has seen (`lib/live/snapshotOrder.ts`). Same-device windows also get the console's `BroadcastChannel`, ordered by `updatedAtMs`; only the console in control broadcasts.
- End Session and Reset to Lobby are press-and-hold (kit HoldButton); everything else on the console is one tap. Previous and Next sit in the kit Dock at the foot of the laptop console.
- Supabase is the source of truth; localStorage holds only prep drafts, the retry queue and legacy saved sessions.

### Access model

- **Staff sign in** at `/login` (email and password, Turnstile, invite-only). Roles live in `public.profiles.role` and are read through `current_staff_role()`, which also applies the active-identity gate: a deactivated, banned or deleted account has no role at once, even with a valid token. Admins manage staff at `/admin` (copied invite links, 7 days, one use); everyone can change their password at `/account`. Supabase JWTs last 15 minutes.
- **Pages:** `proxy.ts` sends a signed-out visitor on `/host`, `/prep`, `/brands`, `/account` or `/admin` to `/login?next=...` and an account with no role to `/pending`; `/admin` is admins only. Pages also call `requireRole`. If Supabase is down the answer is 503, never "signed out".
- **API routes** each gate themselves through `lib/auth/routeGuard.ts`: a signed-in host or admin, and same-origin for any state change; JSON 401, 403 or 503. The TV's snapshot route (`lib/live/displayAccess.ts`) also accepts a TV link of the game's current generation, or a paired TV for tonight's game only. `/api/tv/pairing` is the kit's open, rate-limited pairing endpoint. `/api/screen/events` is open and read only: the website's own upcoming events for the TV loops, no game data, token or key. `lib/auth/routeRegistry.ts` lists every route with its protection and side effects, and `routeRegistry.test.ts` fails on an unlisted route or one that lets anonymous callers through. Add every new route there.
- **The pub TV (`/tv`, spec M-9)** is outside the proxy. Unpaired it shows a 6-digit code; a host types it into **Pair a TV** on the console and the screen keeps a device cookie. A paired TV shows tonight's game (`lib/live/tonight.ts`: the game for today's date in London, and last night's live game until 04:00), or an idle notice. Any database outage shows "Reconnecting", never a game or a code. A signed-in host's laptop on `/tv?session=<id>` (the console's **Open Display**) shows that game without being paired. Admins remove TVs on `/admin`. Peter approved on 7 November 2026 that pairing stores IP addresses: 1 day on codes, 30 days on failed attempts; the daily cron prunes them (`prunePairing`).
- **Host and TV links** (`lib/live/access.ts`, v2) are HMAC tokens signed with `LIVE_LINK_SECRET` only. They expire after 24 hours (the cookie with them) and carry the game's `link_generation`; **Cancel links** on the console adds one, so every older link stops at its next request. Version 1 links are refused. Without the secret no link is made or accepted, and the build fails. The TV link alone opens the display; the host link only opens `/host/[id]`, which still needs sign-in.
- **The first admin:** `node --env-file=.env.local scripts/bootstrap-first-admin.mjs --email <address>` prints a one-time invite link (service role, never a password) and refuses once an active admin exists.
- An empty games list now means a sign-in or role problem before lost data: `lib/live/signInGuard.ts` sends a 401 to `/login` and a 403 to `/pending`; let that error propagate rather than falling back to cached data.
- Daily at 04:17 UTC Vercel Cron calls `/api/cron/auth-maintenance` (`CRON_SECRET`) to prune old audit rows, grants and invites, fail stuck invites, and prune pairing codes, failed attempts and revoked TVs.
- **Deviations and accepted risks** (owner: Peter): the CSP is Report-Only and allows `'unsafe-inline'` scripts and styles (Next's bootstrap has no nonce yet) with no report endpoint, until it can be enforced; high sign-in alerts reach only `app_errors`, not a person; every API call reads the user and role twice (proxy and route), which costs a few milliseconds; hosts can edit venues as well as admins.
- The Supabase dashboard settings the kit needs (sign-ups off, CAPTCHA Turnstile, JWT 900 seconds, the `public.kit_before_user_created` hook, `/auth/confirm` redirect, SMTP and templates) are in the kit README, section 7.

## Game and show rules

- Input: one list per game, `Artist – Title` (en dash preferred; spaced hyphen or em dash also parse), decade headers ignored, max 50 songs per game, at least 25 unique pool items.
- Cards: 3 rows by 6 columns, one blank per row, drawn from a combined artists-and-titles pool. IDs are a SHA-256 prefix of the cells; duplicates are rejected; a seed makes generation reproducible.
- Show order is fixed in `lib/live/runOfShow.ts`. One intro song per game: dance-along for game 1, sing-along for game 2. Half-time standings show positions only.
- Timing (`lib/live/types.ts`): 45 seconds per song by default (15 to 300); album art at 10s, title 15s, artist 20s, scaled to song length; challenge songs run 90 seconds with reveals at 10/20/25s and a default 10-point bonus; hosts extend in 30-second steps.
- **Wooden spoon:** with three or more teams it goes to the second-lowest team, and to the lowest only with two. Deliberate anti-sandbagging rule, owner-confirmed 18 July 2026; never "fix" it.
- Live Spotify control needs a Premium account and a Spotify app that is open. With no active device, play commands go to the only open app (`pickFallbackDevice`); with several open, the host is told to press play on one; with none, the show runs in manual host control mode. Auto-advance only runs while `mode === "running"`: a runtime left on `paused` while Spotify keeps playing stalls auto-skip without any error.

## Integrations

- **Spotify:** tokens live in httpOnly cookies, not the database. The redirect URI defaults to `{origin}/api/spotify/callback` (`SPOTIFY_WEB_REDIRECT_URI` overrides it). Register both the `127.0.0.1:3000` and `localhost:3000` callbacks in the Spotify app or local auth fails with a redirect mismatch; production must match the deployed origin exactly. After a scope change, Disconnect then Connect again.
- **Spotify 403 "Restriction violated"** means the command does not fit the player's state (pause when paused, skip with nothing loaded), not a Premium or permission problem; it maps to `RESTRICTED` and the command route explains it from the player state. Failures log `[spotify-live]` lines to Vercel. Spotify-owned playlists (ids starting `37i9dQZF1`) return 404 to this app and may refuse to play, so break playlists must be ones the operator owns.
- **Events on the TV (spec M-7, S7):** `lib/eventsFeed.ts` is the kit's `createEventsFeed` for category `music-bingo` (never a display name), server only; `/api/screen/events` serves its projection (public, no key, cached 60 seconds) and `components/promo/PromoProvider.tsx` holds it for the TV and the console preview. The welcome and break screens lead the kit's idle loop (next Music Bingo, upcoming events, what's on); a paired TV with no game tonight loops on its own (`TvIdleLoop`); the Thank You screen is the kit's `ThankYouSlide` then the next two events (`lib/promo/promoMode.ts`). A feed that is down or has no key shows only "See what's on", never a typed or placeholder date. The host can hide the review or next-night card for tonight (Live Content panel), never type one. The welcome screen's corner says when the game starts only from real data (`lib/live/welcomeWhen.ts`): the session's date and that night's start time in the feed ("Tonight · 8pm"), the date alone without a feed night, nothing without either. Songs, themes and dates are never filled from design samples; `sanitizeContent` drops a stored copy of an old sample (`RETIRED_SAMPLE_VALUES`).
- **Review link:** `REVIEW_SHORT_URL` (Music Bingo's own short link on `l.the-anchor.pub` to `/feedback`), else `https://l.the-anchor.pub/jls0mu` (`lib/reviewLink.ts`). Never a Google URL and never a rating request: the kit refuses any link that is not an https the-anchor.pub one.
- **Printed pack feed** (`lib/eventFeed/`): `anchor_management` or `baronshub`, chosen on `brands`. The Anchor key comes only from `ANCHOR_API_KEY` (or the old `MANAGEMENT_API_TOKEN` for one release, `lib/anchorApiEnv.ts`), never from `brands.event_feed_api_key`, and is sent only to the env base URL; BaronsHub has no key now. Feeds return an empty list on any error; the event pack must still generate when brand or feed resolution fails, and a failed QR render is skipped silently.
- Brand logos live in `brand-assets` and default logo paths are confined to `public/`. Screens no longer take per-venue colours or fonts: every screen uses The Anchor look, and the venue page edits only the name, logos, messages, QR links and event feed.
- **Archived venues:** `brands.archived_at` hides a venue from every selector and the venue page, and `PUT /api/sessions/[id]/brand` refuses one. Games that still point at an archived venue render in the default venue's look on screen (`resolveScreenBrandConfig`); printed packs keep `resolveBrandConfig`.
- **Error sink:** `lib/reportError.ts` (the kit reporter) logs redacted failures from the API routes and, when `ERROR_SINK_URL` and `ERROR_SINK_TOKEN` are set, posts them to `/api/errors`, which stores them in `public.app_errors` (service role only, RLS on, anon and authenticated revoked).

## Environment variables

Next reads `.env.local` only at startup, so restart `npm run dev` after changing them. `lib/buildEnv.mjs` checks them when `next.config.mjs` loads and fails the build naming every missing or malformed one. The sign-in variables and `LIVE_LINK_SECRET` are needed on **every** build, local, preview and CI included (CI and E2E use placeholders); the rest only on production builds (`VERCEL_ENV=production`).

| Variable | Needed | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Every build | Staff sign-in. Same project as `SUPABASE_URL` (the build checks) |
| `SUPABASE_SERVICE_ROLE_KEY` | Every build | Game data and the kit's invites, audit and throttle |
| `NEXT_PUBLIC_APP_URL` | Every build | This app's origin, for reset and invite links: `https://musicbingo.orangejelly.co.uk` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Every build | Turnstile; Supabase verifies the token. Locally, Cloudflare's test pair |
| `AUDIT_HMAC_KEY` | Every build | `v1:` then at least 32 random characters; pseudonymises emails in `auth_audit` |
| `SUPABASE_URL` | Production | Service-role client. Project ref `ihyazjaklyhacxixhwww` |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Production | Playlists and live control; `SPOTIFY_WEB_REDIRECT_URI` is an optional override |
| `LIVE_LINK_SECRET` | Every build | Signs host and TV links, at least 16 characters, nothing else falls back. Links made before M-9 stop working whatever its value |
| `CRON_SECRET` | Production | Vercel Cron's bearer for `/api/cron/auth-maintenance`, at least 32 characters |
| `ERROR_SINK_URL`, `ERROR_SINK_TOKEN` | Optional | Set both to store reports in `app_errors`: the URL is this app's `/api/errors` (https), the token at least 32 characters |
| `ANCHOR_API_KEY` | Production | Music Bingo's management API key (`read:events`) for the TV's events and the printed pack; must look like `anch_...`. Previews and local runs go without |
| `ANCHOR_API_BASE_URL` | Optional | Defaults to `https://management.orangejelly.co.uk/api`; https |
| `MANAGEMENT_API_TOKEN`, `MANAGEMENT_API_BASE_URL` | Deprecated | The old names, still read for one release (the build and the server log a rename note); remove the fallback in the release after M-7 |
| `REVIEW_SHORT_URL` | Optional | The Thank You screen's review link; an https the-anchor.pub link (the build checks). Unset uses `https://l.the-anchor.pub/jls0mu` |
| `MANAGEMENT_PUBLIC_EVENTS_BASE_URL` | Optional | The printed pack's events site; defaults to `https://www.the-anchor.pub` |

`APP_ADMIN_SECRET` is retired (M-8): nothing reads it. Remove it from Vercel once `LIVE_LINK_SECRET` is set.

## Known gotchas

- `.claude/worktrees/<name>` does not inherit the gitignored `.env.local`. Symlink it in and restart dev, or the build stops on the sign-in variables and `/host` cannot load sessions.
- `next.config.mjs` sets `agentRules: false` so `next dev` stops writing its agent block into this file; keep it.
- Diagnose live-show bugs by replaying the session's `session_events` rows before theorising from code; a sudden stop in rows means the host tab lost the lock or was suspended (`live_sessions.controller_id` and `controller_seen_at` say which tab held it and when it was last heard from).
- Host and display each compute reveal phases locally from `progressMs` and `revealConfig` via `lib/live/reveal.ts`. Keep it deterministic; change ratios only in `lib/live/types.ts`.
- Prep wizard drafts persist in localStorage so work is never lost; do not clear them on navigation. Drafts also keep the playlists already made, with a signature of the songs, themes, date and intro songs they were built from (`playlistInputSignature` in `lib/prepDraft.ts`); editing a saved game reattaches its playlists the same way. Changing any of those inputs discards the playlists, so sign only after anything that fills inputs in (the Create button's intro lookup discarded fresh playlists on 16 October 2026).
- PDF text is sanitised before drawing (pdf-lib's standard fonts cannot encode every character); keep new text paths on it.
- `ARCHITECTURE.md`, `PRD.md`, `IMPLEMENTATION_PLAN.md` and `docs/architecture/` are stale; trust the code and this file.
