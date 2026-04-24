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
| `qr_items` | jsonb | YES | `null` | Array of `{ label: string, url: string }` for PDF footer QR codes |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

**Constraints:**
- Unique partial index on `is_default WHERE is_default = true` (enforces single default)
- `color_*` columns validated as hex format (`#RRGGBB`) at the application layer

### 2.2 `live_sessions` Change

Add column:
- `brand_id uuid REFERENCES brands(id)` — nullable. When null, the app resolves to the brand where `is_default = true`.

### 2.3 Supabase Storage

- New public bucket: `brand-assets`
- Logo files stored as `{brand_id}/logo-dark.png` and `{brand_id}/logo-light.png`
- Public URLs used directly in `logo_dark_url` / `logo_light_url` columns

### 2.4 Pre-Seeded Data

One migration seeds The Anchor Pub as the default brand:

| Field | Value |
|-------|-------|
| `name` | The Anchor Pub |
| `is_default` | `true` |
| `logo_dark_url` | URL to current `the-anchor-pub-logo-white-transparent.png` (uploaded to storage) |
| `logo_light_url` | URL to current `the-anchor-pub-logo-black-transparent.png` (uploaded to storage) |
| `color_primary` | `#003f27` |
| `color_primary_light` | `#0f6846` |
| `color_accent` | `#a57626` |
| `color_accent_light` | `#c4952f` |
| `font_family` | `null` (Inter default) |
| `break_message` | `🍺 Head to the bar! Kitchen is open until 9pm.` |
| `end_message` | `🍺 Drinks & food orders at the bar — kitchen open until 9pm.` |
| `website_url` | `https://the-anchor.pub` |
| `qr_items` | Current QR items from Anchor Management API (if applicable), or `null` |

### 2.5 RLS

- RLS disabled on `brands` (same pattern as `live_sessions` — accessed via service-role client)
- The `brand-assets` storage bucket is public (logos need to be accessible by guest browsers without auth)

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

- When `brand_id` changes on a session, the Realtime channel broadcasts the new brand config to all subscribed guests
- Guest screens re-apply CSS variables and swap the logo without a full page reload

## 5. Runtime Theming (CSS Custom Properties)

### 5.1 CSS Variables

Brand colours are injected as CSS custom properties on the root element:

```css
:root {
  --brand-primary: #003f27;
  --brand-primary-light: #0f6846;
  --brand-accent: #a57626;
  --brand-accent-light: #c4952f;
  --brand-font: 'Inter', ui-sans-serif, system-ui, sans-serif;
}
```

### 5.2 Tailwind Config Change

Replace hardcoded hex values with CSS variable references:

```ts
colors: {
  "brand-green": "var(--brand-primary)",
  "brand-green-light": "var(--brand-primary-light)",
  "brand-gold": "var(--brand-accent)",
  "brand-gold-light": "var(--brand-accent-light)",
}
```

All existing Tailwind classes (`bg-brand-green`, `text-brand-gold`, `border-brand-gold/50`, etc.) continue to work unchanged — they just resolve from variables instead of fixed hex values.

### 5.3 `globals.css` Update

The `.guest-projection-shell` gradient replaces hardcoded hex values with CSS variables:

```css
.guest-projection-shell {
  background:
    radial-gradient(circle at 10% 20%, color-mix(in srgb, var(--brand-accent) 14%, transparent), transparent 45%),
    radial-gradient(circle at 90% 10%, color-mix(in srgb, var(--brand-primary-light) 22%, transparent), transparent 50%),
    linear-gradient(180deg, var(--brand-primary) 0%, color-mix(in srgb, var(--brand-primary) 85%, black) 100%);
}
```

### 5.4 `BrandProvider` Component

A thin client component that:
1. Receives the brand config as props (passed from a server component that fetches the brand)
2. Sets CSS custom properties on `document.documentElement` on mount and when brand changes
3. If `font_family` is set, dynamically loads the Google Font via a `<link>` tag insertion
4. Sets `--brand-font` to the loaded font family with fallbacks

### 5.5 Fallback

CSS variables default to The Anchor colours in `globals.css`:

```css
:root {
  --brand-primary: #003f27;
  --brand-primary-light: #0f6846;
  --brand-accent: #a57626;
  --brand-accent-light: #c4952f;
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
3. If neither is set → footer text reads "See {brand.name}'s website for upcoming event details" (no QR code)

### 7.4 Fonts

PDF fonts remain as Helvetica (StandardFonts). Embedding custom fonts in pdf-lib requires font file bytes and adds significant complexity for minimal visual gain on printed bingo cards. Web fonts handle brand personality; PDFs stay clean and functional.

### 7.5 `lib/pdf.ts` Changes

- `RenderOptions` type gains an optional `brand` field containing the brand config
- `renderBingoCards()` reads colours and logo URLs from the brand when provided
- Logo loading functions (`loadDefaultLogoPngBytes`, `loadDefaultEventLogoPngBytes`) are supplemented with a new `loadBrandLogoPngBytes(url)` that fetches from Supabase Storage
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
