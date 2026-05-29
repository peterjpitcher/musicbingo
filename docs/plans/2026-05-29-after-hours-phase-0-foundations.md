# After Hours Redesign — Phase 0: Foundations & Tokens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the visual + data foundations for the "After Hours" redesign — fonts, design tokens, dark-themed UI primitives, the brand font/logo schema, and a unit-test harness — with **no user-facing behaviour change**, so every later phase builds on a stable base.

**Architecture:** Add Anton/Archivo via `next/font`; expand `globals.css`/Tailwind with the full design token set (hex + RGB channels + ink/cream + display/body fonts) and port the design's motif/utility classes; extend `BrandProvider` to inject the full token set with an allowlisted dynamic-font loader; restyle the shared UI primitives (`Button`/`Card`/`Badge`/`Notice`/`StepIndicator`/`formStyles`/`AppHeader`) to the dark console look; add `font_display`/`font_body`/`event_logo_url` to the `brands` table via an additive migration and thread them through types/repo/storage.

**Tech stack:** Next.js 16 (App Router), React 18.3, TypeScript (strict), Tailwind 3.4, Supabase (service-role), Vitest (added here as the TS unit-test runner — workspace default per `.claude/rules/testing.md`).

**Spec:** [docs/specs/2026-05-29-music-bingo-after-hours-redesign.md](../specs/2026-05-29-music-bingo-after-hours-redesign.md) — Phase 0 in §12; tokens §4; data model §5.1–5.2; decisions A6/A7/A9.

**Source design (oracle):** `/Users/peterpitcher/Library/Mobile Documents/com~apple~CloudDocs/Downloads/music-bingo 2/project/` — esp. `styles.css` (tokens/motifs) and `host-styles.css` (console/`.hbtn`/`.panel`).

---

## File structure

**Create**
- `docs/design/after-hours/**` — vendored copy of the design bundle (oracle for fidelity; AS0/R7).
- `vitest.config.ts` — Node-env unit-test runner with `@/` alias.
- `lib/brands/fonts.ts` — `SUPPORTED_BRAND_FONTS` registry + resolvers + Google-font href builder (A9).
- `lib/brands/fonts.test.ts` — unit tests for the registry/resolvers.
- `lib/brands/types.test.ts` — unit test that `brandSchema` accepts the new fields.
- `supabase/migrations/20260529120000_add_brand_fonts_and_event_logo.sql` — additive columns + backfill (§5.1).

**Modify**
- `package.json` — add `vitest` devDep, `test:unit` script, splice into `verify`.
- `lib/brands/types.ts` — add `font_display`/`font_body`/`event_logo_url` to schema + `BrandConfig`.
- `lib/brands/brandRepo.ts` — thread new columns through `BrandRow`/`rowToBrand`/`CreateBrandInput`/`brandToBrandConfig`.
- `lib/brands/brandStorage.ts` — add `"event-logo"` to `LogoSlot`.
- `app/globals.css` — full token set + ported motif/utility classes (keep legacy projection classes until Phase 2).
- `tailwind.config.ts` — `ink`/`cream`/`cream-dim`/`brand-primary`/`brand-accent` colours + `display`/`body` font families.
- `app/layout.tsx` — load Anton/Archivo/Inter via `next/font`; dark `<body>` base.
- `components/brand/BrandProvider.tsx` — inject hex + RGB tokens + `--brand-display`/`--brand-body` via allowlist.
- `components/ui/{Button,Card,Badge,Notice,StepIndicator}.tsx`, `components/ui/formStyles.ts`, `components/layout/AppHeader.tsx` — dark restyle.

**Out of this phase:** screen/motif components, run-of-show/content libs, runtime/session field additions (Phase 1); guest/host/dashboard/brands/PDF rebuilds (Phases 2–6). The migration is applied here but the new brand-form fields land in Phase 5.

---

## Task 1: Vendor the design bundle into the repo

**Files:**
- Create: `docs/design/after-hours/**` (copied)

- [ ] **Step 1: Copy the bundle into the repo**

```bash
mkdir -p docs/design/after-hours
cp -R "/Users/peterpitcher/Library/Mobile Documents/com~apple~CloudDocs/Downloads/music-bingo 2/project/." docs/design/after-hours/
```

- [ ] **Step 2: Verify the key files are present**

Run: `ls docs/design/after-hours`
Expected: includes `styles.css`, `host-styles.css`, `setup-styles.css`, `print-styles.css`, `app.jsx`, `host.jsx`, `screens-a.jsx`, `screens-b.jsx`, `shared.jsx`, and the `Music Bingo *.html` files.

- [ ] **Step 3: Commit**

```bash
git add docs/design/after-hours
git commit -m "docs: vendor After Hours design bundle as fidelity oracle"
```

---

## Task 2: Add Vitest as the TS unit-test runner

**Files:**
- Modify: `package.json:8-16` (scripts), `package.json:31-46` (devDependencies)
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest@^2.1.0
```

- [ ] **Step 2: Create the Vitest config with the `@/` alias**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": root },
  },
});
```

- [ ] **Step 3: Add the `test:unit` script and splice it into `verify`**

In `package.json`, edit the `scripts` block to add `test:unit` and include it in `verify` (after `typecheck`, before `test:py`):

```json
    "test:e2e": "node scripts/e2e-flows.mjs",
    "test:py": "python3 -m pytest -q",
    "test:unit": "vitest run",
    "verify": "npm run lint && npm run typecheck && npm run test:unit && npm run test:py && npm run test:e2e && npm run build"
```

- [ ] **Step 4: Add a temporary smoke test to confirm the runner works**

Create `lib/__smoke__.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the unit tests**

Run: `npm run test:unit`
Expected: PASS — 1 passed (1 test).

- [ ] **Step 6: Remove the smoke test (it has served its purpose)**

```bash
rm lib/__smoke__.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add Vitest as the TypeScript unit-test runner"
```

---

## Task 3: Brand font registry + resolvers (TDD)

**Files:**
- Create: `lib/brands/fonts.ts`
- Test: `lib/brands/fonts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/brands/fonts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SUPPORTED_BRAND_FONTS,
  DEFAULT_DISPLAY_FONT,
  DEFAULT_BODY_FONT,
  resolveSupportedFont,
  resolveBrandFonts,
  fontFamilyCss,
  buildGoogleFontHref,
} from "@/lib/brands/fonts";

describe("resolveSupportedFont", () => {
  it("returns the font when supported", () => {
    expect(resolveSupportedFont("Oswald", "Anton")).toBe("Oswald");
  });
  it("falls back when the font is unknown", () => {
    expect(resolveSupportedFont("Comic Sans", "Anton")).toBe("Anton");
  });
  it("falls back when null/empty", () => {
    expect(resolveSupportedFont(null, "Archivo")).toBe("Archivo");
    expect(resolveSupportedFont("", "Archivo")).toBe("Archivo");
  });
});

describe("resolveBrandFonts", () => {
  it("uses defaults when nothing set", () => {
    expect(resolveBrandFonts({ font_display: null, font_body: null, font_family: null }))
      .toEqual({ display: DEFAULT_DISPLAY_FONT, body: DEFAULT_BODY_FONT });
  });
  it("falls back body to legacy font_family", () => {
    expect(resolveBrandFonts({ font_display: null, font_body: null, font_family: "Poppins" }).body)
      .toBe("Poppins");
  });
  it("ignores unsupported values", () => {
    expect(resolveBrandFonts({ font_display: "Wingdings", font_body: "Oswald", font_family: null }))
      .toEqual({ display: DEFAULT_DISPLAY_FONT, body: "Oswald" });
  });
});

describe("fontFamilyCss", () => {
  it("uses the next/font variable for built-in defaults", () => {
    expect(fontFamilyCss("Anton")).toContain("var(--font-anton)");
    expect(fontFamilyCss("Archivo")).toContain("var(--font-archivo)");
  });
  it("quotes other supported families", () => {
    expect(fontFamilyCss("Oswald")).toContain("'Oswald'");
  });
});

describe("buildGoogleFontHref", () => {
  it("returns null for next/font-managed defaults", () => {
    expect(buildGoogleFontHref("Anton")).toBeNull();
    expect(buildGoogleFontHref("Archivo")).toBeNull();
  });
  it("returns null for unsupported families (no arbitrary injection)", () => {
    expect(buildGoogleFontHref("Comic Sans")).toBeNull();
  });
  it("builds a css2 URL for supported web fonts", () => {
    const href = buildGoogleFontHref("Oswald");
    expect(href).toContain("https://fonts.googleapis.com/css2?family=Oswald");
    expect(href).toContain("wght@");
  });
});

describe("SUPPORTED_BRAND_FONTS", () => {
  it("includes the defaults", () => {
    expect(SUPPORTED_BRAND_FONTS).toHaveProperty("Anton");
    expect(SUPPORTED_BRAND_FONTS).toHaveProperty("Archivo");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/brands/fonts.test.ts`
Expected: FAIL — cannot resolve module `@/lib/brands/fonts`.

- [ ] **Step 3: Write the implementation**

Create `lib/brands/fonts.ts`:

```ts
/**
 * Allowlist of brand-selectable fonts. Brand `font_display`/`font_body` values
 * MUST resolve through this registry before any dynamic Google Fonts link is
 * created — never interpolate arbitrary DB strings into stylesheet URLs (spec A9/§14).
 *
 * `nextFontVar` marks families already loaded by next/font in app/layout.tsx;
 * those are referenced via their CSS variable and never re-loaded from Google.
 */
export type SupportedFont = {
  weights: string; // css2 `wght@` list
  category: "display" | "body" | "both";
  nextFontVar?: string; // set for next/font-managed defaults
  genericFallback: string;
};

export const SUPPORTED_BRAND_FONTS: Record<string, SupportedFont> = {
  Anton: { weights: "400", category: "display", nextFontVar: "--font-anton", genericFallback: "Impact, sans-serif" },
  Archivo: { weights: "400;500;600;700;800", category: "both", nextFontVar: "--font-archivo", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
  Inter: { weights: "400;600;700;900", category: "body", nextFontVar: "--font-inter", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
  Oswald: { weights: "400;500;600;700", category: "display", genericFallback: "Impact, sans-serif" },
  "Bebas Neue": { weights: "400", category: "display", genericFallback: "Impact, sans-serif" },
  "Playfair Display": { weights: "400;600;700;800", category: "display", genericFallback: "Georgia, serif" },
  Poppins: { weights: "400;500;600;700", category: "body", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
  Montserrat: { weights: "400;500;600;700", category: "body", genericFallback: "ui-sans-serif, system-ui, sans-serif" },
};

export const DEFAULT_DISPLAY_FONT = "Anton";
export const DEFAULT_BODY_FONT = "Archivo";

export function resolveSupportedFont(name: string | null | undefined, fallback: string): string {
  if (name && Object.prototype.hasOwnProperty.call(SUPPORTED_BRAND_FONTS, name)) return name;
  return fallback;
}

export function resolveBrandFonts(input: {
  font_display?: string | null;
  font_body?: string | null;
  font_family?: string | null;
}): { display: string; body: string } {
  return {
    display: resolveSupportedFont(input.font_display, DEFAULT_DISPLAY_FONT),
    body: resolveSupportedFont(input.font_body ?? input.font_family ?? null, DEFAULT_BODY_FONT),
  };
}

/** CSS `font-family` value for a supported family (uses the next/font variable when available). */
export function fontFamilyCss(family: string): string {
  const font = SUPPORTED_BRAND_FONTS[family];
  if (!font) return `var(--font-archivo), ui-sans-serif, system-ui, sans-serif`;
  if (font.nextFontVar) return `var(${font.nextFontVar}), ${font.genericFallback}`;
  return `'${family}', ${font.genericFallback}`;
}

/** Google Fonts css2 URL for families NOT managed by next/font; null otherwise. */
export function buildGoogleFontHref(family: string): string | null {
  const font = SUPPORTED_BRAND_FONTS[family];
  if (!font || font.nextFontVar) return null;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${font.weights}&display=swap`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/brands/fonts.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add lib/brands/fonts.ts lib/brands/fonts.test.ts
git commit -m "feat: add allowlisted brand-font registry and resolvers"
```

---

## Task 4: Migration — brand fonts + event logo columns

**Files:**
- Create: `supabase/migrations/20260529120000_add_brand_fonts_and_event_logo.sql`

> Note: latest existing migration is `20260511130000_*`; this timestamp sorts after it. If another migration has since been added with a later timestamp, bump this filename accordingly.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260529120000_add_brand_fonts_and_event_logo.sql`:

```sql
-- After Hours redesign: split display/body fonts + add a gold event logo.
-- Additive only; font_family is retained as a deprecated alias of font_body.
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS font_display text,     -- e.g. "Anton"   (nullable; default resolved in app)
  ADD COLUMN IF NOT EXISTS font_body text,        -- e.g. "Archivo" (nullable; default resolved in app)
  ADD COLUMN IF NOT EXISTS event_logo_url text;   -- brand-assets Storage object key for the gold event logo

-- Backfill: existing single font becomes the body font.
UPDATE brands
  SET font_body = font_family
  WHERE font_body IS NULL AND font_family IS NOT NULL;
```

- [ ] **Step 2: Dry-run the migration**

Run: `npx supabase db push --dry-run`
Expected: the SQL is listed as a pending migration with no destructive operations flagged.

- [ ] **Step 3: Apply the migration**

Run: `npx supabase db push`
Expected: migration applied successfully.

- [ ] **Step 4: Verify the columns exist**

Run:
```bash
npx supabase db execute "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='brands' AND column_name IN ('font_display','font_body','event_logo_url') ORDER BY column_name;"
```
Expected: three rows — `event_logo_url`, `font_body`, `font_display`, all `text`, all `YES` (nullable). (If `db execute` is unavailable in this environment, run the same query in the Supabase SQL editor.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260529120000_add_brand_fonts_and_event_logo.sql
git commit -m "feat(db): add brand font_display/font_body/event_logo_url columns"
```

---

## Task 5: Extend brand zod schema + config type (TDD)

**Files:**
- Modify: `lib/brands/types.ts`
- Test: `lib/brands/types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/brands/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { brandSchema, brandInputSchema } from "@/lib/brands/types";

const base = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "The Anchor",
  is_default: true,
  logo_dark_url: "anchor/logo-dark.png",
  logo_light_url: "anchor/logo-light.png",
  color_primary: "#003F27",
  color_primary_light: "#0F6846",
  color_accent: "#A57626",
  color_accent_light: "#C4952F",
  font_family: null,
  font_display: "Anton",
  font_body: "Archivo",
  event_logo_url: "anchor/event-logo.png",
  break_message: null,
  end_message: null,
  website_url: null,
  qr_items: null,
  event_feed_type: "none",
  event_feed_base_url: null,
  event_feed_venue_id: null,
  event_feed_has_key: false,
  created_at: "2026-05-29T00:00:00.000Z",
  updated_at: "2026-05-29T00:00:00.000Z",
};

describe("brandSchema with font + event-logo fields", () => {
  it("parses a brand carrying the new fields", () => {
    const parsed = brandSchema.parse(base);
    expect(parsed.font_display).toBe("Anton");
    expect(parsed.font_body).toBe("Archivo");
    expect(parsed.event_logo_url).toBe("anchor/event-logo.png");
  });
  it("accepts null/empty for the new fields", () => {
    const parsed = brandSchema.parse({ ...base, font_display: null, font_body: null, event_logo_url: "" });
    expect(parsed.font_display).toBeNull();
    expect(parsed.event_logo_url).toBe("");
  });
  it("brandInputSchema omits server-managed fields but keeps the new ones", () => {
    const { id, created_at, updated_at, event_feed_has_key, ...input } = base;
    const parsed = brandInputSchema.parse(input);
    expect(parsed.font_display).toBe("Anton");
    expect(parsed.event_logo_url).toBe("anchor/event-logo.png");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/brands/types.test.ts`
Expected: FAIL — `brandSchema.parse` strips/rejects `font_display`/`font_body`/`event_logo_url` (unknown keys / type errors).

- [ ] **Step 3: Add the fields to the schema**

In `lib/brands/types.ts`, inside the `brandSchema = z.object({...})` definition, add these three lines immediately **after** the `font_family: z.string().max(100).nullable(),` line. They are `.optional()` (not just `.nullable()`) so the existing `BrandForm` consumer — whose UI for these fields lands in Phase 5 — keeps compiling; on input they may be omitted and defaults apply:

```ts
  font_display: z.string().max(100).nullable().optional(),
  font_body: z.string().max(100).nullable().optional(),
  event_logo_url: z.string().max(300).nullable().or(z.literal("")).optional(),
```

Then, in the `BrandConfig` type (the `Pick<Brand, ...>`), add `font_display`, `font_body`, and `event_logo_url` to the picked key union (alongside `font_family`).

`brandInputSchema` is derived via `.omit({ id, created_at, updated_at, event_feed_has_key })`, so the new fields flow through automatically — no change needed there.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/brands/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/brands/types.ts lib/brands/types.test.ts
git commit -m "feat: add font_display/font_body/event_logo_url to brand schema"
```

---

## Task 6: Thread new columns through the brand repository

**Files:**
- Modify: `lib/brands/brandRepo.ts:5-26` (`BrandRow`), `:28-51` (`rowToBrand`), `:101-121` (`brandToBrandConfig`), `:134-152` (`CreateBrandInput`)

- [ ] **Step 1: Add the columns to `BrandRow`**

In `lib/brands/brandRepo.ts`, in the `BrandRow` type, add after `font_family: string | null;`:

```ts
  font_display: string | null;
  font_body: string | null;
  event_logo_url: string | null;
```

- [ ] **Step 2: Map them in `rowToBrand`**

In `rowToBrand`, add after `font_family: row.font_family,`:

```ts
    font_display: row.font_display,
    font_body: row.font_body,
    event_logo_url: row.event_logo_url,
```

- [ ] **Step 3: Pass them through `brandToBrandConfig`**

In `brandToBrandConfig`, add after `font_family: brand.font_family,`:

```ts
    font_display: brand.font_display,
    font_body: brand.font_body,
    event_logo_url: brand.event_logo_url,
```

(Font *resolution* happens at the edge via `resolveBrandFonts` in Task 11 — `BrandConfig` carries the raw nullable values so the brand form can edit them.)

- [ ] **Step 4: Add them to `CreateBrandInput`**

In the `CreateBrandInput` type, add after `font_family?: string | null;`:

```ts
  font_display?: string | null;
  font_body?: string | null;
  event_logo_url?: string | null;
```

(`createBrand`/`updateBrand` spread `input` into the insert/update, so no further change is needed.)

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. (`Brand` and `BrandConfig` now require the three fields; `rowToBrand`/`brandToBrandConfig` provide them.)

- [ ] **Step 6: Commit**

```bash
git add lib/brands/brandRepo.ts
git commit -m "feat: thread brand font/event-logo columns through brandRepo"
```

---

## Task 7: Add the event-logo storage slot

**Files:**
- Modify: `lib/brands/brandStorage.ts:8`

- [ ] **Step 1: Extend `LogoSlot`**

In `lib/brands/brandStorage.ts`, change line 8 from:

```ts
type LogoSlot = "logo-dark" | "logo-light";
```

to:

```ts
export type LogoSlot = "logo-dark" | "logo-light" | "event-logo";
```

(Exporting it lets the brand API route — Phase 5 — validate the slot. `uploadBrandLogo` already names objects `${brandId}/${slot}.${ext}`, so `event-logo` works with no further change.)

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/brands/brandStorage.ts
git commit -m "feat: add event-logo brand storage slot"
```

---

## Task 8: globals.css — full token set + motif classes

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Replace the file contents**

Overwrite `app/globals.css` with the following. (Tokens + the design's motif/utility classes from `docs/design/after-hours/styles.css`, adapted. The legacy `.guest-projection-shell` / `.challenge-projection-shell` are **retained** so the current guest page keeps working until Phase 2 rebuilds it.)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* brand (overridden per-venue by BrandProvider) */
  --brand-primary: #003F27;        --brand-primary-rgb: 0 63 39;
  --brand-primary-light: #0F6846;  --brand-primary-light-rgb: 15 104 70;
  --brand-accent: #A57626;         --brand-accent-rgb: 165 118 38;
  --brand-accent-light: #C4952F;   --brand-accent-light-rgb: 196 149 47;

  /* fonts (next/font vars are set on <html> in layout.tsx) */
  --brand-display: var(--font-anton), Impact, sans-serif;
  --brand-body: var(--font-archivo), ui-sans-serif, system-ui, sans-serif;

  /* derived */
  --ink: #04130C;   --ink-rgb: 4 19 12;
  --cream: #F6EFDD; --cream-rgb: 246 239 221; --cream-dim: #cdbfa0;
}

/* ===== type helpers ===== */
.kicker {
  font-family: var(--brand-body), sans-serif; font-weight: 700; text-transform: uppercase;
  letter-spacing: .42em; color: var(--brand-accent-light);
  display: inline-flex; align-items: center; gap: 22px; white-space: nowrap;
}
.kicker::before, .kicker::after { content: ""; width: 54px; height: 2px;
  background: linear-gradient(90deg, transparent, var(--brand-accent-light)); }
.kicker--plain::before, .kicker--plain::after { display: none; }
.display {
  font-family: var(--brand-display), Impact, sans-serif; font-weight: 400;
  text-transform: uppercase; line-height: .9; letter-spacing: .005em; margin: 0; color: var(--cream);
}
.display--gold {
  background: linear-gradient(180deg, #fff6dd 0%, var(--brand-accent-light) 42%, var(--brand-accent) 100%);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  white-space: nowrap; padding: 0 0.12em;
}
.display--gold > div, .display--gold > span { white-space: nowrap; }
.lede { line-height: 1.35; font-weight: 500; color: rgb(var(--cream-rgb) / .86); margin: 0; text-wrap: pretty; }
.pill {
  display: inline-flex; align-items: center; gap: 14px; padding: 14px 30px; border-radius: 999px;
  border: 2px solid rgb(var(--brand-accent-light-rgb) / .7); background: rgb(var(--brand-accent-rgb) / .14);
  color: var(--brand-accent-light); font-weight: 700; text-transform: uppercase; letter-spacing: .14em;
  backdrop-filter: blur(4px);
}
.rule { height: 3px; border: 0; width: 100%;
  background: linear-gradient(90deg, transparent, var(--brand-accent), transparent); }

/* ===== screen backgrounds ===== */
.screen {
  position: absolute; inset: 0; display: flex; flex-direction: column; color: var(--cream); overflow: hidden;
  background:
    radial-gradient(130% 100% at 50% -20%, rgb(var(--brand-primary-light-rgb) / .55) 0%, transparent 55%),
    radial-gradient(80% 70% at 50% 120%, rgb(var(--brand-accent-rgb) / .18) 0%, transparent 60%),
    linear-gradient(180deg, var(--brand-primary) 0%, var(--ink) 100%);
}
.screen--warm {
  background:
    radial-gradient(130% 100% at 50% -10%, rgb(var(--brand-accent-light-rgb) / .6) 0%, transparent 55%),
    linear-gradient(180deg, var(--brand-accent) 0%, var(--ink) 100%);
}
.grain::after {
  content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 40; opacity: .05; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.vignette::before { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 35;
  box-shadow: inset 0 0 240px 60px rgba(0,0,0,.55); }

/* ===== disco motifs (all CSS) ===== */
.sunburst {
  position: absolute; border-radius: 50%; opacity: .5; animation: spin 80s linear infinite;
  background: repeating-conic-gradient(from 0deg, rgb(var(--brand-accent-rgb) / .38) 0deg 6deg, transparent 6deg 12deg);
  -webkit-mask: radial-gradient(closest-side, transparent 12%, #000 16%, #000 100%);
          mask: radial-gradient(closest-side, transparent 12%, #000 16%, #000 100%);
}
@keyframes spin { to { transform: rotate(360deg); } }
.vinyl {
  position: relative; border-radius: 50%; display: grid; place-items: center; animation: spin 6s linear infinite;
  background: radial-gradient(circle at 50% 50%, #1b1b1b 0 17%, transparent 17.4%),
    repeating-radial-gradient(circle at 50% 50%, #0c0c0c 0 2px, #161616 2px 4px), #0a0a0a;
  box-shadow: 0 30px 80px rgba(0,0,0,.6), inset 0 0 0 2px rgba(255,255,255,.04);
}
.vinyl__label { width: 34%; height: 34%; border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle, var(--brand-accent-light), var(--brand-accent));
  box-shadow: inset 0 0 0 4px rgba(0,0,0,.25); }
.vinyl__hole { width: 7%; height: 7%; border-radius: 50%; background: var(--ink); box-shadow: 0 0 0 6px rgba(0,0,0,.25); }
.eq { display: flex; align-items: flex-end; gap: 7px; height: 60px; }
.eq i { width: 10px; border-radius: 4px 4px 0 0;
  background: linear-gradient(180deg, var(--brand-accent-light), var(--brand-accent));
  animation: eq 900ms ease-in-out infinite alternate; }
@keyframes eq { from { height: 18%; } to { height: 100%; } }
.ball {
  border-radius: 50%; display: grid; place-items: center; font-family: var(--brand-display), sans-serif;
  color: var(--ink); position: relative;
  background: radial-gradient(circle at 35% 28%, #fff 0%, var(--brand-accent-light) 30%, var(--brand-accent) 78%);
  box-shadow: inset 0 -10px 22px rgba(0,0,0,.25), 0 14px 30px rgba(0,0,0,.4);
}
.ball::after { content:""; position:absolute; inset: 14%; border-radius:50%; border: 3px solid rgba(255,255,255,.5); }
.chrome {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 30; display: flex; align-items: center;
  justify-content: space-between; padding: 22px 56px; letter-spacing: .18em; text-transform: uppercase;
  color: rgb(var(--cream-rgb) / .6);
}
.chrome .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--brand-accent-light);
  box-shadow: 0 0 14px var(--brand-accent-light); display: inline-block; margin-right: 12px;
  animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .35; } }

/* ===== entrance animations ===== */
@keyframes rise { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pop  { from { opacity: 0; transform: scale(.8); } to { opacity: 1; transform: none; } }
@keyframes slideL { from { opacity:0; transform: translateX(-60px);} to {opacity:1; transform:none;} }
.an-rise { animation: rise .8s cubic-bezier(.2,.8,.2,1) backwards; }
.an-fade { animation: fade 1s ease backwards; }
.an-pop  { animation: pop .7s cubic-bezier(.2,1.2,.3,1) backwards; }
.an-slideL { animation: slideL .7s cubic-bezier(.2,.8,.2,1) backwards; }
.d1{ animation-delay:.08s;} .d2{ animation-delay:.18s;} .d3{ animation-delay:.30s;}
.d4{ animation-delay:.42s;} .d5{ animation-delay:.56s;} .d6{ animation-delay:.7s;}

/* ===== host-side click-to-edit (enabled only inside the host preview) ===== */
[data-edit] { outline: none; border-radius: 6px; transition: box-shadow .15s, background .15s; }
.editing [data-edit] { box-shadow: 0 0 0 2px rgb(var(--brand-accent-light-rgb) / .7); background: rgba(0,0,0,.18); cursor: text; }
.editing [data-edit]:hover { box-shadow: 0 0 0 2px var(--brand-accent-light); }
.editing [data-edit]:focus { box-shadow: 0 0 0 3px var(--brand-accent-light); background: rgba(0,0,0,.3); }
[data-edit]:empty::before { content: attr(data-placeholder); opacity: .4; }

/* ===== LEGACY (retained until Phase 2 rebuilds the guest page) ===== */
.guest-projection-shell {
  background:
    radial-gradient(circle at 10% 20%, rgb(var(--brand-accent-rgb) / 0.14), transparent 45%),
    radial-gradient(circle at 90% 10%, rgb(var(--brand-primary-light-rgb) / 0.22), transparent 50%),
    linear-gradient(180deg, rgb(var(--brand-primary-rgb)) 0%, rgb(var(--brand-primary-rgb) / 0.85) 100%);
}
.challenge-projection-shell {
  background:
    radial-gradient(circle at 20% 15%, rgb(254 240 138 / 0.35), transparent 34%),
    radial-gradient(circle at 80% 0%, rgb(251 191 36 / 0.35), transparent 38%),
    linear-gradient(180deg, rgb(245 158 11) 0%, rgb(217 119 6) 48%, rgb(146 64 14) 100%);
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds (CSS compiles; no Tailwind errors).

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add After Hours design tokens and motif classes to globals.css"
```

---

## Task 9: Tailwind tokens

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Extend colours and font families**

In `tailwind.config.ts`, replace the `theme.extend` block with:

```ts
    extend: {
      colors: {
        "brand-green": "rgb(var(--brand-primary-rgb) / <alpha-value>)",
        "brand-green-light": "rgb(var(--brand-primary-light-rgb) / <alpha-value>)",
        "brand-gold": "rgb(var(--brand-accent-rgb) / <alpha-value>)",
        "brand-gold-light": "rgb(var(--brand-accent-light-rgb) / <alpha-value>)",
        "brand-primary": "rgb(var(--brand-primary-rgb) / <alpha-value>)",
        "brand-accent": "rgb(var(--brand-accent-rgb) / <alpha-value>)",
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        cream: "rgb(var(--cream-rgb) / <alpha-value>)",
        "cream-dim": "#cdbfa0",
      },
      fontFamily: {
        sans: ["var(--brand-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--brand-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--brand-display)", "Impact", "sans-serif"],
      },
    },
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds; utilities like `bg-ink`, `text-cream`, `font-display` are now available.

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat: add ink/cream + display/body font tokens to Tailwind"
```

---

## Task 10: Layout — load Anton/Archivo/Inter via next/font; dark body

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Replace the file**

Overwrite `app/layout.tsx`:

```tsx
import "./globals.css";
import type { Metadata } from "next";
import { Inter, Anton, Archivo } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });

export const metadata: Metadata = {
  title: "Music Bingo",
  description: "Generate music bingo cards (PDF) and a private Spotify playlist.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${anton.variable} ${archivo.variable}`}>
      <body className="min-h-screen bg-ink text-cream font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds; the three fonts are fetched/optimised by next/font.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: load Anton/Archivo via next/font and set dark body base"
```

---

## Task 11: BrandProvider — full token set + allowlisted fonts (TDD on the helper)

**Files:**
- Modify: `components/brand/BrandProvider.tsx`
- (Helpers `fontFamilyCss`/`buildGoogleFontHref` already tested in Task 3.)

- [ ] **Step 1: Replace the component**

Overwrite `components/brand/BrandProvider.tsx`:

```tsx
"use client";

import { useEffect, type ReactNode } from "react";
import { hexToRgbChannels } from "@/lib/brands/hexToRgb";
import { resolveBrandFonts, fontFamilyCss, buildGoogleFontHref } from "@/lib/brands/fonts";
import type { BrandConfig } from "@/lib/brands/types";

type BrandProviderProps = {
  brand: BrandConfig | null;
  children: ReactNode;
};

function setBrandFontLink(attr: string, family: string) {
  const existing = document.querySelector(`link[${attr}]`);
  if (existing) existing.remove();
  const href = buildGoogleFontHref(family);
  if (!href) return; // next/font-managed default or unsupported — nothing to load
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute(attr, "true");
  document.head.appendChild(link);
}

export function BrandProvider({ brand, children }: BrandProviderProps): ReactNode {
  useEffect(() => {
    if (!brand) return;
    const root = document.documentElement;

    // Hex + RGB-channel tokens (the design uses both forms).
    const colours: Array<[string, string]> = [
      ["--brand-primary", brand.color_primary],
      ["--brand-primary-light", brand.color_primary_light],
      ["--brand-accent", brand.color_accent],
      ["--brand-accent-light", brand.color_accent_light],
    ];
    for (const [name, hex] of colours) {
      root.style.setProperty(name, hex);
      root.style.setProperty(`${name}-rgb`, hexToRgbChannels(hex));
    }

    // Fonts — resolved through the allowlist (A9); links only for non-next/font families.
    const { display, body } = resolveBrandFonts(brand);
    root.style.setProperty("--brand-display", fontFamilyCss(display));
    root.style.setProperty("--brand-body", fontFamilyCss(body));
    setBrandFontLink("data-brand-font-display", display);
    setBrandFontLink("data-brand-font-body", body);

    document.title = `${brand.name} — Music Bingo`;

    return () => {
      for (const [name] of colours) {
        root.style.removeProperty(name);
        root.style.removeProperty(`${name}-rgb`);
      }
      root.style.removeProperty("--brand-display");
      root.style.removeProperty("--brand-body");
      document.querySelector("link[data-brand-font-display]")?.remove();
      document.querySelector("link[data-brand-font-body]")?.remove();
      document.title = "Music Bingo";
    };
  }, [brand]);

  return <>{children}</>;
}
```

- [ ] **Step 2: Verify types + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/brand/BrandProvider.tsx
git commit -m "feat: inject full brand token set with allowlisted dynamic fonts"
```

---

## Task 12: Restyle core UI primitives to dark (Button, Card, Badge, Notice, formStyles)

> Pure visual restyle to the `host-styles.css` console look. APIs (props/variants) are unchanged. Verification is typecheck + build + lint + manual smoke (no unit test — visual).

**Files:**
- Modify: `components/ui/Button.tsx:7-21`, `components/ui/Card.tsx:13`, `components/ui/Badge.tsx:8-12`, `components/ui/Notice.tsx:9-14`, `components/ui/formStyles.ts`

- [ ] **Step 1: Button — dark variants**

In `components/ui/Button.tsx`, replace `variantClasses` (lines 7-16):

```ts
const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-gold hover:bg-brand-gold-light text-ink border-brand-gold-light shadow-sm",
  secondary:
    "bg-white/[0.06] hover:bg-white/[0.12] text-cream border-white/[0.16]",
  danger:
    "bg-red-500/20 hover:bg-red-500/30 text-red-200 border-red-400/60",
  success:
    "bg-emerald-600 hover:bg-emerald-500 text-emerald-50 border-emerald-400/70 shadow-sm",
};
```

- [ ] **Step 2: Card — dark panel**

In `components/ui/Card.tsx`, replace the `base` (line 13-14):

```ts
  const base =
    "bg-ink/60 rounded-2xl border border-brand-gold/30 shadow-[0_18px_50px_rgba(0,0,0,0.4)] p-6 sm:p-8 text-cream";
```

- [ ] **Step 3: Badge — dark states**

In `components/ui/Badge.tsx`, replace `base` + `state` (lines 8-12):

```ts
  const base =
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide border transition-colors";
  const state = active
    ? "border-brand-gold-light bg-brand-gold/20 text-brand-gold-light"
    : "border-white/15 bg-black/20 text-cream/60";
```

- [ ] **Step 4: Notice — dark variants**

In `components/ui/Notice.tsx`, replace `variantClasses` (lines 9-14):

```ts
const variantClasses: Record<Variant, string> = {
  success: "bg-emerald-500/15 border-emerald-400/50 text-emerald-200",
  warning: "bg-amber-500/15 border-amber-400/50 text-amber-200",
  error: "bg-red-500/15 border-red-400/50 text-red-200",
  info: "bg-sky-500/15 border-sky-400/50 text-sky-200",
};
```

- [ ] **Step 5: formStyles — dark inputs**

Overwrite `components/ui/formStyles.ts`:

```ts
export const inputClass =
  "w-full bg-black/30 border border-white/15 rounded-xl px-4 py-2.5 text-cream text-sm placeholder:text-cream/40 focus:outline-none focus:border-brand-gold-light focus:ring-2 focus:ring-brand-gold/20 transition-colors";

export const textareaClass =
  "w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-cream text-sm placeholder:text-cream/40 focus:outline-none focus:border-brand-gold-light focus:ring-2 focus:ring-brand-gold/20 transition-colors min-h-[200px] resize-y";

export const selectClass =
  "w-full bg-black/30 border border-white/15 rounded-xl px-4 py-2.5 text-cream text-sm focus:outline-none focus:border-brand-gold-light focus:ring-2 focus:ring-brand-gold/20 transition-colors appearance-none";

export const labelClass = "block text-xs font-bold uppercase tracking-wide text-cream/65 mb-1.5";

export const helpClass = "text-xs text-cream/45 mt-1";
```

- [ ] **Step 6: Verify lint + types + build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: zero warnings, no type errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/ui/Button.tsx components/ui/Card.tsx components/ui/Badge.tsx components/ui/Notice.tsx components/ui/formStyles.ts
git commit -m "feat: restyle core UI primitives to the dark console theme"
```

---

## Task 13: Restyle StepIndicator + AppHeader to dark

**Files:**
- Modify: `components/ui/StepIndicator.tsx:22-30`, `:59-72`; `components/layout/AppHeader.tsx`

- [ ] **Step 1: StepIndicator — dark circles, labels, connectors**

In `components/ui/StepIndicator.tsx`, in `circleClass` (lines 22-30) replace the inactive branch and the done/active colours:

```ts
        const circleClass = [
          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors",
          canNavigate ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink" : "",
          done || active
            ? "bg-brand-gold border-brand-gold-light text-ink"
            : "bg-black/25 border-white/20 text-cream/50",
        ].join(" ");
```

In the label `<span>` (lines 59-65) replace the colour expression:

```ts
                className={[
                  "text-xs font-medium whitespace-nowrap",
                  active ? "text-brand-gold-light" : done ? "text-cream/70" : "text-cream/40",
                ].join(" ")}
```

In the connector `<div>` (lines 67-72) replace the colour expression:

```ts
                className={[
                  "flex-1 h-0.5 mt-[-14px] mx-1",
                  done ? "bg-brand-gold" : "bg-white/15",
                ].join(" ")}
```

- [ ] **Step 2: AppHeader — dark default**

Overwrite `components/layout/AppHeader.tsx`:

```tsx
import Image from "next/image";
import type { ReactNode } from "react";

type Variant = "light" | "dark";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  variant?: Variant;
  logoDarkUrl?: string;
  logoLightUrl?: string;
  logoAlt?: string;
};

export function AppHeader({
  title,
  subtitle,
  actions,
  variant = "dark",
  logoDarkUrl,
  logoLightUrl,
  logoAlt,
}: AppHeaderProps) {
  const isDark = variant === "dark";

  return (
    <header
      className={[
        "sticky top-0 z-20 flex items-center justify-between gap-5 px-6 py-4 backdrop-blur",
        isDark
          ? "bg-ink/85 border-b border-brand-gold/35"
          : "bg-white/95 border-b border-slate-200 shadow-sm",
      ].join(" ")}
    >
      <div className="flex items-center gap-3.5">
        <Image
          src={
            isDark
              ? (logoDarkUrl ?? "/the-anchor-pub-logo-white-transparent.png")
              : (logoLightUrl ?? "/the-anchor-pub-logo-black-transparent.png")
          }
          alt={logoAlt ?? "Logo"}
          width={140}
          height={44}
          priority
          className="max-h-11 w-auto object-contain"
        />
        <div>
          <h1
            className={[
              "m-0 text-2xl font-display uppercase tracking-wide leading-none",
              isDark ? "text-cream" : "text-slate-900",
            ].join(" ")}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={[
                "m-0 mt-1 text-[11px] font-bold uppercase tracking-[0.28em]",
                isDark ? "text-brand-gold-light" : "text-slate-500",
              ].join(" ")}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 flex-wrap">{actions}</div>
      )}
    </header>
  );
}
```

> Note: pages currently pass `variant="light"` explicitly (host/lobby/prep/brands). Those explicit props are removed when each page is rebuilt in Phases 2–5; until then they render the (retained) light header. The default is now `dark` so any new usage is themed correctly.

- [ ] **Step 3: Verify lint + types + build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: zero warnings, no type errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/ui/StepIndicator.tsx components/layout/AppHeader.tsx
git commit -m "feat: restyle StepIndicator and AppHeader to the dark theme"
```

---

## Task 14: Phase 0 verification gate + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full verification pipeline**

Run: `npm run verify`
Expected: `lint` (0 warnings) → `typecheck` (clean) → `test:unit` (fonts + types tests pass) → `test:py` (unchanged, pass) → `test:e2e` (pass) → `build` (succeeds).

- [ ] **Step 2: Manual smoke — every route renders, existing behaviour intact**

Run: `npm run dev`, then load each route and confirm no console errors and core behaviour still works:
- `/host` — lobby table renders (chrome may look transitional until Phase 4; functionality intact).
- `/host/<existing-session-id>` — controller loads; Spotify status + run-of-show controls still function.
- `/guest/<existing-session-id>` — projection still renders reveals (uses retained legacy projection classes).
- `/prep` — wizard steps render; can navigate.
- `/brands` and `/brands/<id>/edit` — list + form render; saving a brand still works (new font/event-logo fields arrive in Phase 5).

Expected: all routes render; fonts are Archivo (body) / Anton (display headings); no runtime errors; saving/controls behave as before.

- [ ] **Step 3: Commit any fixes, then tag the phase**

```bash
git add -A
git commit -m "chore: Phase 0 foundations verified (tokens, fonts, dark primitives, brand schema)"
```

---

## Self-review

**Spec coverage (Phase 0 scope, §12):**
- Migration (§5.1) → Task 4. Brand type/repo/storage font+logo plumbing (§5.2) → Tasks 5–7. `next/font` Anton/Archivo (§4.1) → Task 10. `globals.css` tokens + motif classes (§4.2) → Task 8. Tailwind tokens (§4.3) → Task 9. `BrandProvider` full token set + allowlisted fonts (A7/A9) → Task 11. Restyle UI primitives + AppHeader (A6) → Tasks 12–13. Unit-test home (§13) → Task 2. Design-bundle vendoring (AS0/R7) → Task 1.
- Deferred by design (not Phase 0): motif/screen components, `runOfShow.ts`/`content.ts`, runtime/session fields (Phase 1); surface rebuilds + PDF (Phases 2–6); brand-form UI for the new fields (Phase 5); `@pdf-lib/fontkit` + `lib/pdfAssets.ts` (Phase 6).

**Placeholder scan:** none — every code step shows full content or an exact insert with anchor text; the only `<...>`-style token is the deliberate "bump timestamp if needed" note in Task 4.

**Type/name consistency:** `resolveBrandFonts`/`fontFamilyCss`/`buildGoogleFontHref`/`SUPPORTED_BRAND_FONTS` are defined in Task 3 and consumed identically in Task 11; `LogoSlot` exported in Task 7; `font_display`/`font_body`/`event_logo_url` named identically across migration (Task 4), schema (Task 5), repo (Task 6), and provider input (Task 11 via `resolveBrandFonts`). Tailwind tokens `ink`/`cream`/`brand-gold(-light)`/`font-display` defined in Task 9 are used by Tasks 10/12/13.

**Known intra-phase visual transient:** between Tasks 10 and 13 the admin pages mix a dark body with light page internals; this never ships independently — the phase is one unit, gated by Task 14. Acceptable per spec R4.
