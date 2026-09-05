# Defects

| ID | Type | Severity | Confidence | Evidence | Impact | Root cause | Sibling check | Fix | Approval | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FF-001 | Observability | Medium | High | generate response omits headers consumed by both prep exports | Missing promotion goes unnoticed | Feed returns only array | Both adapters and both buttons | Typed outcomes, response metadata and shared notices | Approved safe fix | Success, empty, disabled, missing and failed feed tests | Fixed and verified |
| FF-002 | Bug | Medium | High | generate calls getBrandFeedConfig outside best-effort guard | Optional promotion outage blocks printable cards | Configuration lookup throws to route catch | Brand resolution already best-effort | Guard lookup and retain error outcome | Approved safe fix | Actual POST produces ZIP when lookup fails | Fixed and verified |
| FF-003 | Bug | Medium | High | Both adapters accepted success responses without events | Malformed provider payload looks like empty calendar | Missing array validation | Anchor and BaronsHub adapters | Require expected events array | Approved safe fix | Malformed payload tests for both adapters | Fixed and verified |

## Verification

Node 20.19.5. Final pipeline: lint passed with zero warnings; typecheck passed; 25 unit test files and 159 tests passed; seven Python tests passed; all nine Playwright flows passed; clean production build compiled successfully and generated 20 static pages. Browser and build runs explicitly replaced external credentials with dummy values.

The real POST handler generated valid ZIP files containing three readable PDFs with a healthy feed, provider HTTP 401, and failed brand feed configuration lookup. Browser Flow 3 exercised the real POST endpoint (HTTP 200), inspected the ZIP and PDF structure, then verified both export buttons show their respective error and missing-configuration warnings while completing downloads.

The first browser attempt failed because Turbopack rejects node_modules symlinks outside its root. The worktree-only dependency symlink was replaced by a local cloned dependency directory; the original checkout was untouched. Generated next-env.d.ts changes from the dev server were returned to their original form by the clean production build.

Discovery: initial perimeter pass, one sibling pass finding malformed-response handling, then a final focused pass with no further confirmed in-scope defects. QR bitmap render failures retain the established skip behaviour; metadata counts available event URLs, not successful bitmap rendering. Intentionally disabled feeds remain quiet. No Quiz or Cash Bingo integration introduced. No migrations, live writes, commits or deployments.
