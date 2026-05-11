# Claude Hand-Off Brief: Brand Event Feeds Implementation

**Generated:** 2026-05-11
**Review mode:** B (Code Review)
**Overall risk:** Medium (1 blocking defect in new code, several advisory improvements)

## DO NOT REWRITE
- Adapter pattern and factory in `lib/eventFeed/` — architecturally sound
- `rowToBrand()` secret stripping in `lib/brands/brandRepo.ts` — correct defense
- `fetchEventsForBrand()` error handling in `lib/eventFeed/index.ts` — intentional graceful degradation
- Migration SQL and CHECK constraints — correct
- Brand editor UI layout and conditional field rendering — correct
- Consumer updates in `generate/route.ts`, `clipboardDocx.ts`, `pdf.ts` — correct

## IMPLEMENTATION CHANGES REQUIRED

- [ ] **IMPL-001 [BLOCKING]:** `components/brand/BrandForm.tsx:137-146` — Skip API key requirement for `anchor_management` type. Change the validation to: `if (eventFeedType !== "none" && eventFeedType !== "anchor_management") { ... require key ... }` OR allow anchor_management to save without a key since `getBrandFeedConfig` falls back to env vars.

- [ ] **IMPL-002:** `app/api/brands/route.ts:52` and `app/api/brands/[id]/route.ts:58` — Trim `event_feed_api_key` before storing. Reject whitespace-only or excessively long keys (>500 chars). Example: `const apiKey = typeof body.event_feed_api_key === "string" ? body.event_feed_api_key.trim() : null; if (apiKey !== null && (apiKey === "" || apiKey.length > 500)) return 400;`

- [ ] **IMPL-003:** `app/api/brands/route.ts:39-47` and `app/api/brands/[id]/route.ts:43-53` — When `event_feed_type` is `baronshub`, require both `event_feed_base_url` (non-empty, valid HTTPS) AND `event_feed_api_key` (non-empty after trim) at the route level. Return 400 with clear message if either is missing. This mirrors the DB CHECK constraint.

- [ ] **ARCH-001:** `components/brand/BrandForm.tsx` — When `eventFeedType` changes from the brand's stored `brand.event_feed_type` to a different non-none value, clear `eventFeedApiKey` and set `eventFeedApiKeyTouched = true` to force re-entry. Add an `onChange` handler to the feed type select that resets the key state when provider changes.

## ASSUMPTIONS TO RESOLVE
- [ ] **SEC-004/Product decision:** When setting feed type to "none", should the stored API key be cleared? If yes, update the PUT route to set `event_feed_api_key: null` when `event_feed_type === "none"`.

## REPO CONVENTIONS TO PRESERVE
- Brand routes use service-role Supabase client via `getSupabaseClient()` — no auth check pattern exists on these routes currently
- `BrandInput` Zod schema deliberately excludes `event_feed_api_key` — the key is sent as a raw body field outside Zod
- `rowToBrand()` is the single defense layer preventing key leakage — do not add `event_feed_api_key` to the `Brand` type

## RE-REVIEW REQUIRED AFTER FIXES
- [ ] IMPL-001: verify Anchor brand can be edited without entering a key after the form fix
- [ ] IMPL-002: verify whitespace-only key is rejected with a 400

## REVISION PROMPT

Fix the blocking defect and the two most important advisory findings:

1. In `components/brand/BrandForm.tsx`, update the API key validation in `handleSave()` (around line 137) to skip the key requirement for `anchor_management` feed type:
   ```
   if (eventFeedType !== "none" && eventFeedType !== "anchor_management") {
     if (!brand?.event_feed_has_key && !eventFeedApiKey.trim()) {
       setError("API key is required for new event feed configurations.");
       return;
     }
   }
   ```

2. In `app/api/brands/route.ts` POST handler, trim and validate the API key:
   ```
   const rawKey = typeof body.event_feed_api_key === "string" ? body.event_feed_api_key.trim() : null;
   const dbInput = { ...parsed.data, event_feed_api_key: rawKey || null };
   ```

3. In `app/api/brands/[id]/route.ts` PUT handler, same trim treatment:
   ```
   if (typeof body.event_feed_api_key === "string") {
     const trimmed = body.event_feed_api_key.trim();
     if (trimmed) dbInput.event_feed_api_key = trimmed;
   }
   ```

Run `npm run lint && npx tsc --noEmit && npm run build` after changes.
