# Adversarial Review: After Hours Redesign — Phase 0 (Foundations & Tokens)

**Date:** 2026-05-29
**Mode:** B (Code Review)
**Scope:** Phase 0 code diff `7a3a555..HEAD` (brand data layer, tokens, BrandProvider, next/font, dark UI primitives, additive migration)
**Pack:** `tasks/codex-qa-review/2026-05-29-after-hours-phase-0-review-pack.md`
**Reviewers:** Assumption Breaker, Integration & Architecture, Workflow & Failure-Path, Security & Data Risk (all fresh, Codex 0.125.0)

## Executive summary
Phase 0's introduced code is **sound — no blocking regressions**. `tsc`/lint/`test:unit`(37)/`test:py`(7)/build are green. The reviewers raised **2 genuine Phase-0 caveats** (a deploy-ordering requirement for the migration, and an interim-UI readability gap on not-yet-restyled admin pages) and **5 pre-existing issues** in brand/event-feed code that Phase 0 only touched type-wise. None block committing Phase 0; the most important action is operational (apply the migration before any brand write sends the new fields).

## What appears solid (do not rewrite)
- **Allowlisted font system** (`lib/brands/fonts.ts`): all dynamic Google-Fonts links route through `SUPPORTED_BRAND_FONTS`; no arbitrary URL injection. (Confirmed by AB + Security empty-categories.)
- **Additive migration**: `ADD COLUMN IF NOT EXISTS` + backfill, `font_family` retained — non-destructive (Integration confirmed).
- **Read-side safety with migration unapplied**: absent columns resolve to `undefined` → font defaults; no read crash (AB confirmed).
- **`.optional()` schema fix**: correct call — keeps the existing `BrandForm` consumer compiling and is semantically right (fonts are optional on input).
- **BrandProvider remains the sole page-scoped owner** of document brand tokens (Integration confirmed) — A7's "no root Supabase fetch" decision held.

## Phase-0-introduced findings

### CR-1 (Medium→operational) — Migration must precede any write of the new brand fields
*Reviewers: AB-001, ARCH-001, WF-001 (3 independent hits).* `CreateBrandInput` now permits `font_display`/`font_body`/`event_logo_url`, and `createBrand`/`updateBrand` spread `input` into `.insert/.update` (`lib/brands/brandRepo.ts:163,181`). If a caller sends these before the columns exist, PostgREST rejects the whole save.
**Reality for Phase 0:** no current caller sends them — `BrandForm` has no UI for them until Phase 5, and `.optional()` means absent keys aren't forwarded. So this does **not** manifest in Phase 0. It is a **deploy-ordering requirement**: apply `20260529120000_*` before Phase 5 (or before any API/admin path writes these fields).

### CR-2 (Medium) — Interim UI readability on not-yet-restyled admin pages
*Reviewer: AB-002.* Dark primitives (`Button` secondary = `text-cream bg-white/[0.06]`) + dark `body` (`bg-ink`) now apply globally, but `/host`, `/prep`, `/brands` still pass `AppHeader variant="light"` and contain light-assuming page bodies (restyled in Phases 4–5). A secondary Button inside the light header renders cream-on-white (low contrast); page bodies mix dark/light until migrated.
**Status:** known and documented in the plan ("intra-phase visual transient"). Not a functional break. **Recommendation:** land Phases 2–5 before deploying to production, *or* pull the admin-page header/body migration forward. Do **not** treat Phase 0 as a standalone production deploy.

### CR-3 (Low) — BrandProvider cleanup is unconditional
*Reviewer: AB-003.* `BrandProvider` cleanup removes all brand vars + font links without checking ownership. **Not triggered** by the current single-page-scoped provider architecture (one provider per document). Becomes relevant only if two providers ever co-mount in one document (not the case in Phases 0–3, which use separate routes/tabs). Consider a guard if that changes.

### CR-4 (Low) — Font `category` not enforced in resolution
*Reviewer: AB-004.* `SupportedFont.category` (display/body/both) exists but `resolveSupportedFont` only checks membership, so a body-only font can be chosen as display. Cosmetic. Enforce in the Phase 5 brand-form validation if desired.

## Pre-existing issues (NOT Phase 0 regressions — flagged for the backlog)
These live in code Phase 0 changed only by type (or not at all); verify against base before attributing.
- **PRE-1 (Security, Medium→High) — Legacy logo path traversal.** `fetchBrandLogoPngBytes` reads any `/`-prefixed key via `path.join(cwd,"public",key)` with no confinement (`brandStorage.ts:46`) → `/../package.json` escapes `public`. Pre-existing; genuinely worth fixing. *(Flagged as a separate task.)*
- **PRE-2 (Security, Medium) — Non-atomic default-brand switch** (`brandRepo.ts:170,191`) + `getDefaultBrand().maybeSingle()`. Largely mitigated by the existing `idx_brands_single_default` unique partial index (DB blocks two defaults), but a failed write after unset can leave none. Pre-existing.
- **PRE-3 (Security, Medium) — `event_feed_base_url` uses generic `.url()`**, not the HTTPS-only `eventFeedBaseUrlSchema` (`types.ts:35`). Mitigated at runtime by `validateEventFeedUrl` (SSRF guard) in the API routes. Pre-existing.
- **PRE-4 (Security, Low) — BaronsHub accepts HTTP booking URLs.** This is *intentional* — base commit `c0d3014` is literally "fix: accept http booking URLs from BaronsHub API". Documented by the converted test. No action.
- **PRE-5 (Data integrity, Low) — WEBP stored with `.jpg` extension** (`brandStorage.ts:24`). Pre-existing; harmless rendering-wise but mislabels content-type. Worth tidying when the event-logo upload UI lands (Phase 5).

## Recommended fix order
1. **Operational (before Phase 5 / prod):** apply migration `20260529120000_*` (CR-1).
2. **Release sequencing:** land Phases 2–5 before prod, or accept/repair the interim admin UI (CR-2).
3. **Backlog (pre-existing security):** PRE-1 path-traversal confinement; then PRE-2/PRE-3 hardening.
4. **Phase 5 polish:** font category enforcement (CR-4), WEBP extension (PRE-5).

## Minor observations
- BrandProvider could ref-count global tokens if multi-provider mounting is ever introduced (CR-3).
