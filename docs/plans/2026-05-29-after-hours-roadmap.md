# After Hours Redesign — Roadmap & Tracker

**Living document.** Update status as phases land. Spec: [docs/specs/2026-05-29-music-bingo-after-hours-redesign.md](../specs/2026-05-29-music-bingo-after-hours-redesign.md).

Status: ✅ done · ▶ in progress · ⬜ not started · ⛔ blocked/gated

## Phases
| # | Scope (1-liner) | Depends on | Status | Plan |
|---|---|---|---|---|
| 0 | Foundations: fonts, design tokens, dark UI primitives, brand font/logo schema + migration, Vitest harness | — | ✅ (11 commits, verified, Codex-reviewed) | [phase-0-foundations.md](2026-05-29-after-hours-phase-0-foundations.md) |
| 1a | **State contract**: `lib/live/runOfShow.ts`, `lib/live/content.ts`, additive `LiveRuntimeState`/`LiveSessionV1` fields (`screenId`, `content`, `welcomeVariant`, `titleVariant`) + validators | 0 | ▶ planning | (this session) |
| 1b | **Component library**: `components/motifs/*` + `components/screens/*` (~16 presentational components) ported from the bundle, rendered in isolation | 0, 1a | ⬜ | tbd |
| 2 | **TV Display** (`/guest/[sessionId]`) rebuilt as a `screenId`-driven renderer over the existing sync engine | 1a, 1b | ⬜ | tbd |
| 3 | **Host Controller** (`/host/[sessionId]`) console: preview + run-of-show + Now-Playing/Game-Flow/Timing/Content/Playlist panels + variant controls | 1a, 1b, 2 | ⬜ | tbd |
| 4 | **Setup & Manage**: `/host` dashboard + `/prep` wizard restyle (+ derived readiness, edit-mode hydration, missing-song resolution route) | 0 (1a for content defaults) | ⬜ | tbd |
| 5 | **Brands & Venues** three-pane editor + live preview + font/event-logo UI | 0 | ⬜ | tbd |
| 6 | **Print/PDF**: `@pdf-lib/fontkit`, cards + What's-On restyle (≤3 events), new run-sheet PDF, `/api/generate` output modes | 0 | ⬜ | tbd |

> Split note: spec Phase 1 → **1a** (state/lib, fast, TDD) + **1b** (component porting, large/visual) for shippability. Phases 4/5/6 can parallelise after 0+1a.

## Cross-phase carry-over items (do NOT lose)
- ⛔ **Apply migration `20260529120000_*` before Phase 5** (Codex CR-1). Supabase CLI is unlinked in this env → **user applies** (`supabase db push`). Not needed for 1a/1b/2/3. No current code writes the new columns.
- **Interim UI (CR-2):** Phase 0 darkened shared primitives/body; `/host`, `/prep`, `/brands` look transitional until Phases 4–5. **Don't deploy Phase 0 standalone to prod** — land surface phases first. As each admin page is rebuilt, drop `AppHeader variant="light"`.
- **Phase 5:** enforce `SUPPORTED_BRAND_FONTS` category on brand font fields (CR-4); store WEBP with `.webp` ext (PRE-5); once `BrandForm` writes the new fields, the migration must already be live.
- **Phase 6:** decide whether the run-sheet PDF supersedes the DOCX clipboard.
- **Security backlog (pre-existing, separate tasks):** logo path-traversal in `brandStorage.ts` (task chip raised); default-brand non-atomic switch (PRE-2); `event_feed_base_url` should use HTTPS-only schema (PRE-3). See [Codex review](../../tasks/codex-qa-review/2026-05-29-after-hours-phase-0-adversarial-review.md).

## Invariants (spec §3, A1–A10)
- Reuse the existing sync engine (BroadcastChannel + DB `runtime_data` poll, newest-wins) — **no Supabase Realtime**.
- Run-of-show drives the TV via `runtime.screenId`; content overrides + variants ride the runtime payload.
- Click-to-edit is **host-side only**; the live guest TV is read-only.
- **No auth** is introduced (out of scope).
- Print stays **B&W**; dynamic fonts only via the `SUPPORTED_BRAND_FONTS` allowlist.

## Whole-redesign Definition of Done
See spec §15. Each phase ends green on `npm run verify` and (for code/3+-agent phases) a Codex adversarial pass.
