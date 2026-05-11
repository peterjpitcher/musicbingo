# Spec: Brand-Specific Event Feeds

**Status:** Revised (post-adversarial review)
**Complexity:** L (4) — new DB columns, new abstraction layer, 2 API adapters, UI + API changes
**Author:** Claude | **Date:** 2026-05-11
**Review:** [Adversarial review](codex-qa-review/2026-05-11-brand-event-feeds-spec-adversarial-review.md)

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
7. Adding a future customer using an existing feed provider requires only brand config, no code changes (new providers require a new adapter)

## Scope

**In scope:**
- New DB columns on `brands` for event feed configuration
- Adapter abstraction layer to normalise different API response shapes
- Two concrete adapters: Anchor Management API, BaronsHub Public API
- Updated PDF and clipboard generation to use brand-specific feeds
- Brand editor UI for event feed settings
- Brand API route hardening (strip sensitive fields from responses)
- Env var fallback for backwards compatibility during migration

**Out of scope:**
- Guest/host screen event display (events don't appear there today)
- Creating a new API in BaronsHub (it already exists)
- Event caching or background sync (fetch on demand, same as today)
- Per-event QR code changes (existing `eventUrl` logic stays)
- Auth gating on brand endpoints (no auth exists in the app today — separate concern)
- Test connection button in brand editor (future enhancement)
- Event image support in PDF layout (keep layout consistent across providers)

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

**Verified facts (from codebase inspection):**
- `app/api/generate/route.ts` loads `BrandConfig` via `resolveBrandConfig(brandId)` and passes it to `renderEventsPage()` — new brand fields will flow through to PDF automatically
- `renderClipboardDocx()` does NOT receive brand config — needs explicit wiring
- Brand API routes use `select("*")` and spread the full row — new columns are exposed by default
- Brand endpoints have zero auth — fully public

### Anchor Management API

- **Base URL:** `MANAGEMENT_API_BASE_URL` (e.g. `https://management.orangejelly.co.uk`)
- **Auth:** `X-API-Key` + `Authorization: Bearer` headers using `MANAGEMENT_API_TOKEN`
- **Endpoint:** `GET /api/events?from_date=...&to_date=...&available_only=true&limit=N`
- **Response:** `{ events: ManagementApiEvent[], meta: { has_more } }`
- **Event shape:** Loosely typed with fallback field names (`name` / `title` / `event_name`, `startDate` / `start_date`, etc.)

### BaronsHub Public API

- **Base URL:** BaronsHub deployment URL
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
  ADD COLUMN event_feed_type text NOT NULL DEFAULT 'none'
    CHECK (event_feed_type IN ('anchor_management', 'baronshub', 'none')),
  ADD COLUMN event_feed_base_url text,
  ADD COLUMN event_feed_api_key text,
  CONSTRAINT event_feed_config_complete CHECK (
    event_feed_type = 'none'
    OR (event_feed_base_url IS NOT NULL AND event_feed_api_key IS NOT NULL)
  );
```

| Column | Purpose | Example (Anchor) | Example (Barons) |
|--------|---------|-------------------|-------------------|
| `event_feed_type` | Adapter selector (NOT NULL, default 'none') | `'anchor_management'` | `'baronshub'` |
| `event_feed_base_url` | API base URL | `'https://management.orangejelly.co.uk'` | BaronsHub deployment URL |
| `event_feed_api_key` | API token/key | `'anch_...'` | `'baron_...'` |

**Dropped:** `event_feed_public_base_url` — use existing `website_url` column instead. Each adapter constructs event URLs from `website_url` using provider-specific path templates.

**No-feed state:** `event_feed_type = 'none'` is the single canonical representation (NOT NULL with default).

**Validation constraint:** When `event_feed_type != 'none'`, both `event_feed_base_url` and `event_feed_api_key` must be non-null. Prevents partially configured feeds that fail silently at generation time.

### 2. Migration Strategy

The migration adds columns with safe defaults only — **no secrets in SQL files**.

```sql
-- Step 1: Add columns
ALTER TABLE brands
  ADD COLUMN event_feed_type text NOT NULL DEFAULT 'none' ...
  ADD COLUMN event_feed_base_url text,
  ADD COLUMN event_feed_api_key text;

-- Step 2: Set Anchor's feed type (config values set via admin UI post-deploy)
UPDATE brands SET event_feed_type = 'anchor_management' WHERE is_default = true;
```

**Env var fallback:** The code preserves existing `MANAGEMENT_API_*` env var behaviour. If a brand has `event_feed_type = 'anchor_management'` but `event_feed_base_url` is null, the adapter falls back to env vars. This means:
- Deploy the migration → Anchor keeps working via env vars
- Set Anchor's feed config via brand editor → env vars become redundant
- Remove env vars once DB config is confirmed populated

**Note:** The migration sets `event_feed_type = 'anchor_management'` for the default brand but leaves url/key null, so the CHECK constraint must allow this transitional state. The constraint should be: `event_feed_type = 'none' OR event_feed_base_url IS NOT NULL OR event_feed_type = 'anchor_management'` (Anchor adapter has env var fallback).

### 3. Adapter Abstraction

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
  eventUrl: string | null; // link for QR code — must be HTTPS or null
}

export interface EventFeedAdapter {
  fetchUpcomingEvents(opts: {
    afterDate: string;     // ISO date (YYYY-MM-DD), interpreted in Europe/London
    limit: number;
    sessionDate?: string;  // for context (e.g. skip same-day events)
  }): Promise<NormalisedEvent[]>;
}

export interface EventFeedConfig {
  type: 'anchor_management' | 'baronshub';
  baseUrl: string;
  apiKey: string;
  websiteUrl: string;     // from brand.website_url, for event link construction
}
```

**Date/timezone contract:** All `afterDate` values use `YYYY-MM-DD` in Europe/London timezone (per project `dateUtils` convention). Adapters convert to provider-specific formats:
- Anchor: passes as `from_date` string directly
- BaronsHub: converts to ISO datetime at midnight London time for `from` param

### 4. Concrete Adapters

**`lib/eventFeed/anchorAdapter.ts`** — Extracts the existing logic from `lib/managementApi.ts`:
- Calls `GET /api/events` with offset pagination (single page, up to `limit` events)
- Maps the loosely-typed response to `NormalisedEvent`
- Handles all the field name fallbacks (`name`/`title`/`event_name`, etc.)
- Constructs event URLs from `websiteUrl` + event slug/path
- **Env var fallback:** If `baseUrl` or `apiKey` is empty, reads `MANAGEMENT_API_*` env vars

**`lib/eventFeed/baronshubAdapter.ts`** — New:
- Calls `GET /api/v1/events` with `from` and `limit` params (single page, no cursor follow)
- Maps `PublicEvent` to `NormalisedEvent` with null-safe field handling:
  - `title` → `name` (required, always present)
  - `startAt` → `date`, `time`, `dayOfWeek`, etc. via `dateUtils`
  - `ticketPrice` → `price` (format as `"£N"` or `"Free"` or null)
  - `bookingUrl` → `eventUrl` (validate HTTPS, or construct from `websiteUrl` + `slug`)
  - `description` → `description` (null-safe)
  - `highlights` → `highlights` (default `[]`)
- All optional BaronsHub fields handled with explicit null fallbacks

**`lib/eventFeed/index.ts`** — Factory + error-handling wrapper:
```typescript
export function createEventFeedAdapter(config: EventFeedConfig): EventFeedAdapter { ... }

export async function fetchEventsForBrand(
  brand: BrandConfig,
  sessionDate: string,
  limit: number = 12
): Promise<NormalisedEvent[]> {
  if (brand.event_feed_type === 'none') return [];

  try {
    const config = buildFeedConfig(brand);
    const adapter = createEventFeedAdapter(config);
    return await adapter.fetchUpcomingEvents({
      afterDate: sessionDate,
      limit,
      sessionDate,
    });
  } catch (error) {
    console.warn(`Event feed failed for brand ${brand.name}:`, error);
    return []; // graceful degradation — PDF/DOCX generated without events
  }
}
```

### 5. Error Handling

All adapter errors are caught at the `fetchEventsForBrand()` level:
- **Timeout:** Each adapter uses a 10-second `AbortSignal.timeout(10_000)` on fetch requests
- **HTTP errors:** 4xx/5xx responses log a warning and return `[]`
- **Malformed JSON:** Parse errors caught, logged, return `[]`
- **Rate limiting:** No retry — single attempt, fail gracefully
- **Export continues:** PDF renders without events page; clipboard DOCX renders without events section
- **Logging:** `console.warn` with brand name and error summary (never log API keys)

### 6. Consumer Updates

**`lib/pdf.ts` — `renderEventsPage()`:**
- Currently calls `fetchUpcomingEventDetails()` directly
- Change to call `fetchEventsForBrand(brand, sessionDate)`
- Brand config already available via `resolveBrandConfig()` in the generation route
- The `NormalisedEvent` shape matches the existing `EventDetail` shape — minimal rendering changes
- Skip the events page entirely when the adapter returns `[]` (existing fallback)

**`lib/clipboardDocx.ts` — `eventParagraphs()`:**
- Change to use `fetchEventsForBrand()` instead of `fetchUpcomingEventDetails()`
- **Wire brand config into clipboard generation:** `renderClipboardDocx()` does not currently receive brand config — add `brandConfig` parameter, threaded from the generation route

**`lib/managementApi.ts`:**
- `fetchNextUpcomingEventLinks()` and `fetchNextThreeUpcomingEventLinks()` remain as Anchor-specific helpers (used for bingo card page QR links, separate from the events back page)
- These are not brand-aware for now — they serve a different purpose (per-card decorative QR links)

### 7. Brand Editor UI

**`components/brand/BrandForm.tsx`** — new "Event Feed" section:
- **Feed type** dropdown: "None", "Anchor Management API", "BaronsHub API"
- **API base URL** text input (shown when type ≠ None, required)
- **API key** password input (shown when type ≠ None, required, always masked)
- Conditional display: fields hidden when "None" selected
- Validation: when type ≠ None, both URL and key are required (matches DB constraint)

**Brand API route changes (`app/api/brands/`):**
- **GET responses:** Strip `event_feed_api_key` from all brand responses. Return `event_feed_has_key: boolean` instead so the UI knows whether a key is configured.
- **PUT/POST:** Accept `event_feed_api_key` in request body for saving. If the field is omitted or empty string in an update, preserve the existing key (allows editing other fields without re-entering the key).
- **Update `brandRepo.ts`:** Change `select("*")` to explicit column list excluding `event_feed_api_key` for read operations. Add a separate `getBrandFeedConfig()` function for server-only use that includes the key.

### 8. Security Requirements

- **API key redaction:** `event_feed_api_key` excluded from all brand API GET responses via explicit column selection in `brandRepo.ts`. A `event_feed_has_key: boolean` flag returned instead.
- **URL validation:** `event_feed_base_url` validated as HTTPS URL at save time (Zod `.url().startsWith('https://')`). No private/link-local IP addresses (validate against `10.*`, `172.16-31.*`, `192.168.*`, `127.*`, `169.254.*`, `::1`, `fc00::`).
- **Masked display:** Brand editor shows API key as password input. On load, if key exists, display placeholder dots — never send the actual key value to the client.
- **No logging:** API keys never appear in `console.log`, `console.warn`, or error messages. Adapters log brand name and error type only.
- **Server-only access:** `event_feed_api_key` only read by `getBrandFeedConfig()` in server-side generation code, never exposed through any API endpoint.
- **QR URL validation:** Event URLs embedded in PDFs must be HTTPS or null. Adapters validate before returning.

---

## Implementation Phases

### Phase 1: Database + Types (XS)
- Migration: add 3 columns to `brands` with CHECK constraints
- Migration: set Anchor brand `event_feed_type = 'anchor_management'` (no secrets)
- Update TypeScript `Brand` / `BrandConfig` types for new fields
- Update `BrandRow` type and Zod validation schema
- Add `event_feed_has_key` derived field to brand response type

### Phase 2: Brand API Hardening (S)
- Update `brandRepo.ts`: explicit column list for reads (exclude `event_feed_api_key`)
- Add `getBrandFeedConfig()` for server-only reads (includes key)
- Update brand GET routes to return `event_feed_has_key` boolean
- Update brand PUT/POST to accept and save event feed fields
- Preserve existing key on update when field omitted
- Add Zod validation for URL (HTTPS, no private IPs)

### Phase 3: Adapter Layer (S)
- Create `lib/eventFeed/types.ts` with `NormalisedEvent` and `EventFeedAdapter`
- Create `lib/eventFeed/anchorAdapter.ts` — extract from `lib/managementApi.ts`
- Create `lib/eventFeed/baronshubAdapter.ts` — new adapter
- Create `lib/eventFeed/index.ts` — factory + `fetchEventsForBrand()` with error handling
- Unit tests for both adapters (mock HTTP responses)

### Phase 4: Consumer Updates (S)
- Update `lib/pdf.ts`: use `fetchEventsForBrand(brand, sessionDate)` in `renderEventsPage()`
- Update `lib/clipboardDocx.ts`: add `brandConfig` parameter, use `fetchEventsForBrand()`
- Update `app/api/generate/route.ts`: pass brand config to clipboard generation
- Verify env var fallback works for Anchor (null DB config → reads env vars)

### Phase 5: Brand Editor UI (S)
- Add event feed fields to `BrandForm.tsx` (conditional display, password input)
- Wire form state for feed type, base URL, and API key
- Handle masked key display (show placeholder when key exists, don't send key to client)

### Phase 6: Verification (XS)
- `npm run lint && npm run typecheck && npm run build`
- Manual: generate PDF with Anchor brand → events appear (via env var fallback)
- Manual: generate PDF with brand set to 'none' → events section skipped
- Manual: brand editor saves/loads event feed config, key masked on reload
- Manual: verify brand GET API does not return `event_feed_api_key`

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Anchor API response shape changes | PDF breaks for Anchor | Adapter isolates parsing; existing fallback field logic preserved |
| BaronsHub API unavailable at generation time | Events missing from PDF | Graceful fallback: `fetchEventsForBrand()` catches error, returns `[]`, PDF generated without events |
| API key exposed to client | Security issue | Explicit column exclusion in `brandRepo.ts`; `event_feed_has_key` boolean instead |
| Migration breaks existing sessions | Data loss | Non-destructive ALTER ADD COLUMN; NOT NULL with default; env var fallback preserved |
| Partial feed config saved | Silent generation failure | DB CHECK constraint ensures base_url + api_key present when type ≠ none |
| SSRF via malicious base URL | Server-side request to internal host | Zod validation: HTTPS only, private IP block list |

---

## Alternatives Considered

**A. Keep env vars, add per-brand env var prefix:**
e.g. `BRAND_ANCHOR_API_URL`, `BRAND_BARONS_API_URL`. Rejected: doesn't scale, requires redeployment for new brands.

**B. Generic webhook/URL-only config (no adapter):**
Store just a URL and expect all APIs to return the same shape. Rejected: Anchor and BaronsHub have fundamentally different response formats. An adapter layer is needed.

**C. Store events in Supabase (sync approach):**
Background job pulls events into a local `brand_events` table. Rejected: over-engineered for the current use case (events only needed at PDF generation time, not real-time). Could revisit if guest screens need events.

**D. Separate secrets table:**
Store API keys in a dedicated `brand_secrets` table with tighter access. Rejected for now: adds complexity with no auth system to leverage. The column-exclusion approach is sufficient given the app has no user authentication. Revisit if auth is added.
