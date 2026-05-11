# Claude Hand-Off Brief: Brand-Specific Event Feeds Spec

**Generated:** 2026-05-11
**Review mode:** A (Adversarial Challenge — Spec Review)
**Overall risk:** High (3 blocking risks, 5 spec defects)

## DO NOT REWRITE

- Adapter abstraction pattern (`lib/eventFeed/` with factory + concrete adapters) — confirmed sound
- `NormalisedEvent` type aligned with existing `EventDetail` — preserves rendering consumers
- On-demand fetch model (no caching/sync) — correct for current use case
- No-feed graceful skip (null/none → empty events section) — correct
- Separate auth header handling per provider — correct

## SPEC REVISION REQUIRED

- [ ] **RISK-1 (Security model):** Add section "Security Requirements" specifying:
  - `event_feed_api_key` must be excluded from all client-facing brand API responses
  - `event_feed_base_url` must be validated: HTTPS only, no private/link-local IPs
  - Brand feed mutation requires server-side role check (admin only)
  - API key displayed as masked password field in brand editor
  - API key never logged, never included in error messages
- [ ] **RISK-2 (Failure handling):** Add section "Error Handling" specifying:
  - Per-adapter timeout (recommend 10s)
  - `fetchEventsForBrand()` catches all adapter errors, logs warning, returns `[]`
  - Export generation continues without events section on adapter failure
  - Null-safe mapping for all optional BaronsHub fields (`bookingUrl`, `ticketPrice`, `venue`)
- [ ] **RISK-3 (Migration strategy):** Replace TBD with decision:
  - Migration adds columns with NULL defaults only — no secret values in SQL
  - Code preserves env var fallback: if brand has no DB feed config, check `MANAGEMENT_API_*` env vars
  - Anchor brand config set via admin UI or one-time script post-deployment
  - Env vars deprecated once DB config is confirmed populated
- [ ] **SPEC-1:** Revise success criterion 7 to: "Adding a future customer using an existing feed provider requires only brand config"
- [ ] **SPEC-2:** Change `event_feed_type` to NOT NULL DEFAULT 'none' — single canonical no-feed representation
- [ ] **SPEC-3:** Decide `event_feed_public_base_url` vs `website_url` overlap — recommend: drop `event_feed_public_base_url`, use `website_url` + per-adapter path template
- [ ] **SPEC-4:** Add validation requirement: when `event_feed_type != 'none'`, require `event_feed_base_url` and `event_feed_api_key` to be non-null (CHECK constraint or app-level)
- [ ] **SPEC-5:** Specify timezone conversion: adapters use Europe/London via project `dateUtils`

## ASSUMPTIONS TO RESOLVE

- [ ] **Brand config in generation context:** Verify `BrandConfig` (including new feed fields) is already loaded server-side in `app/api/generate/route.ts` before `renderEventsPage()`
- [ ] **Brand API response filtering:** Verify existing brand routes don't return all columns — confirm `event_feed_api_key` won't leak
- [ ] **Brand editor auth:** Verify brand edit routes have role/auth checks already
- [ ] **BaronsHub production URL:** Ask user for the production base URL for Barons event feed

## REPO CONVENTIONS TO PRESERVE

- All DB columns snake_case; TypeScript camelCase with `fromDb<T>()` conversion
- Server actions / API routes re-verify auth server-side
- Design tokens only — no hardcoded hex in components
- Europe/London timezone via `dateUtils` for all date display
- Zod validation for all form inputs

## RE-REVIEW REQUIRED AFTER FIXES

- [ ] **RISK-1:** Re-review security model after spec revision — verify redaction, SSRF prevention, and access control are fully specified
- [ ] **RISK-3:** Re-review migration strategy after decision — verify no secrets in SQL, fallback path works

## REVISION PROMPT

```
Update tasks/spec-brand-event-feeds.md to address the adversarial review findings:

1. Add "Security Requirements" section after "Security Considerations" with:
   - API key redaction rules for all brand API responses
   - URL validation requirements (HTTPS, no private IPs)
   - Role-based access control for feed settings mutation
   - Masked display in brand editor UI

2. Add "Error Handling" section specifying:
   - 10s adapter timeout
   - fetchEventsForBrand() catches all errors, logs, returns []
   - Null-safe field mapping for BaronsHub optional fields

3. Replace migration TBD with:
   - Columns added with NULL defaults, no secrets in SQL
   - Code preserves MANAGEMENT_API_* env var fallback
   - Admin UI/script sets Anchor config post-deployment
   - Env vars deprecated after DB config confirmed

4. Fix success criterion 7: add "using an existing feed provider"
5. Change event_feed_type to NOT NULL DEFAULT 'none'
6. Drop event_feed_public_base_url — use website_url + per-adapter path template
7. Add CHECK/validation: non-none type requires base_url and api_key
8. Specify Europe/London timezone conversion via dateUtils
```
