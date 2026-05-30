# After Hours Redesign — Phase 1b: Component Library — Plan

**Goal:** Port the design bundle's motif + screen components into real TS React components, **rendered in isolation** (no page wiring — that's Phases 2/3). They consume Phase 0 tokens/classes and the Phase 1a contracts (`runOfShow`, `getContent`). No behaviour change to existing pages.

**Source of truth:** `docs/design/after-hours/{shared,screens-a,screens-b}.jsx` (vendored). Recreate the visual output faithfully; adapt structure to React/TS.

**Verification per component group:** `npx tsc --noEmit` clean + `npm run lint` clean. Final phase gate adds `npm run build`. (Components aren't mounted yet, so runtime is exercised in Phase 2; tsc + an independent review are the 1b gates.)

## File inventory
**`components/motifs/`** (from `shared.jsx`): `Sunburst.tsx`, `Vinyl.tsx`, `Eq.tsx`, `Ball.tsx`, `Bulbs.tsx`, `Chrome.tsx`, `VenueLogo.tsx`, `Qr.tsx`, `EditContext.tsx`, `Editable.tsx`.
**`components/screens/`** (from `screens-a.jsx` + `screens-b.jsx`): `Welcome.tsx` (A/B/C), `RunningOrder.tsx`, `QuizSwitch.tsx`, `Title.tsx` (A/B/C), `HouseRules.tsx`, `Warmup.tsx` (dance/sing), `GameLive.tsx` (game 1/2), `BreakScreen.tsx`, `Winners.tsx`, `ThankYou.tsx`, `SysLoading.tsx`, `SysNotFound.tsx`, plus internal `NowPlaying.tsx`, `AlbumArt.tsx`. Add `components/screens/registry.ts` mapping `ScreenId → (props) => ReactNode` for the Phase 2 guest renderer.

## Contracts
- **Motifs** are presentational; reuse existing `globals.css` classes (`.sunburst`/`.vinyl`/`.eq`/`.ball`/`.chrome`/`.pill`/`.display`/`.kicker`/`.lede`/`.rule`/`[data-edit]`). `VenueLogo` takes `brand: BrandConfig`; renders `brand.logo_dark_url` (the white/light mark shown on the dark TV) or a styled wordmark fallback of `brand.name`. `Qr` uses the installed `qrcode` npm lib (client-side → SVG string/data URL), NOT the CDN `qrcode-generator`. `EditContext` = React context `{ editing: boolean; get(key,fallback): string; set(key,value): void }`; `Editable` renders `contentEditable` only when `editing` (host-side use; guest passes `editing:false`).
- **Screens** take `{ brand: BrandConfig; content: ContentResolver; runtime?: LiveRuntimeState | null; variant?: "A"|"B"|"C" }` where `ContentResolver = (key: ContentKey) => string` (the page builds it from `getContent` bound to runtime/session/brand). Game/Warmup screens read reveal state from `runtime`. Text comes via the resolver + `<Editable>` so the same component works on the TV (read-only) and in the host preview (editable).

## Execution (parallel — components are independent)
- **Wave 1 — motifs** (2 subagents, disjoint files): M1 = Sunburst/Vinyl/Eq/Ball/Bulbs/Chrome/VenueLogo; M2 = Qr/EditContext/Editable.
- **Wave 2 — screens** (3–4 subagents, disjoint files) once motifs exist: split screens-a screens, screens-b screens, system+shared (NowPlaying/AlbumArt), and the registry.
- Subagents do NOT `git commit` (parallel → orchestrator commits at each wave gate). Orchestrator verifies tsc/lint between waves.

## Roadmap
Marks 1b ✅ when all components compile, lint clean, build passes, and an independent review approves. Unblocks Phase 2 (guest TV renderer).
