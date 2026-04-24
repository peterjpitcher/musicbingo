# Multi-Brand Support — Design Spec

> Allow the host to select a brand (venue) for each Music Bingo session, customising logos, colours, fonts, messaging, and printed materials across all screens.

## 1. Goals & Success Criteria

- Hosts can create and manage multiple venue brands from a dedicated `/brands` admin page
- Each session can be assigned a brand at creation or changed from the host prep screen
- All screens (guest projection, host dashboard, PDF bingo cards) reflect the selected brand
- The Anchor Pub is pre-seeded as the default brand — existing sessions and the app out-of-the-box look identical to today
- Adding a new brand requires zero code changes — it's entirely admin-driven

## 2. Data Model

### 2.1 New Table: `brands`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `name` | text | NO | — | e.g. "The Anchor Pub" |
| `is_default` | boolean | NO | `false` | Only one row may be `true` |
| `logo_dark_url` | text | NO | — | Logo for dark backgrounds (white/light variant) |
| `logo_light_url` | text | NO | — | Logo for light backgrounds (dark variant) |
| `color_primary` | text | NO | — | Main brand colour, e.g. `#003f27` |
| `color_primary_light` | text | NO | — | Lighter primary variant, e.g. `#0f6846` |
| `color_accent` | text | NO | — | Accent colour, e.g. `#a57626` |
| `color_accent_light` | text | NO | — | Lighter accent variant, e.g. `#c4952f` |
| `font_family` | text | YES | `null` | Google Font name. `null` = Inter (default) |
| `break_message` | text | YES | `null` | Break screen message. `null` = no message shown |
| `end_message` | text | YES | `null` | End-of-game screen message. `null` = no message shown |
| `website_url` | text | YES | `null` | Venue website URL |
| `qr_items` | jsonb | YES | `null` | Array of `{ label: string, url: string }` for PDF footer QR codes. Validated server-side with Zod: `z.array(z.object({ label: z.string().max(50), url: z.string().url() })).max(4)` |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

**Constraints:**
- Unique partial index on `is_default WHERE is_default = true` (enforces single default)
- `CHECK` constraints on all colour columns: `CHECK (color_primary ~ '^#[0-9a-fA-F]{6}$')` (and same for `color_primary_light`, `color_accent`, `color_accent_light`)
- App-level fallback: if no brand has `is_default = true`, resolve to the first brand by `created_at`
- Prevent deletion of the last remaining default brand (enforced in server action logic)

### 2.2 `live_sessions` Change

Add column:
- `brand_id uuid REFERENCES brands(id)` — nullable. When null, the app resolves to the brand where `is_default = true`.

### 2.3 Supabase Storage

- New public bucket: `brand-assets`
- Logo files stored as `{brand_id}/logo-dark.png` and `{brand_id}/logo-light.png`
- `logo_dark_url` / `logo_light_url` store **object keys** (e.g. `{brand_id}/logo-dark.png`), not full URLs — the full Supabase Storage URL is constructed at read time. This prevents SSRF: the PDF renderer and UI only ever fetch from the known `brand-assets` bucket.
- **Upload validation:** MIME type must be `image/png` or `image/jpeg`, max file size 2MB, max dimensions 2000x2000px

### 2.4 Pre-Seeded Data

One migration seeds The Anchor Pub as the default brand:

| Field | Value |
|-------|-------|
| `name` | The Anchor Pub |
| `is_default` | `true` |
| `logo_dark_url` | Initially references `/the-anchor-pub-logo-white-transparent.png` in `/public`. Migrated to Storage on first admin visit or via post-deploy script. |
| `logo_light_url` | Initially references `/the-anchor-pub-logo-black-transparent.png` in `/public`. Migrated to Storage on first admin visit or via post-deploy script. |
| `color_primary` | `#003f27` |
| `color_primary_light` | `#0f6846` |
| `color_accent` | `#a57626` |
| `color_accent_light` | `#c4952f` |
| `font_family` | `null` (Inter default) |
| `break_message` | `🍺 Head to the bar! Kitchen is open until 9pm.` |
| `end_message` | `🍺 Drinks & food orders at the bar — kitchen open until 9pm.` |
| `website_url` | `https://the-anchor.pub` |
| `qr_items` | Current QR items from Anchor Management API (if applicable), or `null` |

### 2.5 RLS & Access Control

- RLS disabled on `brands` (same pattern as `live_sessions` — accessed via service-role client)
- The `brand-assets` storage bucket is public (logos need to be accessible by guest browsers without auth)
- **All brand CRUD and logo uploads require authenticated host access.** Server actions for brand create/update/delete must verify the user is authenticated before proceeding. The `/brands` page itself is protected by the same auth middleware as `/host`.

## 3. Brand Admin Page (`/brands`)

### 3.1 Layout

- **Brand listing** — responsive card grid
- Each card shows:
  - Preview header bar in the brand's primary colour with logo thumbnail
  - Colour palette swatches (4 circles)
  - Font name
  - Break message snippet (truncated)
  - Edit / Preview / Delete buttons
- Default brand has a gold border and star badge
- "Add New Brand" card with dashed border at the end
- "+ New Brand" button in the page header

### 3.2 Brand Editor

Opens as a separate page or modal when clicking Edit or + New Brand.

**Fields (two-column layout):**

Left column:
- Brand Name (text input, required)
- Colours — 4 colour pickers with hex input: Primary, Primary Light, Accent, Accent Light
- Font Family — dropdown of curated Google Fonts (Inter, Playfair Display, Poppins, Montserrat, etc.)

Right column:
- Logo (Dark Background) — drag-and-drop upload area, shows preview on dark swatch
- Logo (Light Background) — drag-and-drop upload area, shows preview on light swatch
- Website URL (text input, optional)
- QR Codes — repeatable label + URL pair fields (add/remove rows)
- Break Screen Message (textarea, optional)
- End Screen Message (textarea, optional)

Footer:
- "Set as default brand" checkbox
- Cancel / Save Brand buttons

### 3.3 Behaviour

- **Preview button** on brand cards opens a mock guest screen rendered with that brand's config
- **Delete** is blocked for the default brand and for brands currently assigned to any session
- **Setting a new default** automatically unsets the previous default (single transaction)
- **Logo upload** goes to `brand-assets/{brand_id}/` in Supabase Storage; the public URL is stored in the brand row

## 4. Host Screen Integration

### 4.1 Session Creation

- Brand dropdown in the create-session form
- Pre-filled with the default brand
- Dropdown shows brand name + colour dot for quick identification

### 4.2 Host Prep / Game Screen

- Brand selector in the session settings area (dropdown or similar)
- Changeable at any time before or during the session
- Changing the brand updates `brand_id` on the `live_sessions` row
- The update triggers a Supabase Realtime broadcast to all connected guest screens
- The host screen header (logo, colours) also reflects the selected brand

### 4.3 Realtime Propagation

- The session API response includes the full brand config (joined from `brands` table), not just the `brand_id` FK
- When the host changes the brand, the server action:
  1. Updates `brand_id` on the `live_sessions` row
  2. Fetches the full brand config for the new `brand_id`
  3. Broadcasts a `brand_update` message on the session's Realtime channel containing the complete brand payload
- Guest screens receive the `brand_update` message, re-apply CSS variables, and swap the logo without a full page reload
- This avoids a race condition where the guest would need to re-fetch the brand by ID after seeing the FK change

## 5. Runtime Theming (CSS Custom Properties)

### 5.1 CSS Variables

Brand colours are injected as CSS custom properties on the root element using **RGB channel variables** to preserve Tailwind opacity modifier support (`/50`, `/70`, etc.):

```css
:root {
  --brand-primary-rgb: 0 63 39;
  --brand-primary-light-rgb: 15 104 70;
  --brand-accent-rgb: 165 118 38;
  --brand-accent-light-rgb: 196 149 47;
  --brand-font: 'Inter', ui-sans-serif, system-ui, sans-serif;
}
```

### 5.2 Tailwind Config Change

Replace hardcoded hex values with RGB channel variable references:

```ts
colors: {
  "brand-green": "rgb(var(--brand-primary-rgb) / <alpha-value>)",
  "brand-green-light": "rgb(var(--brand-primary-light-rgb) / <alpha-value>)",
  "brand-gold": "rgb(var(--brand-accent-rgb) / <alpha-value>)",
  "brand-gold-light": "rgb(var(--brand-accent-light-rgb) / <alpha-value>)",
}
```

All existing Tailwind classes (`bg-brand-green`, `text-brand-gold`, `border-brand-gold/50`, etc.) continue to work unchanged — including opacity modifiers like `/50` which require the RGB channel format.

### 5.3 `globals.css` Update

The `.guest-projection-shell` gradient replaces hardcoded hex values with CSS variables using the RGB channel format:

```css
.guest-projection-shell {
  background:
    radial-gradient(circle at 10% 20%, rgb(var(--brand-accent-rgb) / 0.14), transparent 45%),
    radial-gradient(circle at 90% 10%, rgb(var(--brand-primary-light-rgb) / 0.22), transparent 50%),
    linear-gradient(180deg, rgb(var(--brand-primary-rgb)) 0%, rgb(var(--brand-primary-rgb) / 0.85) 100%);
}
```

### 5.4 `BrandProvider` Component

A thin client component that:
1. Receives the brand config as props (passed from a server component that fetches the brand)
2. Converts hex colours to RGB channels (e.g. `#003f27` → `0 63 39`) and sets CSS custom properties on `document.documentElement` on mount and when brand changes
3. If `font_family` is set, dynamically loads the Google Font via a `<link>` tag insertion
4. Sets `--brand-font` to the loaded font family with fallbacks

### 5.5 Fallback

CSS variables default to The Anchor colours (as RGB channels) in `globals.css`:

```css
:root {
  --brand-primary-rgb: 0 63 39;
  --brand-primary-light-rgb: 15 104 70;
  --brand-accent-rgb: 165 118 38;
  --brand-accent-light-rgb: 196 149 47;
  --brand-font: 'Inter', ui-sans-serif, system-ui, sans-serif;
}
```

Pages without a session context (e.g. `/brands`) always render with these defaults.

## 6. Guest Screen Theming

Every visual element on the guest projection screen adapts to the brand:

| Element | Source |
|---------|--------|
| Background gradient | Generated from `--brand-primary` + `--brand-accent` (same radial pattern, different colour inputs) |
| Header bar | `--brand-primary` background, `--brand-accent` border |
| Header logo | Brand's `logo_dark_url` from storage |
| Content cards (waiting, break, paused, ended) | `--brand-primary` background, `--brand-accent` border |
| QR code foreground | `--brand-primary` |
| Break screen message | `brand.break_message` |
| End screen message | `brand.end_message` |
| Footer bar | `--brand-primary-light` border, `--brand-primary` background |
| Typography | `--brand-font` (loaded dynamically via Google Fonts) |
| Challenge banner | `--brand-accent` background |

The gradient pattern structure (radial "dust" circles + linear base) stays the same across all brands — only the colour inputs change.

## 7. PDF Bingo Card Branding

### 7.1 Header Layout

- **Top-left:** Event logo (`event_logo.jpeg` from `/public`) — fixed across all brands, never changes
- **Top-right:** Brand logo fetched from `brand.logo_light_url` (the dark/print variant), auto-converted to monochrome by the existing Sharp pipeline

### 7.2 Colour Changes

| Element | Currently | With branding |
|---------|-----------|---------------|
| Grid borders | `rgb(0, 0, 0)` (black) | `brand.color_primary` converted to `rgb()` |
| Title text ("MUSIC BINGO") | `rgb(0, 0, 0)` | `brand.color_primary` converted to `rgb()` |
| Card ID text | `rgb(0, 0, 0)` | `brand.color_primary` converted to `rgb()` |
| QR code foreground | Black | `brand.color_primary` |

### 7.3 QR Code / Footer Logic

The PDF footer QR codes are sourced from the brand config:

1. If `brand.qr_items` is defined and non-empty → use those as footer QR codes (array of `{ label, url }`, same format as existing `FooterQrItem`)
2. If no `qr_items` but `brand.website_url` is set → generate a single QR code pointing to the website with label "Upcoming Events"
3. If neither is set → no footer QR codes or text (clean card)

### 7.4 Fonts

PDF fonts remain as Helvetica (StandardFonts). Embedding custom fonts in pdf-lib requires font file bytes and adds significant complexity for minimal visual gain on printed bingo cards. Web fonts handle brand personality; PDFs stay clean and functional.

### 7.5 `lib/pdf.ts` Changes

- `RenderOptions` type gains an optional `brand` field containing the brand config
- `renderBingoCards()` reads colours and logo URLs from the brand when provided
- Logo loading functions (`loadDefaultLogoPngBytes`, `loadDefaultEventLogoPngBytes`) are supplemented with a new `loadBrandLogoPngBytes(objectKey)` that constructs the full Supabase Storage URL from the object key and fetches from the known `brand-assets` bucket only
- Event logo loading (`loadDefaultEventLogoPngBytes`) remains unchanged — always loads from `/public`
- Hex-to-rgb helper function added for converting brand hex colours to pdf-lib `rgb()` values

## 8. Page Metadata

- **Title:** Dynamic — `{brand.name} — Music Bingo` when a session with a brand is loaded. Falls back to "Music Bingo" on pages without session context.
- **Favicon:** Static — stays as the generic Music Bingo favicon. Per-brand favicons add complexity for minimal value.
- **OG tags:** Static — generic description. These pages aren't shared on social media.

## 9. DOCX Generation

No changes. The DOCX export is a plain-text song list with no visual branding.

## 10. Scope Boundaries

**In scope:**
- `brands` table, migrations, seed data
- `brand-assets` Supabase Storage bucket
- `/brands` admin page (listing + editor)
- `brand_id` on `live_sessions`
- Brand dropdown on host creation + prep screen
- CSS variable theming infrastructure (`BrandProvider`, Tailwind config, `globals.css`)
- Guest screen brand adaptation
- PDF brand adaptation (colours, logos, QR items)
- Dynamic page title

**Out of scope:**
- Per-brand favicons
- Per-brand OG images
- Custom PDF fonts
- DOCX branding
- Brand-specific subdomains or URLs
- Multi-tenancy / brand-level access control
- Brand analytics or usage tracking
