# Adversarial Review: Brand Event Feeds Implementation

**Date:** 2026-05-11
**Mode:** B (Code Review)
**Scope:** Brand event feed columns, adapter layer, API routes, generate route, brand editor UI
**Pack:** tasks/codex-qa-review/2026-05-11-brand-event-feeds-impl-review-pack.md

## Executive Summary

The brand event feed implementation is architecturally sound — the adapter pattern cleanly separates provider-specific logic, API key exposure is properly blocked via `event_feed_has_key`, and error handling ensures PDF generation degrades gracefully. However, **one blocking defect** was found in the new code: the brand editor form blocks editing Anchor brands that use env-var fallback credentials. Several advisory findings around API-level validation, credential lifecycle, and pre-existing auth gaps are worth addressing.

## What Appears Solid

- **API key never leaked:** `rowToBrand()` maps `event_feed_api_key` to `event_feed_has_key: boolean` — confirmed across all brand read paths
- **Adapter isolation:** PDF/clipboard consumers depend only on `NormalisedEvent[]`, never on provider-specific shapes
- **Graceful degradation:** `fetchEventsForBrand()` catches all adapter errors, logs no secrets, returns `[]` — generation continues
- **Key preservation on edit:** Blank password field correctly omits `event_feed_api_key` from PUT payload, preserving existing DB value
- **Timeouts:** Both adapters use `AbortSignal.timeout(10_000)` and `cache: "no-store"`

## Critical Risks

None.

## Implementation Defects

### IMPL-001 [BLOCKING] — Form blocks editing Anchor brands with env-var fallback
**Severity:** High | **Confidence:** High | **Sources:** AB-001, ARCH-001

The brand editor requires a per-brand API key whenever `eventFeedType !== "none"` and `!brand.event_feed_has_key`. But the migration seeds the default Anchor brand as `anchor_management` with no stored key — it falls back to `MANAGEMENT_API_*` env vars via `getBrandFeedConfig()`. Editing any non-feed field (name, colours) on this brand is blocked by the form validation.

**Fix:** Skip the API key requirement when `eventFeedType === "anchor_management"`, or check `brand.event_feed_has_key || eventFeedType === "anchor_management"`.

### IMPL-002 [Advisory] — Whitespace API keys accepted at route level
**Severity:** Medium | **Confidence:** High | **Sources:** AB-002, WF-005, SEC-002

POST and PUT routes accept `event_feed_api_key` from the raw body without trimming or length validation. A whitespace-only key passes, sets `event_feed_has_key: true`, and later fails as an invalid bearer token. The UI trims, so this only affects direct API callers.

**Fix:** Trim and reject empty/whitespace-only keys at the route level. Add a max-length constraint (e.g., 500 chars).

### IMPL-003 [Advisory] — Route doesn't mirror DB completeness constraint
**Severity:** Medium | **Confidence:** High | **Source:** ARCH-002

A direct API call creating a BaronsHub brand with a base URL but no API key passes route validation but fails at the DB CHECK constraint, producing a 500 instead of a 400.

**Fix:** Add route-level validation: when `event_feed_type` is not `none` or `anchor_management`, require both `event_feed_base_url` and `event_feed_api_key`.

## Architecture & Integration Defects

### ARCH-001 [Advisory] — Provider switch retains old credentials
**Severity:** Medium | **Confidence:** High | **Sources:** ARCH-003, WF-003

Switching a brand from one provider to another without entering a new key silently retains the old provider's key in the DB. The new adapter then uses the wrong credential. The form only requires a key when `!brand.event_feed_has_key`, regardless of whether the provider changed.

**Fix:** When `eventFeedType` changes from the brand's stored value, require a new API key (or clear the old one).

### ARCH-002 [Advisory] — `select("*")` loads secret in all brand reads
**Severity:** Medium | **Confidence:** Medium | **Source:** ARCH-004

All brand queries use `select("*")`, which loads `event_feed_api_key` into memory even for client-facing responses. `rowToBrand()` strips it, but the secret passes through the application layer unnecessarily.

**Fix:** Replace `select("*")` with explicit column lists excluding `event_feed_api_key` in non-feed-config queries. Alternatively, accept the current defense-in-depth (`rowToBrand` strips it) as sufficient.

## Workflow & Failure-Path Defects

### WF-001 [Advisory] — Silent empty events on feed failure
**Severity:** Medium | **Confidence:** Medium | **Source:** WF-004

When feed credentials expire or the provider returns 5xx, generation silently produces a pack with no events page. The user discovers this only after inspecting the output.

**Verdict:** This is intentional by design — generation should not fail because events are unavailable. No change needed, but consider a warning in the UI if events are expected but empty.

### WF-002 [Pre-existing] — Non-atomic default brand changes
**Severity:** Medium | **Confidence:** High | **Sources:** WF-002, SEC-005

`createBrand` and `updateBrand` unset existing defaults in a separate query before the insert/update. Not introduced by this PR but worth noting.

## Security & Data Risks

### SEC-001 [Pre-existing, elevated risk] — No auth on brand API routes
**Severity:** Critical (pre-existing) | **Confidence:** High | **Source:** SEC-001

Brand CRUD routes have no `getUser()` or role check. This is a pre-existing pattern, but this PR adds `event_feed_api_key` handling to these routes, elevating the risk. An unauthenticated caller could store arbitrary feed credentials.

**Verdict:** Not introduced by this PR, but should be addressed as a follow-up security hardening task.

### SEC-002 [Advisory] — SSRF validation doesn't resolve DNS
**Severity:** Medium | **Confidence:** Medium | **Sources:** AB-003, SEC-003

`isPrivateIp()` checks hostname literals but doesn't resolve DNS. A domain resolving to an internal IP would pass validation. Risk is lower if only trusted admins can configure brands (requires SEC-001 fix).

### SEC-003 [Advisory] — Feed disable doesn't clear stored key
**Severity:** Low | **Confidence:** High | **Source:** SEC-004

Setting `event_feed_type` to `none` leaves the old API key in the DB. Product decision needed on whether disabling should clear credentials.

## Unproven Assumptions

- **BaronsHub API contract:** The adapter assumes `/api/v1/events` with `from`, `limit`, `endsAfter` params and Bearer auth. The API doesn't exist yet — confirmed during this session. Will need integration testing when built. (AB-005)
- **Default brand always exists:** `resolveBrandConfig` returns null when no brand exists, which makes `upcomingEvents = []`. Verified that a default brand exists in production today. (AB-004)

## Recommended Fix Order

1. **IMPL-001** [Blocking] — Fix form validation for anchor_management env-var fallback
2. **IMPL-002** — Trim/validate API key at route level
3. **IMPL-003** — Mirror DB CHECK constraint in route validation
4. **ARCH-001** — Require new key on provider switch
5. **SEC-001** — Add auth to brand routes (separate PR, pre-existing)

## Minor Observations

- WF-001 (two-step brand create with logo upload) is pre-existing, not introduced by this PR
- AB-005 (BaronsHub contract untested) is expected since the API doesn't exist yet
