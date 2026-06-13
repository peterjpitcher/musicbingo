# AGENTS.md — Music Bingo

This file provides project-specific guidance. See the workspace-level `AGENTS.md` one directory up for shared conventions.

## Quick Profile

- **Framework**: Next.js 16, React 18.3
- **Test runners**: Playwright (E2E), Python pytest, Node (custom scripts)
- **Database**: Supabase (live sessions, persistent storage)
- **Key integrations**: Spotify Web API, Anchor Management API, PDF generation (pdf-lib), QR codes
- **Size**: ~23 files in lib/, 10+ routes, custom Python module
- **Novel aspects**: Dual test suite (JS + Python), Supabase-backed live session sync, private display gameplay

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
- `/display/[sessionId]` — Private TV display view
- `/api/sessions/*` — Live session management
- `/api/spotify/*` — Spotify OAuth + playlist creation
- `/api/generate/*` — PDF & DOCX export

**Key Patterns**
- **Live Sessions**: Host writes runtime snapshots to Supabase; display polls a private snapshot endpoint
- **Game State**: Supabase is the source of truth; localStorage is draft/cache/retry only
- **PDF Generation**: Custom lib/pdf.ts using pdf-lib + Sharp for image rendering
- **Spotify Auth**: OAuth 2.0 callback → token stored server-side, used to create/populate playlists
- **Custom Scripts**:
  - `next-with-localstorage.mjs` wraps Next.js CLI to enable localStorage in Node/SSR
  - `e2e-flows.mjs` runs Playwright flows end-to-end

## Key Files

| Path | Purpose |
|------|---------|
| `lib/live/types.ts` | Session, game, card, reveal types |
| `lib/live/channel.ts` | Same-device BroadcastChannel helper |
| `lib/live/sessionRepo.ts` | CRUD for `live_sessions` table |
| `lib/live/storage.ts` | localStorage draft/cache helpers |
| `lib/live/reveal.ts` | Clue/answer reveal computation |
| `lib/generator.ts` | Create bingo cards from tracks |
| `lib/pdf.ts` | PDF export (pdf-lib + Sharp) |
| `lib/spotifyWeb.ts` | Spotify OAuth & web API calls |
| `lib/spotifyLive.ts` | Live Spotify player control |
| `lib/supabase.ts` | Supabase client init (service-role for migrations) |
| `components/` | Game UI (host, private display, card display) |
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

### Runtime Sync
- Supabase is the source of truth for saved sessions and live runtime snapshots.
- Host runtime writes go through `lib/live/sessionRepo.ts`.
- `lib/live/runtimeSync.ts` keeps the newest failed runtime write and retries it when the connection returns.
- `localStorage` is for drafts, same-device cache, and retry state only.

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
