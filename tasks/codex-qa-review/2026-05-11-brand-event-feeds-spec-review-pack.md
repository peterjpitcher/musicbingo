# Review Pack: brand-event-feeds-spec

**Generated:** 2026-05-11
**Mode:** A (A=Adversarial / B=Code / C=Spec Compliance)
**Project root:** `/Users/peterpitcher/Cursor/OJ-MusicBingo/.claude/worktrees/musing-snyder-91248f`
**Base ref:** `HEAD`
**HEAD:** `c413fc0`
**Diff range:** `HEAD`
**Stats:**  1 file changed, 36 deletions(-)

> This pack is the sole input for reviewers. Do NOT read files outside it unless a specific finding requires verification. If a file not in the pack is needed, mark the finding `Needs verification` and describe what would resolve it.

## Changed Files

```
.claude/changes-manifest.log
tasks/spec-brand-event-feeds.md
```

## User Concerns

This is a SPEC REVIEW, not a code review. The spec proposes brand-specific event feed integration. Key concerns: (1) Is the adapter abstraction the right design or over-engineered? (2) Is storing API keys in the brands table secure enough? (3) Are response shape differences between Anchor and BaronsHub APIs properly accounted for? (4) Is the env var migration path clean? (5) Any missed edge cases or failure modes? (6) Does the spec properly account for the existing codebase patterns?

## Diff (`HEAD`)

```diff
diff --git a/.claude/changes-manifest.log b/.claude/changes-manifest.log
index e8f0065..951e8bc 100644
--- a/.claude/changes-manifest.log
+++ b/.claude/changes-manifest.log
@@ -1,37 +1 @@
 # manifest-version: 1
-2026-04-24T09:37:56Z|CREATE|supabase/migrations/20260424120000_create_brands.sql|migration|database
-2026-04-24T09:37:57Z|CREATE|supabase/migrations/20260424120001_add_brand_id_to_sessions.sql|migration|database
-2026-04-24T09:37:58Z|CREATE|supabase/migrations/20260424120002_create_brand_assets_bucket.sql|migration|database
-2026-04-24T09:38:07Z|EDIT|supabase/migrations/20260424120000_create_brands.sql|migration|database
-2026-04-24T09:40:37Z|CREATE|app/api/brands/route.ts|route|structure,docs
-2026-04-24T09:40:42Z|CREATE|app/api/brands/[id]/route.ts|route|structure,docs
-2026-04-24T09:40:47Z|CREATE|app/api/brands/[id]/logo/route.ts|route|structure,docs
-2026-04-24T09:46:01Z|EDIT|app/api/sessions/[id]/route.ts|route|structure,docs
-2026-04-24T09:46:06Z|EDIT|app/api/sessions/[id]/route.ts|route|structure,docs
-2026-04-24T09:46:28Z|CREATE|app/api/sessions/[id]/brand/route.ts|route|structure,docs
-2026-04-24T09:47:55Z|EDIT|app/api/sessions/[id]/route.ts|route|structure,docs
-2026-04-24T09:48:00Z|EDIT|app/api/sessions/[id]/route.ts|route|structure,docs
-2026-04-24T10:30:00Z|EDIT|app/api/brands/route.ts|route|structure,docs
-2026-04-24T10:30:04Z|EDIT|app/api/brands/route.ts|route|structure,docs
-2026-04-24T10:30:12Z|EDIT|app/api/brands/[id]/route.ts|route|structure,docs
-2026-04-24T10:30:17Z|EDIT|app/api/brands/[id]/route.ts|route|structure,docs
-2026-04-25T21:09:00Z|EDIT|app/api/generate/route.ts|route|structure,docs
-2026-04-25T21:09:05Z|EDIT|app/api/generate/route.ts|route|structure,docs
-2026-04-25T21:09:15Z|EDIT|app/api/generate/route.ts|route|structure,docs
-2026-04-25T21:09:21Z|EDIT|app/api/generate/route.ts|route|structure,docs
-2026-04-25T21:09:40Z|EDIT|app/api/generate/route.ts|route|structure,docs
-2026-04-25T21:09:47Z|EDIT|app/api/generate/route.ts|route|structure,docs
-2026-04-25T21:10:09Z|EDIT|app/api/generate/route.ts|route|structure,docs
-2026-05-10T09:28:56Z|CREATE|app/api/spotify/playlist-tracks/[playlistId]/route.ts|route|structure,docs
-2026-05-10T09:29:04Z|CREATE|app/api/spotify/track/[trackId]/route.ts|route|structure,docs
-2026-05-10T09:50:33Z|EDIT|app/api/generate/route.ts|route|structure,docs
-2026-05-10T09:50:46Z|EDIT|app/api/generate/route.ts|route|structure,docs
-2026-05-10T09:50:56Z|EDIT|app/api/generate/route.ts|route|structure,docs
-2026-05-10T09:51:01Z|EDIT|app/api/generate/route.ts|route|structure,docs
-2026-05-10T09:51:06Z|EDIT|app/api/generate/route.ts|route|structure,docs
-2026-05-10T16:22:13Z|EDIT|app/api/spotify/live/command/route.ts|route|structure,docs
-2026-05-10T16:22:15Z|EDIT|app/api/spotify/live/command/route.ts|route|structure,docs
-2026-05-10T16:22:17Z|EDIT|app/api/spotify/live/command/route.ts|route|structure,docs
-2026-05-10T16:22:26Z|EDIT|app/api/spotify/live/command/route.ts|route|structure,docs
-2026-05-10T16:23:25Z|EDIT|app/api/spotify/live/command/route.ts|route|structure,docs
-2026-05-10T16:48:32Z|EDIT|app/api/generate/route.ts|route|structure,docs
```

## Changed File Contents

### `.claude/changes-manifest.log`

```
# manifest-version: 1
```

### `tasks/spec-brand-event-feeds.md`

```
# Spec: Brand-Specific Event Feeds

**Status:** Draft — awaiting review
**Complexity:** L (4) — new DB columns, new abstraction layer, 2 API adapters, UI changes
**Author:** Claude | **Date:** 2026-05-11

---

## Problem Statement

Music Bingo generates PDF bingo cards and clipboard DOCX runsheets that include a "What's On" section with upcoming events. Currently, event data is fetched exclusively from The Anchor's management API (`management.orangejelly.co.uk`) via hardcoded env vars. This means:

- Every brand gets The Anchor's events (or no events if the env vars are missing)
- Barons events cannot be shown, even though BaronsHub already has a public events API
- Adding a new customer requires code changes, not just configuration

## Success Criteria

1. Each brand can optionally configure its own event feed (API URL + credentials)
2. PDF "What's On" back pages show the correct brand's events
3. Clipboard DOCX "Upcoming Events" section shows the correct brand's events
4. The Anchor continues to work exactly as today (backwards compatible)
5. Barons events are fetched from BaronsHub's `/api/v1/events` endpoint
6. Brands with no event feed configured gracefully skip the events section
7. Adding a future customer's feed requires only brand config, no code changes

## Scope

**In scope:**
- New DB columns on `brands` for event feed configuration
- Adapter abstraction layer to normalise different API response shapes
- Two concrete adapters: Anchor Management API, BaronsHub Public API
- Updated PDF and clipboard generation to use brand-specific feeds
- Brand editor UI for event feed settings
- Migration to seed The Anchor's existing config

**Out of scope:**
- Guest/host screen event display (events don't appear there today)
- Creating a new API in BaronsHub (it already exists)
- Event caching or background sync (fetch on demand, same as today)
- Per-event QR code changes (existing `eventUrl` logic stays)

---

## Discovery Findings

### Current Architecture

```
lib/managementApi.ts
  ├── getManagementApiConfig()     → reads MANAGEMENT_API_* env vars
  ├── fetchUpcomingEventDetails()  → returns EventDetail[]
  ├── fetchNextUpcomingEventLinks() → returns {label, url}[]
  └── fetchNextThreeUpcomingEventLinks() → convenience wrapper

Consumers:
  lib/pdf.ts          → renderEventsPage() calls fetchUpcomingEventDetails()
  lib/clipboardDocx.ts → eventParagraphs() calls fetchUpcomingEventDetails()
```

### Anchor Management API

- **Base URL:** `MANAGEMENT_API_BASE_URL` (e.g. `https://management.orangejelly.co.uk`)
- **Auth:** `X-API-Key` + `Authorization: Bearer` headers using `MANAGEMENT_API_TOKEN`
- **Endpoint:** `GET /api/events?from_date=...&to_date=...&available_only=true&limit=N`
- **Response:** `{ events: ManagementApiEvent[], meta: { has_more } }`
- **Event shape:** Loosely typed with fallback field names (`name` / `title` / `event_name`, `startDate` / `start_date`, etc.)

### BaronsHub Public API

- **Base URL:** BaronsHub deployment URL (e.g. `https://baronshub.vercel.app`)
- **Auth:** `Authorization: Bearer BARONSHUB_WEBSITE_API_KEY`
- **Endpoint:** `GET /api/v1/events?from=ISO&limit=N&endsAfter=ISO`
- **Response:** `{ data: PublicEvent[], pagination: { nextCursor, hasMore } }`
- **Event shape:** Well-typed `PublicEvent` with: `id`, `slug`, `title`, `teaser`, `highlights[]`, `eventType`, `startAt`, `endAt`, `description`, `bookingType`, `ticketPrice`, `bookingUrl`, `eventImageUrl`, `venue: { name, address }`, etc.
- **Rate limit:** 120 req/60s

### Key Differences Between APIs

| Aspect | Anchor | BaronsHub |
|--------|--------|-----------|
| Auth header | `X-API-Key` + `Bearer` | `Bearer` only |
| Pagination | offset-based (`limit`/`offset`) | cursor-based (`cursor`) |
| Date params | `from_date`, `to_date` (date strings) | `from`, `to` (ISO datetime), `endsAfter` |
| Event title | `name` / `title` / `event_name` (fallbacks) | `title` (single field) |
| Event dates | `startDate` / `start_date` (multiple formats) | `startAt` (ISO 8601) |
| Price | `offers` field (complex) | `ticketPrice` (number or null) |
| Highlights | `(event as any).highlights` (untyped) | `highlights: string[]` (typed) |
| Event URL | `eventUrl` / `publicUrl` / slug-constructed | `bookingUrl` or slug-constructed |
| Public events base | `MANAGEMENT_PUBLIC_EVENTS_BASE_URL` env var | Derived from brand `website_url` |

---

## Proposed Design

### 1. Database: New Columns on `brands`

```sql
ALTER TABLE brands
  ADD COLUMN event_feed_type text CHECK (event_feed_type IN ('anchor_management', 'baronshub', 'none')),
  ADD COLUMN event_feed_base_url text,
  ADD COLUMN event_feed_api_key text,
  ADD COLUMN event_feed_public_base_url text;
```

| Column | Purpose | Example (Anchor) | Example (Barons) |
|--------|---------|-------------------|-------------------|
| `event_feed_type` | Adapter selector | `'anchor_management'` | `'baronshub'` |
| `event_feed_base_url` | API base URL | `'https://management.orangejelly.co.uk'` | `'https://baronshub.vercel.app'` |
| `event_feed_api_key` | API token/key | `'anch_...'` | `'baron_...'` |
| `event_feed_public_base_url` | Public website for event URLs | `'https://www.the-anchor.pub'` | `'https://www.baronslife.co.uk'` |

Null `event_feed_type` or `'none'` = no events section in PDF/DOCX.

**Migration also seeds The Anchor's config** from current env vars (or as literal values — TBD based on preference).

### 2. Adapter Abstraction

New file: `lib/eventFeed/types.ts`

```typescript
export interface NormalisedEvent {
  name: string;
  date: Date;
  time: string;            // e.g. "7:30 PM"
  dayOfWeek: string;       // e.g. "Friday"
  dayNumber: string;       // e.g. "23"
  monthShort: string;      // e.g. "May"
  dateFormatted: string;   // e.g. "Friday 23rd May"
  price: string | null;    // e.g. "£5" or "Free" or null
  description: string | null;
  highlights: string[];
  eventUrl: string | null; // link for QR code
}

export interface EventFeedAdapter {
  fetchUpcomingEvents(opts: {
    afterDate: string;     // ISO date (YYYY-MM-DD)
    limit: number;
    sessionDate?: string;  // for context (e.g. skip same-day events)
  }): Promise<NormalisedEvent[]>;
}

export interface EventFeedConfig {
  type: 'anchor_management' | 'baronshub';
  baseUrl: string;
  apiKey: string;
  publicBaseUrl: string;
}
```

This is essentially the existing `EventDetail` type — renamed to make the abstraction explicit.

### 3. Concrete Adapters

**`lib/eventFeed/anchorAdapter.ts`** — Extracts the existing logic from `lib/managementApi.ts`:
- Calls `GET /api/events` with offset pagination
- Maps the loosely-typed response to `NormalisedEvent`
- Handles all the field name fallbacks (`name`/`title`/`event_name`, etc.)

**`lib/eventFeed/baronshubAdapter.ts`** — New:
- Calls `GET /api/v1/events` with cursor pagination
- Maps `PublicEvent` to `NormalisedEvent`
- Handles `bookingUrl` → `eventUrl`, `ticketPrice` → `price`, `startAt` → date fields

**`lib/eventFeed/index.ts`** — Factory:
```typescript
export function createEventFeedAdapter(config: EventFeedConfig): EventFeedAdapter {
  switch (config.type) {
    case 'anchor_management':
      return new AnchorAdapter(config);
    case 'baronshub':
      return new BaronsHubAdapter(config);
  }
}

export async function fetchEventsForBrand(
  brand: BrandConfig,
  sessionDate: string,
  limit?: number
): Promise<NormalisedEvent[]> {
  if (!brand.event_feed_type || brand.event_feed_type === 'none') return [];
  const adapter = createEventFeedAdapter({ ... });
  return adapter.fetchUpcomingEvents({ ... });
}
```

### 4. Consumer Updates

**`lib/pdf.ts` — `renderEventsPage()`:**
- Currently calls `fetchUpcomingEventDetails()` directly
- Change to call `fetchEventsForBrand(brand, sessionDate)`
- The `NormalisedEvent` shape matches the existing `EventDetail` shape, so rendering logic needs minimal changes
- Skip the events page entirely when the adapter returns an empty array (already has this fallback)

**`lib/clipboardDocx.ts` — `eventParagraphs()`:**
- Same change: use `fetchEventsForBrand()` instead of `fetchUpcomingEventDetails()`
- Brand is already available in the clipboard generation context

**`lib/managementApi.ts`:**

[truncated at line 200 — original has 302 lines]
```

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
