# Implementation Plan: Brand-Specific Event Feeds

**Spec:** `tasks/spec-brand-event-feeds.md`
**Complexity:** L (4) — 6 phases, ~15 files touched
**Branch:** `claude/musing-snyder-91248f`

---

## Phase 1: Database + Types (XS)

### 1.1 Create migration file
**File:** `supabase/migrations/20260511120000_add_event_feed_to_brands.sql`
```sql
ALTER TABLE brands
  ADD COLUMN event_feed_type text NOT NULL DEFAULT 'none'
    CHECK (event_feed_type IN ('anchor_management', 'baronshub', 'none')),
  ADD COLUMN event_feed_base_url text,
  ADD COLUMN event_feed_api_key text;

-- Anchor adapter has env var fallback, so allow null url/key for transition period
ALTER TABLE brands
  ADD CONSTRAINT event_feed_config_complete CHECK (
    event_feed_type = 'none'
    OR event_feed_type = 'anchor_management'
    OR (event_feed_base_url IS NOT NULL AND event_feed_api_key IS NOT NULL)
  );

-- Mark existing default brand as anchor_management (no secrets in SQL)
UPDATE brands SET event_feed_type = 'anchor_management' WHERE is_default = true;
```

### 1.2 Update Brand types
**File:** `lib/brands/types.ts`
- Add to `Brand` interface: `event_feed_type`, `event_feed_base_url` (types from DB)
- Add `event_feed_has_key: boolean` derived field for API responses
- Do NOT add `event_feed_api_key` to the client-facing type
- Create `BrandFeedConfig` type for server-only use (includes key)
- Update `qrItemSchema` / brand Zod schema with new fields
- Add `eventFeedTypeSchema = z.enum(['anchor_management', 'baronshub', 'none'])`
- Add URL validation: `z.string().url().startsWith('https://').or(z.literal(''))`

### 1.3 Checkpoint: verify migration + types compile
- `npm run typecheck`

---

## Phase 2: Brand API Hardening (S)

### 2.1 Update brandRepo.ts — explicit column selection
**File:** `lib/brands/brandRepo.ts`
- Replace `select("*")` with explicit column list excluding `event_feed_api_key`
- Add `getBrandFeedConfig(brandId: string)` — server-only function that returns full config including key, with env var fallback for Anchor
- Update `rowToBrand()` to map new columns, add `event_feed_has_key: row.event_feed_api_key != null`

### 2.2 Update brand API routes
**File:** `app/api/brands/route.ts`
- GET: already uses repo (now returns hardened columns)
- POST: accept `event_feed_type`, `event_feed_base_url`, `event_feed_api_key` in body
- Validate with Zod: URL must be HTTPS, no private IPs

**File:** `app/api/brands/[id]/route.ts`
- GET: already uses repo (now returns hardened columns)
- PUT: accept event feed fields; if `event_feed_api_key` is empty/omitted, preserve existing key
- Validate URL + IP restrictions

### 2.3 Add private IP validation helper
**File:** `lib/brands/validation.ts` (new)
- `isPrivateUrl(url: string): boolean` — checks against private/link-local IP ranges
- Used in Zod refinement for `event_feed_base_url`

### 2.4 Checkpoint: verify API responses don't leak key
- `npm run typecheck && npm run build`

---

## Phase 3: Adapter Layer (S)

### 3.1 Create adapter types
**File:** `lib/eventFeed/types.ts` (new)
- `NormalisedEvent` interface (matches existing `EventDetail` shape)
- `EventFeedAdapter` interface with `fetchUpcomingEvents()`
- `EventFeedConfig` type

### 3.2 Create Anchor adapter
**File:** `lib/eventFeed/anchorAdapter.ts` (new)
- Extract event fetching + normalisation logic from `lib/managementApi.ts`
- `fetchUpcomingEventDetails()` logic → `AnchorAdapter.fetchUpcomingEvents()`
- Preserve all field name fallbacks, date parsing, price extraction
- 10s timeout via `AbortSignal.timeout(10_000)`
- Env var fallback: if `baseUrl`/`apiKey` empty, read `MANAGEMENT_API_*` env vars
- Construct event URLs from `websiteUrl` + slug

### 3.3 Create BaronsHub adapter
**File:** `lib/eventFeed/baronshubAdapter.ts` (new)
- Call `GET /api/v1/events?from=ISO&limit=N`
- Bearer token auth
- Map `PublicEvent` → `NormalisedEvent`:
  - `title` → `name`
  - `startAt` → date fields via `dateUtils` (Europe/London)
  - `ticketPrice` → formatted price string
  - `bookingUrl` or `websiteUrl/events/slug` → `eventUrl`
  - Null-safe handling for all optional fields
- 10s timeout
- Single page fetch (no cursor following)

### 3.4 Create factory + entry point
**File:** `lib/eventFeed/index.ts` (new)
- `createEventFeedAdapter(config)` factory
- `fetchEventsForBrand(brand, sessionDate, limit?)` — the main entry point
  - Returns `[]` for `event_feed_type === 'none'`
  - Catches all errors, logs warning (no key in logs), returns `[]`
  - Loads feed config via `getBrandFeedConfig()` from brandRepo

### 3.5 Checkpoint
- `npm run typecheck`

---

## Phase 4: Consumer Updates (S)

### 4.1 Update PDF generation
**File:** `lib/pdf.ts`
- In `renderEventsPage()`: replace `fetchUpcomingEventDetails()` with `fetchEventsForBrand(brand, sessionDate)`
- Brand config already available from the caller
- `NormalisedEvent` is shape-compatible with `EventDetail` — adjust any field name differences
- Keep existing empty-array fallback (skip events page)

### 4.2 Update clipboard DOCX generation
**File:** `lib/clipboardDocx.ts`
- Add `brandConfig` parameter to `renderClipboardDocx()` (or the relevant entry function)
- In `eventParagraphs()`: replace `fetchUpcomingEventDetails()` with `fetchEventsForBrand(brand, sessionDate)`

### 4.3 Wire brand config into clipboard route
**File:** `app/api/generate/route.ts`
- Pass `brandConfig` to `renderClipboardDocx()` call (currently not passed)
- Brand config already loaded via `resolveBrandConfig(brandId)` earlier in the route

### 4.4 Checkpoint
- `npm run typecheck && npm run build`

---

## Phase 5: Brand Editor UI (S)

### 5.1 Add event feed fields to BrandForm
**File:** `components/brand/BrandForm.tsx`
- New section: "Event Feed Configuration"
- Feed type dropdown: None / Anchor Management API / BaronsHub API
- Conditional fields (shown when type ≠ none):
  - API base URL (text input, required, HTTPS validated)
  - API key (password input, required, masked)
- On load: if `event_feed_has_key` is true, show placeholder in password field
- On save: if password field unchanged (still placeholder), omit key from payload to preserve existing
- Form validation matches DB constraints (both URL and key required when type ≠ none)

### 5.2 Checkpoint
- `npm run lint && npm run typecheck && npm run build`

---

## Phase 6: Verification (XS)

### 6.1 Full verification pipeline
```bash
npm run lint
npm run typecheck
npm run build
```

### 6.2 Manual verification checklist
- [ ] Brand editor: create brand with feed type "None" → no feed fields shown
- [ ] Brand editor: select "Anchor Management API" → URL + key fields appear, required
- [ ] Brand editor: save with API key → reload shows masked placeholder, `event_feed_has_key: true`
- [ ] Brand GET API: response includes `event_feed_has_key` but NOT `event_feed_api_key`
- [ ] PDF generation: Anchor brand → events appear (via env var fallback)
- [ ] PDF generation: brand with type "none" → no events page
- [ ] Clipboard DOCX: Anchor brand → upcoming events section populated
