# Claude Hand-Off Brief: Brand Event Feeds (Final)

**Generated:** 2026-05-11
**Review mode:** B (Code Review)
**Overall risk:** Medium (3 blocking defects in new code, several pre-existing elevated risks)

## DO NOT REWRITE
- Adapter pattern and factory in `lib/eventFeed/` — architecturally sound
- `rowToBrand()` secret stripping in `lib/brands/brandRepo.ts` — correct defense
- `fetchEventsForBrand()` error handling in `lib/eventFeed/index.ts` — intentional graceful degradation
- Both adapters: `AbortSignal.timeout(10_000)` confirmed in anchor (line 314) and BaronsHub (line 168)
- Migration SQL and CHECK constraints — correct
- Brand editor UI layout and conditional field rendering — correct
- Consumer updates in `generate/route.ts`, `clipboardDocx.ts`, `pdf.ts` — correct
- POST route API key trimming, length validation, and completeness checks — correct
- BaronsHub adapter response type (`meta.nextCursor`) — matches actual API

## IMPLEMENTATION CHANGES REQUIRED

- [ ] **IMPL-001 [BLOCKING]:** `lib/brands/brandRepo.ts` — In `getBrandFeedConfig()`, when `event_feed_type === "anchor_management"` and a custom `event_feed_base_url` is set (differs from env default), do NOT fall back to `MANAGEMENT_API_TOKEN`. Only use the env-var token when the base URL is also the env-var default or null. This prevents the global token being sent to an attacker-controlled URL.

- [ ] **IMPL-002 [BLOCKING]:** `app/api/brands/[id]/route.ts` — When `event_feed_type` is being changed:
  - If changed to `"none"`: explicitly set `event_feed_api_key: null` in `dbInput`
  - If changed from one provider to another (e.g., `anchor_management` → `baronshub`): also set `event_feed_api_key: null` unless a new key is provided
  - This requires fetching the current brand to compare `event_feed_type` before/after. Use `getBrand(id)` which is already called implicitly via `updateBrand`.

- [ ] **IMPL-003 [BLOCKING]:** `app/api/brands/[id]/route.ts` — Add completeness validation matching POST: when `event_feed_type` is not `none` or `anchor_management`, require both `event_feed_base_url` (non-empty after trim) and `event_feed_api_key` (non-empty after trim, or `brand.event_feed_has_key` true). Return 400 with clear message if either is missing.

## ASSUMPTIONS TO RESOLVE
- [ ] **Product decision (WF-001):** Should the generate response include a warning when events were expected but the feed returned empty/errored? Currently silently returns empty. Not blocking for merge.

## REPO CONVENTIONS TO PRESERVE
- Brand routes use service-role Supabase client via `getSupabaseClient()` — no auth check pattern exists currently (pre-existing gap)
- `BrandInput` Zod schema deliberately excludes `event_feed_api_key` — the key is sent as a raw body field outside Zod
- `rowToBrand()` is the single defense layer preventing key leakage — do not add `event_feed_api_key` to the `Brand` type
- PUT route intentionally preserves existing key when blank input is sent (for normal edits where user doesn't want to re-enter the key)

## RE-REVIEW REQUIRED AFTER FIXES
- [ ] IMPL-001: verify that an anchor brand with a custom URL but no stored key does NOT send the env token
- [ ] IMPL-002: verify that switching feed type to `"none"` clears `event_feed_has_key` to false
- [ ] IMPL-002: verify that switching from one provider to another requires re-entering the key
- [ ] IMPL-003: verify that PUT returns 400 (not 500) when baronshub type is set without URL/key

## REVISION PROMPT

Fix the three blocking defects:

1. In `lib/brands/brandRepo.ts`, update `getBrandFeedConfig()` to only use the `MANAGEMENT_API_TOKEN` env-var fallback when the base URL is ALSO from env vars (or null). If a custom `event_feed_base_url` is stored for an `anchor_management` brand, require a per-brand key — return null (disabling the feed) if no key is stored:
   ```
   // For anchor_management: env token only pairs with env URL
   if (type === "anchor_management") {
     const envBaseUrl = process.env.MANAGEMENT_API_BASE_URL ?? null;
     const storedUrl = row.event_feed_base_url;
     const storedKey = row.event_feed_api_key;
     const baseUrl = storedUrl || envBaseUrl;
     const apiKey = storedKey || (storedUrl && storedUrl !== envBaseUrl ? null : (process.env.MANAGEMENT_API_TOKEN ?? null));
     if (!baseUrl || !apiKey) return null;
     ...
   }
   ```

2. In `app/api/brands/[id]/route.ts`, fetch the current brand to detect feed type changes and clear the key when appropriate:
   ```
   const existingBrand = await getBrand(id);
   if (!existingBrand) return 404;

   // Clear key when feed is disabled
   if (parsed.data.event_feed_type === "none" && existingBrand.event_feed_type !== "none") {
     dbInput.event_feed_api_key = null;
   }
   // Clear key when provider changes (unless new key provided)
   if (parsed.data.event_feed_type && parsed.data.event_feed_type !== existingBrand.event_feed_type && !rawApiKey) {
     dbInput.event_feed_api_key = null;
   }
   ```

3. In `app/api/brands/[id]/route.ts`, add completeness validation for non-anchor feeds (mirror POST logic):
   ```
   if (feedType && feedType !== "none" && feedType !== "anchor_management") {
     const effectiveUrl = parsed.data.event_feed_base_url ?? existingBrand.event_feed_base_url;
     const effectiveHasKey = rawApiKey || existingBrand.event_feed_has_key;
     if (!effectiveUrl?.trim()) return 400 "event_feed_base_url is required";
     if (!effectiveHasKey) return 400 "event_feed_api_key is required";
   }
   ```

Run `npm run lint && npx tsc --noEmit && npm run build` after changes.
