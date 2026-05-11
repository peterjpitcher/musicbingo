# Adversarial Review: Brand Event Feeds (Final)

**Date:** 2026-05-11
**Mode:** B (Code Review)
**Scope:** Brand event feed columns, adapter layer, API routes, generate route, brand editor UI, migration
**Pack:** tasks/codex-qa-review/2026-05-11-brand-event-feeds-final-review-pack.md
**Reviewers:** Assumption Breaker, Integration & Architecture, Workflow & Failure-Path, Security & Data Risk

## Executive Summary

Four Codex reviewers examined the complete brand event feed implementation — migration, repository, API routes, adapter layer, consumers, and UI. The adapter pattern, secret redaction boundary, and graceful degradation are architecturally sound. Three blocking implementation defects were found in the new code: an env-var token leakage vector when custom anchor URLs are configured, inability to clear stale API keys on feed disable/switch, and missing PUT route validation parity with POST. Several advisory findings around SSRF depth and pre-existing auth gaps are worth addressing in follow-up work.

## What Appears Solid

- **API key never leaked to clients:** `rowToBrand()` maps `event_feed_api_key` to `event_feed_has_key: boolean` — confirmed across all brand read paths (`lib/brands/brandRepo.ts:24`)
- **Server-side credential resolution:** `getBrandFeedConfig` fetches full feed config server-side; API keys never transit through the client (`app/api/generate/route.ts:325`)
- **Adapter isolation:** PDF/clipboard consumers depend only on `NormalisedEvent[]`, never on provider-specific shapes
- **Graceful degradation:** `fetchEventsForBrand()` catches all adapter errors, logs no secrets, returns `[]` — generation continues (`lib/eventFeed/index.ts:43`)
- **Both adapters have timeouts:** `AbortSignal.timeout(10_000)` confirmed in both anchor (`anchorAdapter.ts:314`) and BaronsHub (`baronshubAdapter.ts:168`) adapters
- **Input trimming on create:** POST route trims and length-checks `event_feed_api_key` before persistence (`app/api/brands/route.ts:36`)
- **BrandForm validation:** Form validates create/edit flow and surfaces API errors rather than swallowing them
- **BaronsHub response type:** Adapter's `BaronsHubResponse` correctly matches actual API response shape (`meta.nextCursor`)

## Critical Risks

None at truly critical severity after analysis. AB-001 below is high severity, not critical, because exploitation requires the pre-existing auth gap (SEC-001/002) to be open.

## Implementation Defects

### IMPL-001 [BLOCKING] — Env token leakage via custom anchor base URL
**Severity:** High | **Confidence:** Medium | **Sources:** AB-001

`getBrandFeedConfig` independently falls back `baseUrl` and `apiKey` for `anchor_management` feeds. If an operator (or unauthenticated attacker via the pre-existing auth gap) sets a custom `event_feed_base_url` while leaving no per-brand key, the global `MANAGEMENT_API_TOKEN` from env vars is sent as the Bearer token to the custom URL. This is a credential leakage vector.

**Fix:** When `event_feed_type === "anchor_management"`, only use the env-var token fallback when the base URL is ALSO the env-var default (or null). If a custom base URL is set, require a per-brand key.

### IMPL-002 [BLOCKING] — Stale API key not cleared on feed disable or provider switch
**Severity:** High | **Confidence:** High | **Sources:** AB-002, ARCH-001, WF-001, SEC-005 (flagged by all 4 reviewers)

The PUT route only includes `event_feed_api_key` in the DB update when a non-empty key is submitted. When a user disables the feed (`event_feed_type: "none"`) or switches providers, the old key persists in the database. This leaves `event_feed_has_key: true` for an inactive or mismatched feed, and the old credential can be silently reused if the feed type is later changed back.

**Fix:** When `event_feed_type` changes to `"none"`, explicitly set `event_feed_api_key: null` in the DB update. When the provider changes from one type to another, also clear the key and require re-entry.

### IMPL-003 [BLOCKING] — PUT route missing completeness validation
**Severity:** Medium | **Confidence:** High | **Sources:** AB-003, WF-002

The PUT route does not enforce the same URL+key completeness rules as POST for non-anchor feeds. A direct API call setting `event_feed_type: "baronshub"` without a base URL or key passes route validation but fails at the DB CHECK constraint, producing a 500 instead of an actionable 400.

**Fix:** Mirror the POST route's completeness validation in PUT: when `event_feed_type` is not `none` or `anchor_management`, require both `event_feed_base_url` and `event_feed_api_key`.

## Architecture & Integration Defects

### ARCH-001 [Advisory] — Split validation contract between routes and DB
**Severity:** Medium | **Confidence:** Medium | **Source:** ARCH-002

The DB constraint only checks completeness (URL/key non-null for non-anchor feeds). URL safety (HTTPS, private IP rejection) and key length (500 chars) are enforced only at the route level. If brand writes ever bypass the routes (e.g., via migration or admin script), the safety invariants don't hold.

**Verdict:** Acceptable if routes remain the sole write path. Note for future reference.

## Workflow & Failure-Path Defects

### WF-001 [Advisory, Product Decision] — Silent empty events on feed failure
**Severity:** Medium | **Confidence:** High | **Source:** WF-003

When feed credentials expire or the provider returns 5xx, generation silently produces a pack with no events page. Staff may print packs with absent event promotion without knowing the integration failed.

**Verdict:** Intentional by design — generation should not fail because events are unavailable. Consider adding a warning field in the generate response when events were expected but the feed returned empty/errored.

## Security & Data Risks

### SEC-001 [Pre-existing, elevated risk] — No auth on brand API routes
**Severity:** Critical (pre-existing) | **Confidence:** High | **Sources:** SEC-001, SEC-002

Brand CRUD routes have no `getUser()` or role check. This PR adds `event_feed_api_key` handling to these routes, elevating the risk. An unauthenticated caller could store arbitrary feed credentials or read brand configuration.

**Verdict:** Not introduced by this PR. Should be addressed as a follow-up security hardening task in a separate PR.

### SEC-002 [Advisory] — SSRF validation doesn't resolve DNS
**Severity:** Medium | **Confidence:** Medium | **Sources:** AB-004, SEC-004

`isPrivateIp()` checks hostname literals but doesn't resolve DNS. A domain resolving to an internal IP would pass validation. Risk is substantially lower once SEC-001 is fixed (only trusted admins can configure URLs).

### SEC-003 [Pre-existing] — Non-transactional default brand swap
**Severity:** Medium | **Confidence:** High | **Source:** SEC-003

`createBrand` and `updateBrand` unset existing defaults in a separate query. Concurrent operations could leave multiple or zero defaults. Pre-existing, not introduced by this PR.

### SEC-004 [Pre-existing] — Error messages expose DB internals
**Severity:** Low | **Confidence:** High | **Source:** SEC-006

API error responses echo raw `err.message` which can include Supabase constraint names and table details. Pre-existing pattern across all brand routes.

## Unproven Assumptions

- **AB-005:** Generate route assumes a default brand always exists. Migration seeds the default brand and production has one. Low risk but no programmatic guarantee for fresh installations.

## Recommended Fix Order

1. **IMPL-001** — Fix env token leakage (high severity, straightforward guard)
2. **IMPL-002** — Clear stale keys on disable/switch (high severity, 4 reviewers flagged)
3. **IMPL-003** — Mirror POST validation in PUT (medium, prevents 500s)
4. **SEC-001** — Add auth to brand routes (separate PR, pre-existing)
5. **SEC-002** — DNS-aware SSRF validation (separate PR, lower urgency once auth is in place)

## Minor Observations

- WF-004 (Anchor adapter timeout): **False positive.** Anchor adapter has `AbortSignal.timeout(10_000)` at line 314. Pack truncation prevented the reviewer from seeing it.
- SEC-003/SEC-004: Pre-existing patterns, not introduced by this PR.
- ARCH-001: Split validation is a valid architecture concern but acceptable for now.
