# Adversarial Review: Brand-Specific Event Feeds Spec

**Date:** 2026-05-11
**Mode:** A (Adversarial Challenge — Spec Review)
**Scope:** `tasks/spec-brand-event-feeds.md`
**Pack:** `tasks/codex-qa-review/2026-05-11-brand-event-feeds-spec-review-pack.md`
**Reviewers:** Integration & Architecture, Security & Data Risk, Workflow & Failure-Path
**Note:** Assumption Breaker reviewed existing code changes instead of the spec — findings excluded.

## Executive Summary

The adapter abstraction is sound and the `NormalisedEvent` contract preserves existing rendering consumers cleanly. However, the spec has **3 blocking gaps** that must be resolved before implementation: (1) API key security model is undefined — keys stored as plaintext with no redaction, SSRF, or access control requirements, (2) feed failure handling is unspecified — a configured feed that times out or errors can break PDF/DOCX generation entirely, and (3) the migration path for seeding The Anchor's existing config is left as TBD, risking a backwards-compatibility break.

## What Appears Solid

- **Adapter isolation** is the right call — keeping provider-specific parsing in `lib/eventFeed/*` instead of branching in `lib/pdf.ts` and `lib/clipboardDocx.ts`
- **`NormalisedEvent` shape** aligns with existing `EventDetail`, minimising downstream rendering changes
- **On-demand fetch** preserved — no premature caching or background sync
- **No-feed graceful path** — null/none feed types correctly skip the events section
- **Auth header differences** between Anchor and BaronsHub explicitly called out, reducing credential cross-contamination risk
- **Pagination models** (offset vs cursor) correctly identified per provider

## Critical Risks (Blocking)

### RISK-1: API Key Security Model Undefined
**Severity:** High | **Source:** ARCH-002, SEC-001, SEC-002, SEC-003

The spec places `event_feed_api_key` as a regular text column on the shared `brands` table without defining:
- **Redaction:** Which brand API responses must strip the key (all public reads? admin reads?)
- **SSRF protection:** `event_feed_base_url` is free-text — an admin could point it at an internal metadata endpoint or attacker-controlled host, and the server would make an authenticated request
- **Access control:** No auth/role requirement specified for who can view or mutate feed settings
- **Encryption at rest:** Beyond Supabase disk encryption, no application-level protection

**Evidence:** `tasks/spec-brand-event-feeds.md:86-94` adds 4 columns including api_key with no constraints beyond CHECK on feed_type.

**Resolution required:** Define the secret boundary — at minimum: server-only column access, explicit exclusion from all client-facing brand responses, URL validation (HTTPS only, no private IPs), and role requirement for brand feed mutation.

### RISK-2: No Feed Failure Handling
**Severity:** High | **Source:** WF-001, WF-006

The spec defines graceful behaviour for brands with **no** feed, but not for brands whose configured feed **fails** at runtime (timeout, 5xx, rate limit, malformed JSON). A BaronsHub 503 during PDF generation could crash the export entirely.

**Evidence:** Consumer updates at `tasks/spec-brand-event-feeds.md:148` say to skip events when the adapter returns empty, but don't address adapter throws.

**Resolution required:** Specify per-adapter timeout, try/catch semantics, and that export generation must continue with a logged warning and no events section when a feed request fails. Also specify null-safe mapping for optional BaronsHub fields (`bookingUrl`, `ticketPrice`, `venue` can all be null).

### RISK-3: Migration Path Unresolved
**Severity:** High | **Source:** WF-002, SEC-004

The migration seeding for The Anchor is explicitly TBD. Two risks: (1) committing real API tokens in migration SQL, which lands in git history permanently, and (2) if the migration doesn't seed correctly, The Anchor loses its events section, breaking backwards compatibility (success criterion 4).

**Evidence:** `tasks/spec-brand-event-feeds.md:100-102` says "Seed Anchor config from env vars or hardcode? TBD".

**Resolution required:** Decide the migration strategy. Recommended: migration creates the columns with NULL defaults; a separate one-time admin action (UI or script) sets The Anchor's feed config using env var values. Env var fallback in code preserved until DB config is confirmed populated.

## Spec Defects

### SPEC-1: Success Criterion 7 Overpromises
**Severity:** Medium | **Confidence:** High | **Source:** ARCH-001

Criterion 7 says "Adding a future customer's feed requires only brand config, no code changes." But the architecture hard-codes `'anchor_management' | 'baronshub'` with a switch/factory pattern. A genuinely new API shape requires a new adapter class.

**Fix:** Revise to "Adding a future customer using an existing feed provider requires only brand config. New providers require a new adapter."

### SPEC-2: Null vs 'none' Ambiguity
**Severity:** Medium | **Confidence:** High | **Source:** ARCH-005, WF-003

Both `NULL` and `'none'` represent "no feed" — two representations for the same state. This complicates queries, form defaults, and validation.

**Fix:** Pick one. Recommended: default `event_feed_type` to `'none'` (NOT NULL) so all brand rows have an explicit value and queries don't need `IS NULL OR = 'none'`.

### SPEC-3: `event_feed_public_base_url` Overlaps `website_url`
**Severity:** Medium | **Confidence:** High | **Source:** ARCH-004

The brands table already has `website_url`. The spec adds `event_feed_public_base_url` for constructing event links. For Barons, the BaronsHub discovery notes it should be derived from `brand.website_url`. Storing the same concept in two places creates drift.

**Fix:** Specify precedence — `event_feed_public_base_url` overrides `website_url` for event link construction when set, otherwise falls back to `website_url`. Or drop `event_feed_public_base_url` and always use `website_url` with a per-adapter path template.

### SPEC-4: Partial Feed Config Not Validated
**Severity:** Medium | **Confidence:** High | **Source:** WF-003

An admin could set `event_feed_type='baronshub'` but leave `event_feed_base_url` or `event_feed_api_key` null. This config would pass migration constraints but fail at PDF generation time.

**Fix:** Add DB CHECK constraint or application-level validation: when `event_feed_type` is not 'none', all three config fields must be non-null.

### SPEC-5: Date/Timezone Conversion Unspecified
**Severity:** Medium | **Confidence:** Medium | **Source:** WF-005

The adapter contract uses `afterDate` as `YYYY-MM-DD` but BaronsHub expects ISO datetimes. No timezone conversion specified. The Anchor's existing code uses Europe/London (per project conventions), but this isn't stated in the adapter contract.

**Fix:** Specify that adapters convert `afterDate` to ISO datetime in Europe/London timezone. Reference the project's `dateUtils` convention.

## Unproven Assumptions

| # | Assumption | What Would Confirm |
|---|-----------|-------------------|
| 1 | Brand config (including new feed fields) is already available in PDF/DOCX generation context | Read `app/api/generate/route.ts` and verify `BrandConfig` is loaded server-side before calling `renderEventsPage()` |
| 2 | Existing brand API routes already strip sensitive fields | Read `app/api/brands/route.ts` and `app/api/brands/[id]/route.ts` to check if they select specific columns or return full rows |
| 3 | Brand editor is admin-only | Check if brand edit routes have any auth/role checks |
| 4 | BaronsHub production URL is known | Ask the user for the production base URL |

## Recommended Fix Order

1. **RISK-1** (security model) — foundational; affects DB schema, API routes, and UI design
2. **RISK-3** (migration strategy) — must be decided before writing SQL
3. **SPEC-2** (null vs none) — affects migration DDL
4. **SPEC-4** (partial config validation) — affects migration CHECK constraints
5. **SPEC-3** (public URL overlap) — affects column count in migration
6. **RISK-2** (failure handling) — affects adapter interface contract
7. **SPEC-1** (criterion 7 wording) — trivial text fix
8. **SPEC-5** (timezone) — affects adapter implementation detail

## Minor Observations

- WF-004: No pagination limits in adapter contract — single-page fetch with `limit` param is likely sufficient for 12-event PDF, but spec should state adapters fetch one page only
- SEC-005: QR code URLs from `event_feed_public_base_url` should be validated as HTTPS before embedding in PDFs
- ARCH-003: Verify brand config availability at generation time before implementing Phase 3
