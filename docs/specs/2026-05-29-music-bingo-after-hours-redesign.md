# Music Bingo — "After Hours" Redesign — Implementation Spec

**Date:** 2026-05-29
**Author:** Claude (with Peter Pitcher)
**Source design:** Claude Design handoff bundle `music-bingo 2/` (HTML/CSS/JSX prototypes), currently at `/Users/peterpitcher/Library/Mobile Documents/com~apple~CloudDocs/Downloads/music-bingo 2/project/`
**Complexity:** 5 / XL (cross-cutting; every surface; schema + PDF changes) → **delivered in 7 phases, each independently shippable**
**Status:** Reviewed and revised by Codex, 2026-05-29

---

## 0. Codex critical review changes (2026-05-29)

This spec is directionally strong, but the first draft mixed visual-redesign work with several under-specified product and infrastructure changes. I made the following corrections so the build can proceed without hidden schema/API work:

- **Design bundle path is now documented.** The spec depends on the `music-bingo 2/` prototypes currently stored in iCloud Downloads. For repeatable implementation, copy the bundle into the repo under `docs/design/after-hours/` before implementation or keep this absolute path available to all agents.
- **Root-level Supabase theming was removed.** Fetching the default brand in `app/layout.tsx` would make every page depend on Supabase at the root and creates nested `BrandProvider` cleanup problems when session pages override the theme. Root layout should provide static font/default tokens only; pages with actual brand data should apply `BrandProvider`.
- **Persisted Draft status was removed from this redesign.** `LiveSessionV1` currently requires two complete game configs with playlist IDs. A real "Save Draft" flow needs a separate draft/prep schema and validation path, which is not specified here. The dashboard can show derived readiness for saved sessions; true draft persistence is out of scope.
- **Missing-song resolution now has an explicit API contract.** The prototype includes "paste Spotify track link / skip" for unmatched songs. Current playlist creation returns `notFound` in JSON; the `x-music-bingo-*` headers mentioned in the draft are QR/event-pack headers, not song-resolution state. If this UI ships, it must call a new explicit playlist-resolution route.
- **Direct PDF actions now have an API contract.** The existing `/api/generate` route returns a ZIP. If the UI needs "Open/Print Cards" or "Open/Print Run Sheet", the route must add explicit output modes while preserving ZIP as the default.
- **PDF fonts and logo formats are now explicit.** `@pdf-lib/fontkit` is not currently installed, and brand uploads allow JPEG/WebP while the PDF path embeds PNG. The implementation must add fontkit and normalize fetched logo bytes to PNG before embedding.
- **Logo field mapping is now explicit.** The prototype's `logoLight` name means "white logo", but this app's schema uses `logo_dark_url` for logos shown on dark backgrounds and `logo_light_url` for light/print backgrounds. The spec now preserves the app's existing convention to avoid swapping venue logos in UI/PDF output.
- **Runtime content is now typed and bounded.** An unbounded `Record<string,string>` in JSONB would be easy to bloat or corrupt. The spec now requires an allowlisted `ContentKey` union, length caps, and derived defaults from session/brand data to avoid stale duplicated text.
- **Dynamic brand fonts are allowlisted.** Brand font fields must resolve through a local supported-font registry, not arbitrary DB strings interpolated into Google Fonts URLs.

---

## 1. Overview & goal

Apply the **"After Hours" retro-disco** visual design (Anton + Archivo type, deep-green/gold brand tokens, film-grain/vinyl/sunburst motifs, dark "console" admin chrome) to the live Music Bingo app, faithfully recreating the six designed surfaces in the existing Next.js 16 / React 18 / Tailwind 3 / Supabase codebase.

The design is **pre-decided** — our job is a **pixel-faithful recreation** mapped onto the real architecture, not a new design exploration. We match the *visual output* of the prototypes; we do **not** copy their internal structure (e.g. the prototypes' `localStorage`-only state, CDN React, `window`-global modules).

### The six surfaces and their mapping

| Design file(s) | Surface | Current route / module |
|---|---|---|
| `app.jsx` + `screens-a/b.jsx` + `styles.css` | **TV Display** — 13-screen run-of-show projector | `app/guest/[sessionId]/page.tsx` (already a projection) |
| `host.jsx` + `host-panels.jsx` + `host-styles.css` | **Host Controller** — preview + run-of-show + control panels | `app/host/[sessionId]/page.tsx` |
| `setup.jsx` + `setup-steps.jsx` + `setup-styles.css` | **Setup & Manage** — games dashboard + 4-step wizard | `app/host/page.tsx` (lobby) + `app/prep/*` (wizard) |
| `brands.jsx` | **Brands & Venues** — list + form + live preview | `app/brands/*` |
| `Music Bingo Cards.html` + `print-styles.css` | **Bingo Cards** (B&W print) + "What's On" back page | `lib/pdf.ts` + `app/api/generate/route.ts` |
| `Music Bingo Run Sheet.html` + `print-styles.css` | **Run Sheet** (B&W print) | new `lib/runSheetPdf.ts` (today only a DOCX exists) |

---

## 2. Scope decisions (confirmed with user, 2026-05-29)

1. **Player cards** → *Printed cards + TV display.* Players dab **printed** cards; the projector shows the TV display run-of-show. `/guest/[sessionId]` remains the projection/TV (no per-device interactive card is added).
2. **New features** → *Include all (full build):* quiz-switch ("phones out") screens, Welcome/Title layout variants A/B/C, and live click-to-edit text (host-side).
3. **Data model** → *Add columns via migration* for genuinely-new per-brand data.
4. **PDF output** → *Cards + run sheet + What's-On* all in scope.

### In scope
- Visual restyle of **all** surfaces (TV, host, setup/dashboard, prep wizard, brands) to "After Hours", including **dark-theming the admin chrome** (currently light `bg-slate-50`).
- New synced **run-of-show screen model** + the 13 presentational screens + 2 system states.
- **Live content overrides** (host name, ledes, running order, house rules, winners, next event, themes, break minutes) editable in the host console and click-to-edit in the host's TV preview.
- **Welcome/Title A/B/C variants** selectable by the host.
- **Quiz-switch** screens (static "phones out / KaraFun" screens) as run-of-show steps.
- **Spotify unmatched-song resolution** in prep (paste track link or skip), implemented via an explicit route rather than response-header side channels.
- Migration: split `font_family` → `font_display` + `font_body`; add `event_logo_url`.
- PDF: embed Anton/Archivo; restyle cards; restyle "What's On"; **new run-sheet PDF**.

### Out of scope / non-goals
- **Authentication / RBAC / RLS.** The app today has *no* auth (service-role client, no `getUser()`); it is a single-operator internal tool. This redesign does **not** introduce auth. (Flagged — see §13.)
- **No interactive on-device player card** (per decision 1).
- **No change to the core reveal-timing algorithm, Spotify OAuth/playback control, card-generation algorithm, or sync transport** (BroadcastChannel + DB `runtime_data` polling) beyond additive state fields.
- **No KaraFun API integration** — quiz screens are static informational screens only.
- **No true prep draft persistence** in this redesign. A "Draft" workflow requires a separate draft schema because `LiveSessionV1` validates only complete live sessions with both playlists.
- **No hidden/header-based per-song Spotify override workflow.** The redesign may include the prototype's "paste a Spotify link / skip" UI only through the explicit API contract in §8.2.
- DOCX "clipboard" export (`lib/clipboardDocx.ts`) is **retained as-is** unless the new run-sheet PDF fully supersedes it (see §10.3 — decision: keep DOCX, add PDF).

---

## 3. Key architecture decisions & assumptions

> These are the forks I resolved while writing the spec. Please confirm any you disagree with.

- **A1 — Shared screen components.** The 13 TV screens render **identically** in the guest TV (full-screen) and the host preview (scaled). Extract them once into `components/screens/*` as **pure presentational** components taking `{ brand, content, runtime }` props. Both surfaces import the same components. (Mirrors how `screens-a.jsx`/`screens-b.jsx` are shared by `app.jsx` and `host.jsx`.)
- **A2 — Run-of-show drives the TV.** Add a `screenId` to the synced runtime state. The host's "Run of Show" list and Prev/Next set it; game-flow actions (Start Game 1, Dance Along, Break…) set `screenId` **and** the existing playback/reveal state. The guest renders the component for `screenId`. Existing reveal logic continues to drive the `GameLive`/`Warmup` screens unchanged. The run-of-show definition lives in a shared constant `lib/live/runOfShow.ts`.
- **A3 — Content overrides live on the session, synced via runtime.** Editable text is a bounded `Partial<Record<ContentKey,string>>`, not an arbitrary open map. Defaults are derived from the design placeholders, the session (`name`, `eventDateDisplay`, game themes, reveal timing), and the brand (`name`, `break_message`, `end_message`, QR links). Per-event overrides are stored on `LiveSessionV1.content`. To propagate **live** to off-device TVs without new plumbing, the host also writes the current content snapshot into `LiveRuntimeState.content`, riding the existing broadcast + DB-poll path (newest-wins by `updatedAtMs`). Guest precedence: `runtime.content[k]` → `session.content[k]` → derived session/brand value → design placeholder.
- **A4 — Variants are synced runtime fields.** Add `welcomeVariant` and `titleVariant` (`"A"|"B"|"C"`) to runtime state (host control bar sets them; session holds defaults).
- **A5 — Click-to-edit is host-side only.** The robust editor is the host "Live Content" panel. "Click any text to edit" is enabled **only inside the host console's TV preview** (an `EditContext` with `editing=true`), never on the live guest display (which may run on a dumb screen and is public). Faithful to host.jsx's "tap any text on the TV preview after pressing Edit live".
- **A6 — Admin chrome goes dark, app-wide.** Host controller, lobby/dashboard, prep wizard and brands adopt the dark `host-root` treatment. We **restyle the existing UI primitives** (`Button`, `Card`, `Badge`, `Notice`, `StepIndicator`, `AppHeader`) to the dark "console" look rather than forking a parallel set. The light theme is retired.
- **A7 — Brand tokens become app-wide defaults, but brand data stays page-scoped.** `app/layout.tsx` owns static `next/font` setup and default CSS variables. `BrandProvider` remains page/session scoped and injects the **full** token set used by the design (hex + RGB variants, `--brand-display`, `--brand-body`, `--ink`, `--cream`, …) only when a page has resolved brand data. This avoids root-layout Supabase fetches and nested provider reset bugs.
- **A8 — QR links already exist.** The design's per-brand "review/booking" links map onto the existing `qr_items jsonb` (label+url, max 4) — **no new columns** for QR. We do **not** add discrete `review_url`/`booking_url` columns.
- **A9 — Fonts via `next/font/google` + an allowlist.** Add Anton + Archivo as CSS variables; a brand may override `font_display`/`font_body`, but values must resolve through a `SUPPORTED_BRAND_FONTS` registry before any dynamic Google Fonts `<link>` is created. Default body = Archivo, default display = Anton (Inter is retained only as a fallback/legacy option).
- **A10 — PDF stays B&W** (matches both current code and the design's `print-styles.css`). Brand colour is intentionally ignored for print. We embed **Anton + Archivo TTFs** into pdf-lib (replacing Helvetica for headings/titles).

### Open assumptions to confirm
- **AS0 — Source design bundle is available before implementation.** The `music-bingo 2/` handoff bundle is currently at `/Users/peterpitcher/Library/Mobile Documents/com~apple~CloudDocs/Downloads/music-bingo 2/project/`. Prefer copying it into `docs/design/after-hours/` so "pixel-faithful" remains testable across machines.
- **AS1 — The second "Velvet Room" demo brand is illustrative only**; we ship with the real default (The Anchor) and the existing brand-management flow. Not seeding a second brand.
- **AS2 — The "Setup & Manage" dashboard merges with the current lobby (`/host`).** We restyle `/host` to the design's dashboard (games table + actions) and keep `/prep` as the wizard the "New Game / Edit" actions open. We do **not** introduce a new `/setup` route. (Alternative: a dedicated `/setup` route — rejected to avoid route churn and broken links.)
- **AS3 — Quiz-switch screens are always present in the run-of-show** (two of them, R1 and R2), matching the fixed 13-step order. They are skippable via navigation but not configurable per-session in this phase.
- **AS4 — Card grid stays 5×3 with 3 blanks** (current generator) — the design's `Cards.html` uses the same 5×3 / one-blank-per-row layout, so no generator change is required.

---

## 4. Design system & tokens

### 4.1 Typography
- Add via `next/font/google` in `app/layout.tsx`: **Anton** (`--font-anton`, weight 400) and **Archivo** (`--font-archivo`, weights 400;500;600;700;800).
- Token mapping (set on `:root` and overridable per brand):
  - `--brand-display: "Anton", Impact, sans-serif`
  - `--brand-body: "Archivo", ui-sans-serif, system-ui, sans-serif`
- `BrandProvider` resolves **two** fonts (`font_display`, `font_body`) with Anton/Archivo defaults. Dynamic Google-Fonts links are allowed only for names present in a local `SUPPORTED_BRAND_FONTS` registry; unknown DB values fall back to Archivo/Anton and should be surfaced as a validation warning in the brand form.

### 4.2 Colour & derived tokens (`app/globals.css`)
Replace the current minimal `:root` with the full design token set from `styles.css` (keep **RGB-channel** tokens for Tailwind alpha, **add** hex tokens the design uses directly):

```css
:root {
  /* brand (overridden per-venue by BrandProvider) */
  --brand-primary: #003F27;        --brand-primary-rgb: 0 63 39;
  --brand-primary-light: #0F6846;  --brand-primary-light-rgb: 15 104 70;
  --brand-accent: #A57626;         --brand-accent-rgb: 165 118 38;
  --brand-accent-light: #C4952F;   --brand-accent-light-rgb: 196 149 47;
  --brand-display: "Anton"; --brand-body: "Archivo";
  /* derived */
  --ink: #04130C;   --ink-rgb: 4 19 12;
  --cream: #F6EFDD; --cream-rgb: 246 239 221; --cream-dim: #cdbfa0;
}
```

Port the **motif/utility classes** verbatim (adapted) from `styles.css`: `.screen`, `.screen--warm`, `.grain`, `.vignette`, `.kicker`, `.display`, `.display--gold`, `.lede`, `.pill`, `.sunburst`, `.vinyl`, `.eq`, `.ball`, `.rule`, `.chrome`, entrance animations (`an-rise`/`an-fade`/`an-pop`/`an-slideL` + `d1…d6` delays), and the `[data-edit]` editing styles. Retire/replace `.guest-projection-shell` and the hardcoded-amber `.challenge-projection-shell` (challenge styling now flows from `--brand-accent*` per the design's `.screen--warm`).

### 4.3 Tailwind (`tailwind.config.ts`)
Keep the four `brand-*` colour utilities; **add** `ink`, `cream`, `cream-dim`, `brand-primary`, `brand-accent` (RGB-channel backed) and a `fontFamily` extension: `display: ["var(--brand-display)", …]`, `body/sans: ["var(--brand-body)", …]`. No dynamic class construction (per workspace rule).

### 4.4 Shared motif + chrome components (`components/motifs/`)
Port from `shared.jsx` as real React/TS components: `Sunburst`, `Vinyl`, `Eq`, `Ball`, `Bulbs`, `Chrome`, `VenueLogo` (brand logo or styled wordmark fallback), `QR` (using existing `qrcode` lib, **not** the CDN `qrcode-generator`), and the `Editable` component + `EditContext` (used host-side only — A5).

---

## 5. Data model & migrations

### 5.1 Migration — `supabase/migrations/<ts>_add_brand_fonts_and_event_logo.sql`
```sql
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS font_display text,     -- e.g. "Anton"   (nullable; default resolved in app)
  ADD COLUMN IF NOT EXISTS font_body text,        -- e.g. "Archivo"
  ADD COLUMN IF NOT EXISTS event_logo_url text;   -- gold event logo (storage object key), nullable

-- Backfill: existing single font becomes the body font.
UPDATE brands SET font_body = font_family WHERE font_body IS NULL AND font_family IS NOT NULL;
```
- **Keep `font_family`** (do not drop) for backward compatibility; treat it as a deprecated alias of `font_body`. (Per workspace rule: dropping a column requires a function/trigger audit + explicit approval; we avoid the drop.)
- `event_logo_url` stores a Storage object key in the existing `brand-assets` bucket; add a third logo slot `event-logo` to `lib/brands/brandStorage.ts` (`LogoSlot = "logo-dark" | "logo-light" | "event-logo"`).
- Keep the existing logo naming convention: `logo_dark_url` is the logo used on dark backgrounds (usually a white/light mark), and `logo_light_url` is the logo used on light/print backgrounds (usually a black/dark mark). The design prototype calls its white logo `logoLight`; do not copy that name into the app schema.
- **No** new columns for QR (A8), review/booking (covered by `qr_items` + `website_url`), break/end messages (already exist).

### 5.2 `lib/brands/types.ts`
- Add to `brandSchema` / `Brand` / `BrandConfig` / `brandInputSchema`: `font_display`, `font_body` (both `z.string().max(100).nullable()`), `event_logo_url` (nullable). Keep `font_family` for now.
- `brandRepo.rowToBrand` / `createBrand` / `updateBrand` / `CreateBrandInput`: thread the three new fields. Resolve effective fonts in `brandToBrandConfig`: `font_display ?? "Anton"`, `font_body ?? font_family ?? "Archivo"`.

### 5.3 `lib/live/types.ts` — runtime & session extensions (additive, back-compatible)
Add to **`LiveRuntimeState`**:
```ts
screenId: ScreenId;                         // current run-of-show screen id; default "welcome"
content?: Partial<Record<ContentKey, string>>; // live content snapshot pushed to the TV (A3)
welcomeVariant?: "A" | "B" | "C";          // A4
titleVariant?: "A" | "B" | "C";            // A4
```
Add to **`LiveSessionV1`**:
```ts
content?: Partial<Record<ContentKey, string>>; // per-event editable text (A3)
welcomeVariant?: "A" | "B" | "C";             // session default
titleVariant?: "A" | "B" | "C";
```
- `makeEmptyRuntimeState` seeds `screenId: "welcome"`.
- `validate.ts` / `storage.ts` validators accept the new optional fields (treat unknown `screenId` as `"welcome"`, unknown variants as `"A"`). Content validators must keep only allowlisted keys, trim values, and cap each value (default 500 chars; shorter caps for small labels).
- **No new `LiveChannelMessage` type needed** — content/variants ride inside the existing `runtime_update` message and the `PUT /api/sessions/{id}/runtime` body. (`brand_update` already exists for live re-theming.)

### 5.4 `lib/live/runOfShow.ts` (new)
The canonical ordered run-of-show, shared by host (list) and guest (render):
```ts
export type ScreenId =
  | "welcome" | "order" | "quiz1" | "title" | "rules" | "dance"
  | "game1" | "break" | "quiz2" | "sing" | "game2" | "winners" | "thanks"
  | "sys-load" | "sys-none";
export interface RunOfShowStep {
  id: ScreenId; short: string; sub: string;
  game?: 1 | 2; intro?: boolean; play?: boolean; hasVariants?: boolean;
}
export const RUN_OF_SHOW: RunOfShowStep[]; // 13 steps, order per app.jsx/host.jsx
```

### 5.5 `lib/live/content.ts` (new)
Typed content keys + design-placeholder defaults + a `getContent(runtime, session, brand, key)` resolver implementing the A3 precedence. Keys cover every `Editable field=` in `screens-a/b.jsx`.

Exact `ContentKey` inventory from the design bundle:
- Venue/global: `venueName`, `venuePresents`, `venueWeb`, `hostName`.
- Welcome/title: `welcomeTitle`, `welcomeTitle2`, `welcomeTitleC`, `welcomeLede`, `welcomeLedeA`, `welcomeDate`, `introTitle`, `introArtist`, `titleTagline`.
- Running order: `ro1t`, `ro1s`, `ro2t`, `ro2s`, `ro3t`, `ro3s`, `ro4t`, `ro4s`, `ro5t`, `ro5s`, `ro6t`, `ro6s`.
- Quiz switch: `q1_l1`, `q1_lede`, `q2_l1`, `q2_lede`.
- House rules: `hr1t`, `hr1s`, `hr2t`, `hr2s`, `hr3t`, `hr3s`, `hr4t`, `hr4s`.
- Warmups/gameplay: `danceLede`, `danceTitle`, `danceArtist`, `singLede`, `singTitle`, `singArtist`, `g1theme`, `g1title`, `g1artist`, `g2theme`, `g2title`, `g2artist`.
- Break/winners/thanks/system: `breakL1`, `breakL2`, `breakLede`, `breakMins`, `winTeam`, `winPrize`, `spoonTeam`, `spoonPrize`, `nextDate`, `tyL1`, `tyL2`, `tyLede`, `nfL1`, `nfL2`.

Derived defaults should be functions, not copied content:
- `g1theme` / `g2theme` default from `session.games`.
- venue copy defaults from `brand.name`, `brand.break_message`, `brand.end_message`, `brand.website_url`, and `brand.qr_items`.
- dates default from `session.eventDateDisplay` and event-feed data where available.

Reason: duplicating these values into `content` at creation time would make later brand/session edits drift from what the TV shows.

The shipped "Live Content" panel can expose a curated subset (winners, next event, host, themes, break minutes). The host-preview click-to-edit path is what makes the full `ContentKey` inventory editable without a massive form.

---

## 6. Surface 1 — TV Display (`app/guest/[sessionId]/page.tsx`)

The guest page is **already** a host-driven projection with three sync inputs (BroadcastChannel, localStorage poll, server poll; newest-wins) and an interpolated progress ticker — **keep all of this**. Change only *what it renders*:

- Wrap in `<BrandProvider brand={brand}>` (already does) and the `.viewport` / `.stage-scaler` 1920×1080 scale-to-fit container from `app.jsx`/`styles.css` (replaces the current `clamp()`-based layout).
- Render `RUN_OF_SHOW` screen for `runtime.screenId` via the shared `components/screens/*`, passing `brand`, resolved `content`, and the live `runtime` (track/reveal/extension) for `dance`/`game1`/`break`/`sing`/`game2`.
- Do **not** ship the prototype's bottom `.controls` bar or `.hint` on the live guest TV. Navigation, variant switching, and editing belong in the host controller. The prototype controls are design/demo affordances only.
- **Screen ↔ state reconciliation:** when `runtime.screenId` is a play/intro screen, the `GameLive`/`Warmup` components consume the existing reveal state (`localRevealState`, `effectiveCfg`, interpolated progress) exactly as today. For presentational screens (`welcome`/`order`/`quiz*`/`title`/`rules`/`winners`/`thanks`), render from `content` only.
- **System states:** show `SysLoading` while `sessionLoading`; `SysNotFound` on invalid/missing session (replaces current inline error). If a session exists but `mode==="idle"` and `screenId` unset, default to `welcome`.
- `EditContext` provided with `editing:false` (no editing on the live TV — A5).
- Keep `useWakeLock()`; keep raw `<img>` for album art/logo (already eslint-disabled) or migrate to `next/image` (optional, not required).

**Screens to build** (`components/screens/`), porting `screens-a.jsx` + `screens-b.jsx`:
`Welcome` (A/B/C), `RunningOrder`, `QuizSwitch` (round prop), `Title` (A/B/C, uses `brand.event_logo_url` hero or wordmark fallback), `HouseRules`, `Warmup` (`type:"dance"|"sing"`), `GameLive` (`game:1|2`, reveal timeline badges driven by real reveal state), `BreakScreen`, `Winners` (1st + wooden spoon), `ThankYou` (two QR cards), `SysLoading`, `SysNotFound`, plus internal `NowPlaying` and `AlbumArt` (album art renders the real Spotify `currentTrack.albumImageUrl` when present, else the striped placeholder).

**ThankYou QR mapping:** the design expects two cards: "Review Us" and "Book Again". Reuse `brand.qr_items` without adding columns:
- Prefer a QR item whose label contains `review` for the review card.
- Prefer a QR item whose label contains `book`, `booking`, `reserve`, or `event` for the booking card.
- Fallback to the first two QR items, then `brand.website_url` if fewer are configured.

---

## 7. Surface 2 — Host Controller (`app/host/[sessionId]/page.tsx`)

Rebuild the controller UI to `host.jsx` + `host-panels.jsx` (dark `host-root`), **reusing the entire existing control/sync engine** (control lock, Spotify status poll, auto-advance, `commitRuntime`/`persistAndBroadcastRuntime`, timing save). Net-new wiring: `screenId`, `content`, variants into the runtime.

**Layout** (`.host-bar` + 2-col `.host-main`):
- **Top bar:** brand lock (logo + "Music Bingo / {session} · Host Controller"), Spotify status pill (live/offline), venue display, "Open TV ↗" → `window.open('/guest/{id}')`. (The design's "preview a system state" dropdown is a **demo-only** affordance — **omit**; real state derives from live data.)
- **System-state banners** (`.banner`): map to real conditions — read-only (`!isController`, with "Take Control"), Spotify offline (`spotifyDisconnected`, "Reconnect"), manual mode (`!spotifyControlAvailable`, with the "reveals still running" notice).
- **Left column:** "On The TV Now" panel = the **live TV preview** (`.tv-frame` 16:9, the shared screen for `runtime.screenId` scaled via `ResizeObserver`) + a "Live" badge + big **Previous / Next Screen** nav (sets `runtime.screenId`). Below: **"Run Of Show"** list (`RUN_OF_SHOW`) with current/done states; clicking a step sets `screenId`.
- **Right column (panels):**
  - **Now Playing** (`NowPlayingPanel`): current track, intro/challenge/free-play tags, progress bar + reveal badges (`@album/@title/@artist/@next`), transport (Prev/Pause-Resume/Next), `+30s` (`extensionMs`), `Skip 30s`, `Restart`, `Free Play` toggle — all bound to existing `sendCommand`/`commitRuntime` handlers.
  - **Game Flow** (`GameFlowPanel`): Dance Along / Start Game 1 / Sing Along / Start Game 2 / Show Break / Resume / End / Reset — bound to existing `startGame`/`playIntroSong`/`openBreakScreen`/`resumeFromBreak`/`endSession` etc. Each handler **also sets `screenId`** to the matching step.
  - **Live Content** (`ContentPanel`): edits the `content` map (winners 1st/spoon team+prize, next date, host name, G1/G2 theme, break minutes, …). Debounced writes update session (`upsertLiveSession`) **and** push into `runtime.content` via `commitRuntime`. Includes the "press Edit live, click text on the preview" affordance: an `EditContext` toggle (`editing`) that makes the **left-column preview** click-to-edit (A5).
  - **Reveal Timing** (`TimingPanel`): the four number inputs (song/album/title/artist) → existing `parseRevealConfigInputs` + `saveSongTiming`. "Use Defaults".
  - **Playlist** (`PlaylistPanel`): existing `playlistTracks` with current/played styling.
- **Variant controls** (Welcome/Title A/B/C): a small segmented control on the preview panel that sets `runtime.welcomeVariant`/`titleVariant` when the current screen supports variants.

---

## 8. Surface 3 — Setup & Manage

### 8.1 Lobby/Dashboard (`app/host/page.tsx`) — restyle to `setup.jsx` dashboard
- Dark `host-root`; `.host-bar` with "Brands", "TV ↗", Spotify pill, "Import", "+ New Game".
- Replace the current light table with the design's **games table** (`.gtable`): columns Game, Venue (brand chip), Date, Status, Game 1 (theme + song count), Game 2, Actions. Actions: **Control** (→ `/host/{id}`), **Edit** (→ `/prep?session={id}` edit mode), **Event Pack ZIP**, **Run Sheet PDF** (if `output=run-sheet` is implemented in §10.5), **Export JSON**, **Duplicate**, **Delete** (confirm). Keep existing `listLiveSessions`, `migrateLocalSessionsToSupabase`, `/api/spotify/status`, brand assignment (`BrandSelector` → `PUT /api/sessions/{id}/brand`), and the re-download path (`POST /api/generate`).
- **Status display:** derive "Ready" from the validated session payload (two games with playlist IDs and positive song counts). Do **not** persist `status` on `LiveSessionV1` in this redesign. If the product wants true "Draft" rows, add a separate `PrepDraftV1` schema/API first.
- Keep the `.scard`/`.sgrid` card-grid styles available as a responsive fallback (the design ships both); table is primary on desktop, cards on narrow.

### 8.2 Prep wizard (`app/prep/*`) — restyle to `setup-steps.jsx`
Keep the existing 4-step structure, state, validation, Spotify and generate logic; restyle to the dark wizard:
- **Stepper** (`.stepper`): Event / Game 1 / Game 2 / Generate with active/done states.
- **Edit mode:** `/prep?session={id}` must explicitly load the existing session, hydrate fields from `session.prepData`, `session.revealConfig`, `session.brandId`, game playlist metadata, `session.content`, and variant defaults, and save back to the same session ID. If `prepData` is missing, show a clear fallback that editing cannot reconstruct original song text and send the host to duplicate/regenerate from playlists instead.
- **Edit banner** when editing an existing session ("changes save to the same game — host link & cards stay valid"). If song list/theme/date fields change, clear playlist artifacts and require playlist regeneration before saving the live session.
- **Step 1 Event:** session name, date, pages (× 6 = N cards helper), brand (`BrandSelector`), break playlist URL, normal song timing grid (song/album/title/artist) + Use Defaults. (Matches `StepEventSetup`.)
- **Steps 2/3 Game:** theme, song-list textarea with live count + 25–50 validation, intro song (dance/sing, plays in full), up to **5 challenge songs** (sing/dance segmented toggle + select). (Matches `StepGameConfig` + `setup-steps.jsx` GameStep; existing `challengeSongs`/`introSongs` model already supports this.)
- **Step 4 Generate:** Spotify connect/disconnect card, Create Playlists card, **songs-not-found resolution** (from `/api/spotify/create-playlist` JSON, not response headers), and download rows: Event Pack ZIP, optional Cards PDF / Run Sheet PDF open-print actions if §10.5 output modes are implemented, Export session JSON. Keep **Save Live Session** after playlists exist; do not add "Save Draft" until a draft schema exists.
- New: capture **session `content` defaults** + **variant defaults** here (optional advanced section) so a brand-new session has sensible welcome/title/host-name values; otherwise defaults resolve from brand + placeholders.

**Missing-song resolution API contract** (needed to match `setup-steps.jsx`):
- Initial `POST /api/spotify/create-playlist` remains as-is: create playlists from matched songs and return `notFound` per game.
- Add `POST /api/spotify/playlist/{playlistId}/resolve-missing` with `{ resolutions: [{ artist, title, spotifyTrackUrl }], skipped: [{ artist, title }] }`.
- Server validates Spotify track URLs, extracts track IDs, fetches metadata for confirmation, and appends resolved tracks to the target playlist. Skipped songs are recorded only in the client/session summary.
- The Generate step keeps unresolved rows visible until either resolved or skipped; event-pack generation is allowed after the user confirms unresolved songs are skipped.

Reason: the prototype includes "match them manually or skip"; implementing that through the current QR/event-pack response headers would be incorrect.

---

## 9. Surface 4 — Brands & Venues (`app/brands/*`)

Rebuild `app/brands/page.tsx` to the design's **three-column** layout from `brands.jsx` (replacing the current card grid + separate edit pages — or keep the edit pages and make the list page the three-pane editor; **decision: make `/brands` the three-pane editor**, and keep `/brands/new/edit` + `/brands/[id]/edit` as deep links that open the same editor focused on a brand):
- **Left:** venue list (each row: accent swatch + name + "★ Default / feed" subline) + "+ New Venue".
- **Middle:** brand details form — name; logo for dark screens (URL/upload → `logo_dark_url`/white logo); logo for light/print (→ `logo_light_url`/black logo); **event logo (gold)** upload (→ new `event_logo_url`); set-default; the four colour rows (`type=color` + hex text); **Display font** + **Body font** selects (new — bind to `font_display`/`font_body`, values restricted to `SUPPORTED_BRAND_FONTS`); break message; end message; website. **QR Links** (the existing `qr_items`, up to 4, label+url). **Event Feed** (existing: provider none/anchor_management/baronshub, venue ID, API base URL, API key with the `event_feed_has_key` "stored securely" pattern).
- **Right:** **live preview** — the shared `Welcome` screen (variant A) re-themed via a scoped `applyBrand` to the draft brand, scaled to fit, + colour **swatches**, + the note that colours/logo/fonts apply across TV, host, cards & run sheet.
- Reuse all existing brand APIs (`GET/POST /api/brands`, `GET/PUT/DELETE /api/brands/[id]`, `POST /api/brands/[id]/logo`); extend the form payload + zod with the three new fields and the `event-logo` upload slot. API responses that currently expose `logo_dark_public_url` / `logo_light_public_url` must also expose `event_logo_public_url` when present. Keep the SSRF/`validateEventFeedUrl` protections and the secret-key split.
- **Font selects:** offer Anton, Archivo, Oswald, Playfair Display, Poppins, Montserrat, Bebas Neue, Inter (display list weighted to condensed/display faces; body list to text faces). Loaded on demand by `BrandProvider`.

---

## 10. Surface 5 & 6 — Print / PDF (`lib/pdf.ts`, new `lib/runSheetPdf.ts`, `app/api/generate/route.ts`)

Print stays **B&W A4** (A10). Brand colour intentionally ignored; brand **logo, name, website, fonts, events** are used.

### 10.1 Font embedding
- Add dependency `@pdf-lib/fontkit`.
- Add Anton + Archivo `.ttf` assets under `assets/fonts/` (or `public/fonts/`); register fontkit with `pdf.registerFontkit(fontkit)`; `embedFont(antonBytes)` / `embedFont(archivoBytes)` replacing Helvetica for titles/headings. Keep Helvetica as fallback. Extend `sanitizePdfText` per-font character-set handling for the new fonts.
- Add a small `lib/pdfAssets.ts` helper that loads font bytes once and normalizes brand logo bytes to PNG with Sharp before `pdf.embedPng`. Reason: current logo upload accepts PNG/JPEG/WebP, but the current PDF path embeds PNG only; using raw uploaded JPEG/WebP bytes would fail or render blank.

### 10.2 Bingo cards (`renderCardsPdf`) — restyle to `Cards.html` + `print-styles.css`
- Keep landscape A4, **6 cards/page (3×2)**, 5×3 grid, the existing generator output.
- Header: black logo (`logo_light_url`) + **Anton** "Music Bingo" title + right meta (`{brand.name}` · `{theme}` · date).
- Each card: header row (theme chip + `#NNN` in Anton), 5×3 grid with soft inner rules; **blank cells** get the diagonal-hatch fill + ♪ glyph (per `.bcell.blank`); footer "Dab a song when you hear it" + monospace `cardId` (gate on `showCardId`).
- Keep the existing **"What's On" back page interleave** (after every card page) — see 10.4.

### 10.3 Run sheet (new `lib/runSheetPdf.ts`) — port `Music Bingo Run Sheet.html`
- **Portrait A4**, B&W. `renderRunSheetPdf(opts): Promise<Uint8Array>` with a normalized `RunSheetPdfInput` containing `{ eventDateDisplay, sessionName, pages, cardCount, games, revealConfig, brand, events?, logoBlackPngBytes? }`.
- Header: Anton "Run Sheet" + "{brand.name} · Host" + event name/date + black logo (`logo_light_url`).
- **Badge row:** Cards (count + pages), Song length, Reveals (album/title/artist seconds from `revealConfig`), Challenge 90s.
- **Schedule** list (the fixed running order, numbered, with times) — sourced from `RUN_OF_SHOW` + session timing; allow per-session time overrides later.
- Optional **answer-list appendix** (2-col) of the actual game songs with Intro/Challenge chips (from session games) — gated by an option (defaults **off**). The prototype defines answer-list helper data/CSS but the rendered run sheet is schedule-only, so the default PDF must remain schedule-only for visual fidelity.
- Add to the generate ZIP. **Decision:** keep the existing DOCX clipboard *and* add the run-sheet PDF (they serve different needs — editable vs print). Revisit removing DOCX after user feedback.

### 10.4 "What's On" back page (`renderEventsPage`)
- Restyle to `Cards.html` `backPageHTML` + `.ev-*`: Anton headers, **featured** event (large block + 36/22mm "Scan to book" QR) + up to **3 upcoming** event cards (each with a 16mm QR). Today the code lays out *all* remaining events — **cap the timeline at 3** to match the design and the CLAUDE.md "next 3 events" intent (log if more were available — no silent truncation).
- Keep `fetchEventsForBrand` (Anchor + BaronsHub adapters) and the QR generation (`qrcode`). Continue to render gracefully (empty-state) when no events.

### 10.5 `app/api/generate/route.ts`
- Keep POST multipart + ZIP response as the default. **Add** `music-bingo-run-sheet-{date}.pdf` to the ZIP (call `renderRunSheetPdf`). Pass the new brand fonts/event-logo through to renderers. No change to card-generation or Spotify-order logic.
- Add an optional `output` form field for direct open/print actions:
  - `output=zip` (default): existing ZIP, now including the run sheet.
  - `output=cards-game-1` / `output=cards-game-2`: return a single `application/pdf` card PDF.
  - `output=run-sheet`: return the run-sheet `application/pdf`.
- Reason: the host/dashboard spec calls for direct Cards PDF / Run Sheet actions, but the current route only returns a ZIP. This makes the UI contract explicit while preserving backward compatibility.

---

## 11. New / changed file inventory

**New**
- `supabase/migrations/<ts>_add_brand_fonts_and_event_logo.sql`
- `lib/live/runOfShow.ts`, `lib/live/content.ts`
- `lib/runSheetPdf.ts`
- `components/motifs/{Sunburst,Vinyl,Eq,Ball,Bulbs,Chrome,VenueLogo,Qr,Editable}.tsx` + `EditContext.tsx`
- `components/screens/{Welcome,RunningOrder,QuizSwitch,Title,HouseRules,Warmup,GameLive,BreakScreen,Winners,ThankYou,SysLoading,SysNotFound,NowPlaying,AlbumArt}.tsx`
- `components/host/{NowPlayingPanel,GameFlowPanel,TimingPanel,ContentPanel,PlaylistPanel,RunOfShowList,SystemBanners}.tsx`
- `lib/pdfAssets.ts`
- `app/api/spotify/playlist/[playlistId]/resolve-missing/route.ts`
- `assets/fonts/Anton-Regular.ttf`, `Archivo-*.ttf`
- `public/music-bingo-gold.png` copied from the design bundle (default `event_logo_url` fallback for The Anchor)

**Changed**
- `package.json` / `package-lock.json` (`@pdf-lib/fontkit`)
- `app/layout.tsx` (fonts + static defaults), `app/globals.css` (tokens + motif classes), `tailwind.config.ts` (tokens + font families)
- `components/brand/BrandProvider.tsx` (full token set + 2 fonts), `BrandForm.tsx` (fonts + event logo), `app/brands/page.tsx` (three-pane), `app/brands/[id]/edit/page.tsx`, `app/brands/new/edit/page.tsx`
- `components/ui/{Button,Card,Badge,Notice,StepIndicator}.tsx`, `components/ui/formStyles.ts`, `components/layout/AppHeader.tsx` (dark theme)
- `lib/brands/types.ts`, `lib/brands/brandRepo.ts`, `lib/brands/brandStorage.ts` (event-logo slot)
- `lib/live/types.ts`, `lib/live/validate.ts`, `lib/live/storage.ts` (new optional fields)
- `app/guest/[sessionId]/page.tsx` (screen renderer), `app/host/[sessionId]/page.tsx` (console), `app/host/page.tsx` (dashboard), `app/prep/page.tsx` + `app/prep/Step*.tsx` (wizard restyle)
- `lib/pdf.ts` (fonts, card + events restyle, 3-event cap), `app/api/generate/route.ts` (run-sheet in ZIP + direct output modes)
- `app/api/spotify/create-playlist/route.ts` (ensure unmatched songs are returned with stable artist/title keys for the resolution route)

---

## 12. Phasing & delivery (XL → independently shippable PRs)

Ordered by dependency (migrations/tokens first, per workspace rules). Each phase ends green on the verification pipeline.

- **Phase 0 — Foundations & tokens.** Migration (5.1); brand type/repo/storage font+logo plumbing; `next/font` Anton/Archivo; `globals.css` tokens + motif classes; Tailwind tokens; `BrandProvider` full token set; restyle UI primitives + `AppHeader` to dark. *Ships: app re-themed dark; no behaviour change.* ~L.
- **Phase 1 — Shared components + state contract.** `components/motifs/*`, `components/screens/*` (rendered in isolation/host preview), `lib/live/runOfShow.ts`, `lib/live/content.ts`, runtime/session field additions (5.3) + validators. *Ships: building blocks; consumed next.* ~L.
- **Phase 2 — TV Display rebuild** (`/guest`). Screen renderer driven by `screenId`/content/reveal; system states. ~M.
- **Phase 3 — Host Controller rebuild** (`/host/[sessionId]`). Console layout, panels, run-of-show, content editing, variant controls, system banners; wire `screenId`/`content`/variants into the existing sync. ~L (couples with Phase 2 via the state contract from Phase 1).
- **Phase 4 — Setup & Manage** (`/host` dashboard + `/prep` wizard restyle + derived readiness + explicit edit-mode hydration + missing-song resolution UI/route). ~L.
- **Phase 5 — Brands & Venues** three-pane editor + live preview + fonts/event-logo. ~M.
- **Phase 6 — Print/PDF** font embedding, cards + What's-On restyle (+3-event cap), new run-sheet PDF, ZIP update. ~M.

Phases 0→1 are prerequisites; 2 & 3 share the Phase-1 contract; 4/5/6 are largely independent and can parallelise after Phase 0/1.

---

## 13. Testing, risks, rollback

### Testing (per `.claude/rules/testing.md`)
- **Unit (Node/custom scripts; add a script if needed):** `lib/live/content.ts` resolver precedence; `runOfShow` integrity; `lib/live/types` validators accept/normalise new fields; brand zod schema with new fonts; `runSheetPdf` produces bytes; `pdf` text sanitisation for Anton/Archivo glyphs. Do not assume Vitest exists unless it is deliberately added to `package.json`.
- **Python (`npm run test:py`):** keep reveal/card cross-language checks green (no algorithm change — must stay passing).
- **E2E (`scripts/e2e-flows.mjs` / Playwright):** host drives run-of-show → guest reflects `screenId`; content edit on host → appears on guest (same-device broadcast + cross-device poll); variant switch; prep unmatched-song rows can be resolved/skipped; prep → generate ZIP contains 2 card PDFs + run sheet (+ DOCX); brands save with new fonts/event logo + live preview re-themes.
- **Visual fidelity:** compare rendered screens against the source HTML/CSS in the bundle; the `screenshots/` folder is sparse and should be treated as supplemental, not the sole oracle.

### Risks & mitigations
- **R1 — Runtime contract drift** between host and guest. *Mitigation:* single shared `runOfShow.ts` + `content.ts`; additive optional fields with safe defaults; validators normalise unknown values. Old runtimes still render (`screenId` defaults to `welcome`).
- **R2 — Sync misconception.** Sync is **BroadcastChannel (same-device) + DB `runtime_data` poll (cross-device)** — *not* Supabase Realtime (CLAUDE.md is inaccurate here). Don't introduce Realtime; reuse existing paths.
- **R3 — Font licensing / size.** Anton & Archivo are OFL (Google Fonts) — safe to embed. Subset TTFs to control PDF size.
- **R4 — Dark-theme regressions.** Retiring the light theme touches every page; do Phase 0 first and verify each surface still functions before restyling internals.
- **R5 — `live_sessions.data`/`runtime_data` are untyped JSONB.** New fields are validated only in-app; ensure all read paths default safely.
- **R6 — Scope creep from "live edit everywhere".** Editing is host-side only (A5); guest TV is read-only.
- **R7 — Pixel-fidelity depends on a stable source bundle.** The bundle is available at the iCloud Downloads path above, but implementation should either copy it into `docs/design/after-hours/` or keep that absolute path accessible. Use the source HTML/CSS as the primary oracle because screenshots are sparse.
- **R8 — Prep edit/draft ambiguity.** Edit mode is in scope only for complete saved sessions with `prepData`. True draft rows are out of scope; adding them requires a new schema and separate validation.
- **R9 — Direct PDF actions could break existing ZIP consumers.** Preserve ZIP as the default `/api/generate` behavior and add direct PDFs only behind the explicit `output` field.
- **R10 — Missing-song resolution can mutate playlists after creation.** Keep the route explicit and auditable; never infer Spotify URLs from arbitrary text, and let hosts skip unresolved songs before event-pack generation.

### Migration safety / rollback
- Migration is **purely additive** (no drops); reversible by dropping the three new columns. `font_family` retained → no data loss. Backfill is idempotent. Test with `npx supabase db push --dry-run` before applying.
- Each phase is independently revertable (feature-additive); the dark-theme Phase 0 is the only "big bang" visual switch — gate behind a quick smoke test of all routes.

---

## 14. Security & compliance flags (for explicit acknowledgement)
- The app has **no authentication** and brand/session API routes have **no RBAC** (service-role client). This spec does **not** change that. If these surfaces should be access-controlled, that is a **separate** workstream requiring approval (touches auth standard, RLS, middleware) and is **out of scope** here.
- Event-feed **API keys remain server-only** (`event_feed_api_key`; clients see only `event_feed_has_key`). Maintain the secret split for any new credential field.
- Font names are user-editable brand data but must resolve through `SUPPORTED_BRAND_FONTS`; do not interpolate arbitrary DB strings into external stylesheet URLs.
- `event_logo_url` stores a Supabase Storage object key only, not an arbitrary remote URL. PDF/UI renderers must resolve it through `brand-assets` helpers, matching the existing logo SSRF boundary.
- No new PII is logged/stored. QR/booking URLs and venue details are non-sensitive.

---

## 15. Definition of done (this redesign)
- All six surfaces visually match the bundle (spot-checked against source HTML/CSS, with screenshots only as supplemental references).
- `npm run verify` green (lint 0 warnings, typecheck, `test:py`, `test:e2e`, build).
- Migration applied; brands carry `font_display`/`font_body`/`event_logo_url`; existing data intact.
- Host drives the 13-screen run-of-show; guest reflects it live on-device and cross-device; content edits and A/B/C variants propagate.
- Prep's unmatched Spotify song rows support resolve-by-track-link and skip, matching the prototype.
- ZIP from `/api/generate` contains restyled card PDFs (with What's-On back pages, ≤3 upcoming events), the DOCX clipboard, **and** the new run-sheet PDF; direct `output=*` PDF modes work if their UI actions are shipped.
- No auth/RLS introduced; no destructive migration; assumptions in §3 confirmed by the user.
