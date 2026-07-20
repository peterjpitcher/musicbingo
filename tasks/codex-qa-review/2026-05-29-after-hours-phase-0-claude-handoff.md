# Claude Hand-Off Brief: After Hours Phase 0

**Generated:** 2026-05-29
**Review mode:** B (Code Review)
**Overall risk:** Low (no blocking findings on Phase-0-introduced code)

## DO NOT REWRITE
- `lib/brands/fonts.ts` allowlist + resolvers (font injection is safe by design).
- The additive migration `20260529120000_*` (non-destructive, `font_family` retained).
- The `.optional()` schema decision for the three new brand fields.
- `BrandProvider` page-scoped token injection; `app/layout.tsx` next/font wiring; the globals/Tailwind token set.
- The dark UI primitive class strings — they match the design.

## SPEC / PLAN REVISION
- [x] Soften "no user-facing behaviour change" → "no functional change; admin pages enter a visual transition until restyled in Phases 4–5" (CR-2). *(Note added to delivery; reflect in spec §12 if desired.)*

## IMPLEMENTATION CHANGES REQUIRED
*(None are blocking for Phase 0. All below are sequenced for later phases.)*
- [ ] **CR-1 / Phase 5 gate:** before `BrandForm` (Phase 5) submits `font_display`/`font_body`/`event_logo_url`, ensure migration `20260529120000_*` is applied. Optionally add a defensive guard in `createBrand`/`updateBrand` that strips `undefined` new-column keys (low value — `.optional()` already prevents forwarding absent keys).
- [ ] **CR-2 / Phases 2–5:** as each admin page is rebuilt, drop `AppHeader variant="light"` (A6 retires the light theme) and dark-restyle page bodies so dark primitives sit on dark surfaces.
- [ ] **CR-4 / Phase 5:** enforce `SupportedFont.category` when validating brand `font_display`/`font_body` in the brand form.

## PRE-EXISTING ITEMS TO RESOLVE (backlog, not Phase 0)
- [ ] **PRE-1 (security):** confine legacy `/`-prefixed logo keys in `fetchBrandLogoPngBytes` (`lib/brands/brandStorage.ts:46`) to the `public/` dir (reject `..`). *(Spun off as a separate task.)*
- [ ] **PRE-2:** make default-brand switch atomic (single RPC/transaction) or rely on the existing unique index + handle the constraint error in `createBrand`/`updateBrand`.
- [ ] **PRE-3:** use `eventFeedBaseUrlSchema` (HTTPS-only) for `event_feed_base_url` in `brandSchema`.
- [ ] **PRE-5:** store WEBP uploads with a `.webp` extension in `uploadBrandLogo`.

## REPO CONVENTIONS TO PRESERVE
- Brand secrets stay server-only (`event_feed_api_key` → client sees only `event_feed_has_key`).
- RGB-channel tokens (`R G B`) for Tailwind alpha; hex vars for direct use — keep both forms.
- Migrations additive; never drop `font_family` without the function/trigger audit.

## RE-REVIEW REQUIRED AFTER FIXES
- [ ] CR-1: re-review brand create/update once Phase 5's form submits the new fields (confirm migration applied first).
- [ ] CR-2: visual re-check of `/host`, `/prep`, `/brands` after Phases 4–5.

## REVISION PROMPT (for later phases — not now)
"Before implementing Phase 5 (Brands & Venues): (1) confirm migration 20260529120000 is applied to all target environments; (2) when BrandForm gains font_display/font_body/event_logo_url inputs, validate them against SUPPORTED_BRAND_FONTS and enforce category; (3) confine legacy logo path reads. When implementing Phases 2–5, remove AppHeader variant=light from each rebuilt page."
