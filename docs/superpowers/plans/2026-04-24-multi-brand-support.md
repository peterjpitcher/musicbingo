# Multi-Brand Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow hosts to create venue brands in a `/brands` admin page and assign them to sessions, dynamically theming all screens (guest, host, PDF) via CSS custom properties and brand config.

**Architecture:** New `brands` table in Supabase with colours, logo object keys, font, and messaging. `live_sessions` gains a `brand_id` FK. A `BrandProvider` client component injects RGB channel CSS variables. Tailwind `brand-*` colour tokens rewired to read from those variables. PDF generation receives brand config for colours and logos.

**Tech Stack:** Next.js 16, React 18.3, Supabase (Postgres + Storage), Tailwind CSS 3.4, pdf-lib, Zod

**Spec:** `docs/superpowers/specs/2026-04-24-multi-brand-support-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/YYYYMMDD_create_brands.sql` | Create `brands` table with CHECK constraints, seed The Anchor default |
| `supabase/migrations/YYYYMMDD_add_brand_id_to_sessions.sql` | Add `brand_id` FK to `live_sessions` |
| `lib/brands/types.ts` | `Brand` TypeScript type, Zod schema for validation |
| `lib/brands/brandRepo.ts` | CRUD functions for `brands` table (service-role client) |
| `lib/brands/brandStorage.ts` | Logo upload/URL construction for `brand-assets` bucket |
| `lib/brands/hexToRgb.ts` | Hex-to-RGB conversion utility for CSS vars + pdf-lib |
| `app/brands/page.tsx` | Brand listing page (card grid) |
| `app/brands/[id]/edit/page.tsx` | Brand editor page (create/edit form) |
| `app/api/brands/route.ts` | GET (list) + POST (create) brands |
| `app/api/brands/[id]/route.ts` | GET (single) + PUT (update) + DELETE brands |
| `app/api/brands/[id]/logo/route.ts` | POST logo upload to Supabase Storage |
| `components/brand/BrandProvider.tsx` | Client component: injects CSS vars from brand config |
| `components/brand/BrandSelector.tsx` | Dropdown component for picking a brand |

### Modified Files
| File | Change |
|------|--------|
| `tailwind.config.ts` | Rewire `brand-*` colours to `rgb(var(--brand-*-rgb) / <alpha-value>)` |
| `app/globals.css` | Add `:root` RGB defaults; update `.guest-projection-shell` gradient |
| `lib/live/types.ts` | Add `brandId?: string` to `LiveSessionV1`; add `brand_update` to `LiveChannelMessage` |
| `lib/live/channel.ts` | Add `"brand_update"` to `isValidMessage()` |
| `lib/live/sessionRepo.ts` | Read/write `brand_id` column alongside existing fields |
| `app/api/sessions/route.ts` | Include `brand_id` in PUT upsert |
| `app/api/sessions/[id]/route.ts` | Include `brand_id` in GET response |
| `app/page.tsx` | Add brand selector to prep screen; pass `brandId` to session payload |
| `app/host/page.tsx` | Show brand indicator on session cards; add brand change capability |
| `app/guest/[sessionId]/page.tsx` | Wrap in `BrandProvider`; use brand config for QR colour and messages |
| `components/layout/AppHeader.tsx` | Accept optional brand prop for dynamic logo |
| `lib/pdf.ts` | Accept brand config; use brand colours for grid/text/QR; fetch logo from Storage |
| `app/api/generate/route.ts` | Read `brand_id` from form, fetch brand, pass to PDF renderer |
| `app/layout.tsx` | Dynamic page title from brand |

---

## Task 1: Hex-to-RGB Utility

**Files:**
- Create: `lib/brands/hexToRgb.ts`
- Create: `lib/brands/__tests__/hexToRgb.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/brands/__tests__/hexToRgb.test.ts
import { describe, it, expect } from "vitest";
import { hexToRgbChannels, hexToPdfLibRgb } from "../hexToRgb";

describe("hexToRgbChannels", () => {
  it("should convert #003f27 to '0 63 39'", () => {
    expect(hexToRgbChannels("#003f27")).toBe("0 63 39");
  });

  it("should convert #a57626 to '165 118 38'", () => {
    expect(hexToRgbChannels("#a57626")).toBe("165 118 38");
  });

  it("should convert #FFFFFF to '255 255 255'", () => {
    expect(hexToRgbChannels("#FFFFFF")).toBe("255 255 255");
  });

  it("should throw on invalid hex", () => {
    expect(() => hexToRgbChannels("003f27")).toThrow();
    expect(() => hexToRgbChannels("#GGG")).toThrow();
    expect(() => hexToRgbChannels("")).toThrow();
  });
});

describe("hexToPdfLibRgb", () => {
  it("should convert #003f27 to rgb(0/255, 63/255, 39/255)", () => {
    const result = hexToPdfLibRgb("#003f27");
    expect(result.red).toBeCloseTo(0 / 255, 4);
    expect(result.green).toBeCloseTo(63 / 255, 4);
    expect(result.blue).toBeCloseTo(39 / 255, 4);
  });

  it("should convert #000000 to rgb(0, 0, 0)", () => {
    const result = hexToPdfLibRgb("#000000");
    expect(result.red).toBe(0);
    expect(result.green).toBe(0);
    expect(result.blue).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/brands/__tests__/hexToRgb.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// lib/brands/hexToRgb.ts
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Convert "#RRGGBB" to "R G B" space-separated string for CSS custom properties. */
export function hexToRgbChannels(hex: string): string {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

/** Convert "#RRGGBB" to { red, green, blue } in 0-1 range for pdf-lib rgb(). */
export function hexToPdfLibRgb(hex: string): { red: number; green: number; blue: number } {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  return {
    red: parseInt(hex.slice(1, 3), 16) / 255,
    green: parseInt(hex.slice(3, 5), 16) / 255,
    blue: parseInt(hex.slice(5, 7), 16) / 255,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/brands/__tests__/hexToRgb.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/brands/hexToRgb.ts lib/brands/__tests__/hexToRgb.test.ts
git commit -m "feat(brands): add hex-to-RGB conversion utility with tests"
```

---

## Task 2: Brand Types & Validation Schema

**Files:**
- Create: `lib/brands/types.ts`

- [ ] **Step 1: Create the brand type and Zod schema**

```typescript
// lib/brands/types.ts
import { z } from "zod";

const HEX_COLOUR = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be #RRGGBB format");

export const qrItemSchema = z.object({
  label: z.string().max(50),
  url: z.string().url(),
});

export const brandSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  is_default: z.boolean(),
  logo_dark_url: z.string().min(1),
  logo_light_url: z.string().min(1),
  color_primary: HEX_COLOUR,
  color_primary_light: HEX_COLOUR,
  color_accent: HEX_COLOUR,
  color_accent_light: HEX_COLOUR,
  font_family: z.string().max(100).nullable(),
  break_message: z.string().max(500).nullable(),
  end_message: z.string().max(500).nullable(),
  website_url: z.string().url().nullable().or(z.literal("")),
  qr_items: z.array(qrItemSchema).max(4).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Brand = z.infer<typeof brandSchema>;

/** Subset of Brand fields needed for runtime theming (no timestamps). */
export type BrandConfig = Pick<
  Brand,
  | "id"
  | "name"
  | "logo_dark_url"
  | "logo_light_url"
  | "color_primary"
  | "color_primary_light"
  | "color_accent"
  | "color_accent_light"
  | "font_family"
  | "break_message"
  | "end_message"
  | "website_url"
  | "qr_items"
>;

/** Schema for creating/updating a brand (no id, timestamps auto-generated). */
export const brandInputSchema = brandSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type BrandInput = z.infer<typeof brandInputSchema>;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS (or pre-existing errors only — no new errors from this file)

- [ ] **Step 3: Commit**

```bash
git add lib/brands/types.ts
git commit -m "feat(brands): add Brand type definition and Zod validation schema"
```

---

## Task 3: Database Migration — `brands` Table

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_create_brands.sql`

- [ ] **Step 1: Write the migration**

Use the current timestamp for the filename (e.g. `20260424120000`).

```sql
-- Create brands table
CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  logo_dark_url text NOT NULL,
  logo_light_url text NOT NULL,
  color_primary text NOT NULL CHECK (color_primary ~ '^#[0-9a-fA-F]{6}$'),
  color_primary_light text NOT NULL CHECK (color_primary_light ~ '^#[0-9a-fA-F]{6}$'),
  color_accent text NOT NULL CHECK (color_accent ~ '^#[0-9a-fA-F]{6}$'),
  color_accent_light text NOT NULL CHECK (color_accent_light ~ '^#[0-9a-fA-F]{6}$'),
  font_family text,
  break_message text,
  end_message text,
  website_url text,
  qr_items jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enforce at most one default brand
CREATE UNIQUE INDEX idx_brands_single_default ON brands (is_default) WHERE is_default = true;

-- Seed The Anchor Pub as the default brand.
-- Logo URLs reference /public paths initially; migrated to Storage post-deploy.
INSERT INTO brands (
  name, is_default,
  logo_dark_url, logo_light_url,
  color_primary, color_primary_light, color_accent, color_accent_light,
  font_family, break_message, end_message, website_url, qr_items
) VALUES (
  'The Anchor Pub', true,
  '/the-anchor-pub-logo-white-transparent.png',
  '/the-anchor-pub-logo-black-transparent.png',
  '#003f27', '#0f6846', '#a57626', '#c4952f',
  NULL,
  '🍺 Head to the bar! Kitchen is open until 9pm.',
  '🍺 Drinks & food orders at the bar — kitchen open until 9pm.',
  'https://the-anchor.pub',
  NULL
);
```

- [ ] **Step 2: Verify migration syntax**

Run: `npx supabase db push --dry-run` (if Supabase CLI is configured) or review SQL manually.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(brands): add brands table with CHECK constraints and Anchor seed data"
```

---

## Task 4: Database Migration — `brand_id` on `live_sessions`

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_add_brand_id_to_sessions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add brand_id foreign key to live_sessions
ALTER TABLE live_sessions
  ADD COLUMN brand_id uuid REFERENCES brands(id);

-- Index for lookups
CREATE INDEX idx_live_sessions_brand_id ON live_sessions (brand_id);
```

- [ ] **Step 2: Verify migration syntax**

Run: `npx supabase db push --dry-run`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(brands): add brand_id FK to live_sessions table"
```

---

## Task 5: Brand Repository (CRUD)

**Files:**
- Create: `lib/brands/brandRepo.ts`

- [ ] **Step 1: Write the brand CRUD functions**

```typescript
// lib/brands/brandRepo.ts
import { getSupabaseClient } from "@/lib/supabase";
import type { Brand, BrandConfig } from "@/lib/brands/types";

type BrandRow = {
  id: string;
  name: string;
  is_default: boolean;
  logo_dark_url: string;
  logo_light_url: string;
  color_primary: string;
  color_primary_light: string;
  color_accent: string;
  color_accent_light: string;
  font_family: string | null;
  break_message: string | null;
  end_message: string | null;
  website_url: string | null;
  qr_items: unknown;
  created_at: string;
  updated_at: string;
};

function rowToBrand(row: BrandRow): Brand {
  return {
    ...row,
    qr_items: Array.isArray(row.qr_items) ? (row.qr_items as Brand["qr_items"]) : null,
  };
}

function rowToBrandConfig(row: BrandRow): BrandConfig {
  return {
    id: row.id,
    name: row.name,
    logo_dark_url: row.logo_dark_url,
    logo_light_url: row.logo_light_url,
    color_primary: row.color_primary,
    color_primary_light: row.color_primary_light,
    color_accent: row.color_accent,
    color_accent_light: row.color_accent_light,
    font_family: row.font_family,
    break_message: row.break_message,
    end_message: row.end_message,
    website_url: row.website_url,
    qr_items: Array.isArray(row.qr_items) ? (row.qr_items as Brand["qr_items"]) : null,
  };
}

export async function listBrands(): Promise<Brand[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to list brands: ${error.message}`);
  return ((data ?? []) as BrandRow[]).map(rowToBrand);
}

export async function getBrand(id: string): Promise<Brand | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to get brand: ${error.message}`);
  if (!data) return null;
  return rowToBrand(data as BrandRow);
}

export async function getDefaultBrand(): Promise<Brand | null> {
  const supabase = getSupabaseClient();
  // Try the explicit default first
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .eq("is_default", true)
    .maybeSingle();

  if (error) throw new Error(`Failed to get default brand: ${error.message}`);
  if (data) return rowToBrand(data as BrandRow);

  // Fallback: first brand by created_at
  const { data: fallback, error: fallbackError } = await supabase
    .from("brands")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallbackError) throw new Error(`Failed to get fallback brand: ${fallbackError.message}`);
  return fallback ? rowToBrand(fallback as BrandRow) : null;
}

/** Resolve a brand for a session: use brand_id if provided, otherwise default. */
export async function resolveBrandConfig(brandId: string | null | undefined): Promise<BrandConfig | null> {
  if (brandId) {
    const brand = await getBrand(brandId);
    if (brand) return rowToBrandConfig(brand as unknown as BrandRow);
  }
  const defaultBrand = await getDefaultBrand();
  return defaultBrand ? rowToBrandConfig(defaultBrand as unknown as BrandRow) : null;
}

export async function createBrand(input: Omit<Brand, "id" | "created_at" | "updated_at">): Promise<Brand> {
  const supabase = getSupabaseClient();

  // If setting as default, unset the current default first
  if (input.is_default) {
    await supabase.from("brands").update({ is_default: false }).eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("brands")
    .insert(input)
    .select()
    .single();

  if (error) throw new Error(`Failed to create brand: ${error.message}`);
  return rowToBrand(data as BrandRow);
}

export async function updateBrand(
  id: string,
  input: Partial<Omit<Brand, "id" | "created_at" | "updated_at">>
): Promise<Brand> {
  const supabase = getSupabaseClient();

  // If setting as default, unset the current default first
  if (input.is_default) {
    await supabase.from("brands").update({ is_default: false }).neq("id", id);
  }

  const { data, error } = await supabase
    .from("brands")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update brand: ${error.message}`);
  return rowToBrand(data as BrandRow);
}

export async function deleteBrand(id: string): Promise<void> {
  const supabase = getSupabaseClient();

  // Check: cannot delete default brand
  const brand = await getBrand(id);
  if (!brand) throw new Error("Brand not found.");
  if (brand.is_default) throw new Error("Cannot delete the default brand.");

  // Check: cannot delete brand in use by sessions
  const { count, error: countError } = await supabase
    .from("live_sessions")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", id);

  if (countError) throw new Error(`Failed to check brand usage: ${countError.message}`);
  if (count && count > 0) {
    throw new Error(`Cannot delete brand — it is assigned to ${count} session(s).`);
  }

  const { error } = await supabase.from("brands").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete brand: ${error.message}`);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add lib/brands/brandRepo.ts
git commit -m "feat(brands): add brand CRUD repository with delete protection"
```

---

## Task 6: Brand Storage (Logo Upload)

**Files:**
- Create: `lib/brands/brandStorage.ts`

- [ ] **Step 1: Write the storage utility**

```typescript
// lib/brands/brandStorage.ts
import { getSupabaseClient } from "@/lib/supabase";

const BUCKET_NAME = "brand-assets";
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg"];

type LogoSlot = "logo-dark" | "logo-light";

/** Upload a logo to Supabase Storage and return the object key. */
export async function uploadBrandLogo(
  brandId: string,
  slot: LogoSlot,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Invalid file type: ${mimeType}. Must be PNG or JPEG.`);
  }
  if (fileBuffer.byteLength > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(fileBuffer.byteLength / 1024 / 1024).toFixed(1)}MB. Max 2MB.`);
  }

  const ext = mimeType === "image/png" ? "png" : "jpg";
  const objectKey = `${brandId}/${slot}.${ext}`;
  const supabase = getSupabaseClient();

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(objectKey, fileBuffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) throw new Error(`Failed to upload logo: ${error.message}`);
  return objectKey;
}

/** Construct the full public URL for a brand logo object key. */
export function getBrandLogoPublicUrl(objectKey: string): string {
  // Object keys starting with "/" are legacy /public paths (seed data)
  if (objectKey.startsWith("/")) return objectKey;

  const supabase = getSupabaseClient();
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(objectKey);
  return data.publicUrl;
}

/** Fetch logo bytes from Storage (for PDF rendering). Only fetches from known bucket. */
export async function fetchBrandLogoPngBytes(objectKey: string): Promise<Uint8Array | null> {
  // Legacy /public paths — read from filesystem
  if (objectKey.startsWith("/")) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    try {
      const buf = await fs.readFile(path.join(process.cwd(), "public", objectKey));
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(objectKey);

  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add lib/brands/brandStorage.ts
git commit -m "feat(brands): add Supabase Storage logo upload and fetch utilities"
```

---

## Task 6b: Create Supabase Storage Bucket

**Files:** None — Supabase dashboard or CLI action.

- [ ] **Step 1: Create the `brand-assets` bucket**

Via Supabase dashboard: Storage → New Bucket → name: `brand-assets`, Public: ON.

Or via SQL (if using Supabase CLI):

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO NOTHING;
```

This can also be added to a migration file. The bucket must be public so guest browsers can load logos directly.

- [ ] **Step 2: Commit (if added to migration)**

```bash
git add supabase/migrations/
git commit -m "feat(brands): create brand-assets storage bucket"
```

---

## Task 7: Brand API Routes

**Files:**
- Create: `app/api/brands/route.ts`
- Create: `app/api/brands/[id]/route.ts`
- Create: `app/api/brands/[id]/logo/route.ts`

- [ ] **Step 1: Create the list + create route**

```typescript
// app/api/brands/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listBrands, createBrand } from "@/lib/brands/brandRepo";
import { brandInputSchema } from "@/lib/brands/types";

export async function GET(): Promise<NextResponse> {
  try {
    const brands = await listBrands();
    return NextResponse.json(brands);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const parsed = brandInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const brand = await createBrand(parsed.data);
    return NextResponse.json(brand, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the single brand route**

```typescript
// app/api/brands/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getBrand, updateBrand, deleteBrand } from "@/lib/brands/brandRepo";
import { brandInputSchema } from "@/lib/brands/types";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const brand = await getBrand(id);
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    return NextResponse.json(brand);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = brandInputSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const brand = await updateBrand(id, parsed.data);
    return NextResponse.json(brand);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    await deleteBrand(id);
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    const status = err.message?.includes("Cannot delete") ? 409 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
```

- [ ] **Step 3: Create the logo upload route**

```typescript
// app/api/brands/[id]/logo/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getBrand, updateBrand } from "@/lib/brands/brandRepo";
import { uploadBrandLogo } from "@/lib/brands/brandStorage";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const brand = await getBrand(id);
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const slot = formData.get("slot") as string | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (slot !== "logo-dark" && slot !== "logo-light") {
      return NextResponse.json({ error: "slot must be 'logo-dark' or 'logo-light'" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const objectKey = await uploadBrandLogo(id, slot, buffer, file.type);

    // Update the brand row with the new object key
    const field = slot === "logo-dark" ? "logo_dark_url" : "logo_light_url";
    await updateBrand(id, { [field]: objectKey });

    return NextResponse.json({ objectKey });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add app/api/brands/
git commit -m "feat(brands): add API routes for brand CRUD and logo upload"
```

---

## Task 8: CSS Variable Infrastructure (Tailwind + globals.css)

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`

- [ ] **Step 1: Update Tailwind config to use RGB channel variables**

Replace the `colors` section in `tailwind.config.ts`:

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "brand-green": "rgb(var(--brand-primary-rgb) / <alpha-value>)",
        "brand-green-light": "rgb(var(--brand-primary-light-rgb) / <alpha-value>)",
        "brand-gold": "rgb(var(--brand-accent-rgb) / <alpha-value>)",
        "brand-gold-light": "rgb(var(--brand-accent-light-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--brand-font, 'Inter')", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Update globals.css with RGB defaults and dynamic gradient**

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --brand-primary-rgb: 0 63 39;
  --brand-primary-light-rgb: 15 104 70;
  --brand-accent-rgb: 165 118 38;
  --brand-accent-light-rgb: 196 149 47;
  --brand-font: 'Inter', ui-sans-serif, system-ui, sans-serif;
}

/* Guest projection background — multi-layer radial gradient using brand CSS variables */
.guest-projection-shell {
  background:
    radial-gradient(circle at 10% 20%, rgb(var(--brand-accent-rgb) / 0.14), transparent 45%),
    radial-gradient(circle at 90% 10%, rgb(var(--brand-primary-light-rgb) / 0.22), transparent 50%),
    linear-gradient(180deg, rgb(var(--brand-primary-rgb)) 0%, rgb(var(--brand-primary-rgb) / 0.85) 100%);
}
```

- [ ] **Step 3: Verify the build compiles with no visual regressions**

Run: `npm run build`
Expected: PASS — the default RGB values match the old hex values exactly, so the output is identical.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts app/globals.css
git commit -m "refactor(brands): rewire Tailwind brand colours to RGB channel CSS variables"
```

---

## Task 9: BrandProvider Component

**Files:**
- Create: `components/brand/BrandProvider.tsx`

- [ ] **Step 1: Create the BrandProvider**

```typescript
// components/brand/BrandProvider.tsx
"use client";

import { useEffect, type ReactNode } from "react";
import { hexToRgbChannels } from "@/lib/brands/hexToRgb";
import type { BrandConfig } from "@/lib/brands/types";

type BrandProviderProps = {
  brand: BrandConfig | null;
  children: ReactNode;
};

export function BrandProvider({ brand, children }: BrandProviderProps): ReactNode {
  useEffect(() => {
    if (!brand) return;

    const root = document.documentElement;
    root.style.setProperty("--brand-primary-rgb", hexToRgbChannels(brand.color_primary));
    root.style.setProperty("--brand-primary-light-rgb", hexToRgbChannels(brand.color_primary_light));
    root.style.setProperty("--brand-accent-rgb", hexToRgbChannels(brand.color_accent));
    root.style.setProperty("--brand-accent-light-rgb", hexToRgbChannels(brand.color_accent_light));

    // Load Google Font if specified
    if (brand.font_family) {
      const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(brand.font_family)}:wght@400;600;700;900&display=swap`;
      const existingLink = document.querySelector(`link[data-brand-font]`);
      if (existingLink) existingLink.remove();

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = fontUrl;
      link.setAttribute("data-brand-font", "true");
      document.head.appendChild(link);
      root.style.setProperty("--brand-font", `'${brand.font_family}', ui-sans-serif, system-ui, sans-serif`);
    } else {
      root.style.setProperty("--brand-font", "'Inter', ui-sans-serif, system-ui, sans-serif");
      const existingLink = document.querySelector(`link[data-brand-font]`);
      if (existingLink) existingLink.remove();
    }

    return () => {
      // Reset to defaults on unmount
      root.style.removeProperty("--brand-primary-rgb");
      root.style.removeProperty("--brand-primary-light-rgb");
      root.style.removeProperty("--brand-accent-rgb");
      root.style.removeProperty("--brand-accent-light-rgb");
      root.style.removeProperty("--brand-font");
      const existingLink = document.querySelector(`link[data-brand-font]`);
      if (existingLink) existingLink.remove();
    };
  }, [brand]);

  return <>{children}</>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add components/brand/BrandProvider.tsx
git commit -m "feat(brands): add BrandProvider component for runtime CSS variable injection"
```

---

## Task 10: BrandSelector Component

**Files:**
- Create: `components/brand/BrandSelector.tsx`

- [ ] **Step 1: Create the brand dropdown**

```typescript
// components/brand/BrandSelector.tsx
"use client";

import { useEffect, useState } from "react";
import type { Brand } from "@/lib/brands/types";

type BrandSelectorProps = {
  value: string | null;
  onChange: (brandId: string) => void;
  className?: string;
};

export function BrandSelector({ value, onChange, className }: BrandSelectorProps): React.ReactNode {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/brands")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setBrands(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <select disabled className={className}>
        <option>Loading brands…</option>
      </select>
    );
  }

  if (brands.length === 0) return null;

  const defaultBrand = brands.find((b) => b.is_default);
  const selectedId = value ?? defaultBrand?.id ?? "";

  return (
    <select
      value={selectedId}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      {brands.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}{b.is_default ? " (default)" : ""}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/brand/BrandSelector.tsx
git commit -m "feat(brands): add BrandSelector dropdown component"
```

---

## Task 11: Update Session Types & Channel for Brand Support

**Files:**
- Modify: `lib/live/types.ts`
- Modify: `lib/live/channel.ts`
- Modify: `lib/live/sessionRepo.ts`

- [ ] **Step 1: Add `brandId` to `LiveSessionV1` and `brand_update` to channel messages**

In `lib/live/types.ts`, add `brandId` to the `LiveSessionV1` type:

```typescript
// Add after the `prepData` field (line 65):
  /** Brand ID for venue theming. Null = use default brand. */
  brandId?: string;
```

Add `brand_update` to the `LiveChannelMessage` union (after the `warning` variant, line 127):

```typescript
  | {
    type: "brand_update";
    brand: import("@/lib/brands/types").BrandConfig;
  };
```

- [ ] **Step 2: Update `isValidMessage` in channel.ts**

In `lib/live/channel.ts` line 14, add `"brand_update"` to the check:

```typescript
  return maybe.type === "runtime_update" || maybe.type === "host_heartbeat" || maybe.type === "warning" || maybe.type === "brand_update";
```

- [ ] **Step 3: Update sessionRepo.ts to read/write `brand_id`**

In `lib/live/sessionRepo.ts`, update the `SessionRow` type to include `brand_id`:

```typescript
type SessionRow = {
  id: string;
  name: string;
  created_at: string;
  event_date: string;
  data: unknown;
  updated_at: string;
  brand_id: string | null;
};
```

Update `upsertSession` (line 49) to include `brand_id`:

```typescript
  const { error } = await supabase.from("live_sessions").upsert(
    {
      id: validated.id,
      name: validated.name,
      created_at: validated.createdAt,
      event_date: validated.eventDateInput,
      data: validated,
      brand_id: validated.brandId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
```

Add a new function to update just the brand_id:

```typescript
export async function updateSessionBrand(sessionId: string, brandId: string): Promise<void> {
  const supabase = getSupabaseClient();

  // Also update brandId inside the JSONB data field for consistency
  const session = await getSession(sessionId);
  if (!session) throw new Error("Session not found");
  session.brandId = brandId;

  const { error } = await supabase
    .from("live_sessions")
    .update({
      brand_id: brandId,
      data: session,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) throw new Error(`Failed to update session brand: ${error.message}`);
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add lib/live/types.ts lib/live/channel.ts lib/live/sessionRepo.ts
git commit -m "feat(brands): add brandId to session types, brand_update to channel messages"
```

---

## Task 12: Update Session API Routes

**Files:**
- Modify: `app/api/sessions/route.ts`
- Modify: `app/api/sessions/[id]/route.ts`

- [ ] **Step 1: Update PUT handler to pass brand_id through**

The session API routes already pass the full session object to `upsertSession()`, and the updated repo now reads `brandId` from the session data. Verify the routes don't strip it.

If the PUT route in `app/api/sessions/route.ts` does validation that would strip unknown fields from the session JSON, ensure `brandId` passes through. Read the route and confirm.

- [ ] **Step 2: Add brand_id to GET response**

In `app/api/sessions/[id]/route.ts`, the GET handler returns the session from `getSession()` which already includes `brandId` if present. Verify by reading the file. If it returns `row.data` directly (which it does via `validateLiveSession`), `brandId` will be present if the session was saved with one.

Also add a `brand` field to the GET response by resolving the brand config:

```typescript
// At the top of app/api/sessions/[id]/route.ts, add:
import { resolveBrandConfig } from "@/lib/brands/brandRepo";

// In the GET handler, after fetching the session:
const brand = await resolveBrandConfig(session.brandId ?? null);
return NextResponse.json({ ...session, brand });
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add app/api/sessions/
git commit -m "feat(brands): include resolved brand config in session API responses"
```

---

## Task 13: Update Guest Screen for Brand Theming

**Files:**
- Modify: `app/guest/[sessionId]/page.tsx`

- [ ] **Step 1: Add BrandProvider and use brand config for dynamic values**

At the top of the file, add imports:

```typescript
import { BrandProvider } from "@/components/brand/BrandProvider";
import { getBrandLogoPublicUrl } from "@/lib/brands/brandStorage";
import type { BrandConfig } from "@/lib/brands/types";
```

Add a `brand` state alongside the existing `session` state:

```typescript
const [brand, setBrand] = useState<BrandConfig | null>(null);
```

In the session fetch effect (line 56-72), after setting the session, also fetch the brand:

```typescript
.then((loaded) => {
  if (!cancelled) {
    setSession(loaded);
    setSessionLoading(false);
    // Fetch the brand config
    if (loaded) {
      fetch(`/api/sessions/${encodeURIComponent(sessionId)}`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => { if (data?.brand && !cancelled) setBrand(data.brand); })
        .catch(() => {});
    }
  }
})
```

In the Realtime subscription effect, add a handler for `brand_update`:

```typescript
if (message.type === "brand_update") {
  setBrand(message.brand);
}
```

Wrap the entire return JSX in `<BrandProvider brand={brand}>`.

Replace the hardcoded QR `fgColor="#003f27"` (line 205) with the brand's primary colour:

```typescript
fgColor={brand?.color_primary ?? "#003f27"}
```

Replace the hardcoded logo path (line 158) with the brand's logo:

```typescript
src={brand?.logo_dark_url ? getBrandLogoPublicUrl(brand.logo_dark_url) : "/the-anchor-pub-logo-white-transparent.png"}
alt={brand?.name ?? "Logo"}
```

Replace the hardcoded break message (line 229) with:

```typescript
{brand?.break_message ? (
  <p className="mt-4 text-[clamp(1rem,2vw,1.5rem)] text-brand-gold font-semibold">
    {brand.break_message}
  </p>
) : null}
```

Replace the hardcoded end messages (lines 260-266) with:

```typescript
{brand?.end_message ? (
  <p className="text-[clamp(1rem,2vw,1.5rem)] text-brand-gold font-semibold">
    {brand.end_message}
  </p>
) : null}
```

- [ ] **Step 2: Test manually**

Run: `npm run dev`
Navigate to `/guest/<session-id>` and verify the screen renders correctly with default brand.

- [ ] **Step 3: Commit**

```bash
git add app/guest/
git commit -m "feat(brands): apply dynamic brand theming to guest projection screen"
```

---

## Task 14: Update AppHeader for Dynamic Logo

**Files:**
- Modify: `components/layout/AppHeader.tsx`

- [ ] **Step 1: Add optional brand prop**

Update the `AppHeaderProps` type:

```typescript
type AppHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  variant?: Variant;
  logoDarkUrl?: string;
  logoLightUrl?: string;
  logoAlt?: string;
};
```

Update the `<Image>` component to use the brand logo when provided:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/layout/AppHeader.tsx
git commit -m "feat(brands): add optional brand logo props to AppHeader"
```

---

## Task 15: Update PDF Generation for Brand Colours & Logos

**Files:**
- Modify: `lib/pdf.ts`
- Modify: `app/api/generate/route.ts`

- [ ] **Step 1: Update RenderOptions in lib/pdf.ts**

Add brand config to the render options type:

```typescript
import type { BrandConfig } from "@/lib/brands/types";
import { hexToPdfLibRgb } from "@/lib/brands/hexToRgb";
import { fetchBrandLogoPngBytes } from "@/lib/brands/brandStorage";

type RenderOptions = {
  eventDate: string;
  footerItems?: FooterQrItem[];
  logoLeftPngBytes?: Uint8Array | null;
  logoRightPngBytes?: Uint8Array | null;
  showCardId?: boolean;
  brand?: BrandConfig | null;
};
```

In `renderCardsPdf()`, resolve the brand colour for grid/text rendering. Replace the hardcoded `const black = rgb(0, 0, 0)` with:

```typescript
const brandColour = opts.brand
  ? rgb(
      hexToPdfLibRgb(opts.brand.color_primary).red,
      hexToPdfLibRgb(opts.brand.color_primary).green,
      hexToPdfLibRgb(opts.brand.color_primary).blue,
    )
  : rgb(0, 0, 0);
```

Then use `brandColour` everywhere `black` was used for grid borders, text, and card ID.

- [ ] **Step 2: Update the generate route to pass brand config**

In `app/api/generate/route.ts`, add at the top:

```typescript
import { resolveBrandConfig } from "@/lib/brands/brandRepo";
import { fetchBrandLogoPngBytes } from "@/lib/brands/brandStorage";
```

After parsing form data, read the optional `brand_id`:

```typescript
const brandId = asString(form.get("brand_id")).trim() || null;
const brand = await resolveBrandConfig(brandId);
```

When loading the right-side logo, use the brand logo if available:

```typescript
let logoRightBytes: Uint8Array | null = null;
if (brand?.logo_light_url) {
  logoRightBytes = await fetchBrandLogoPngBytes(brand.logo_light_url);
}
if (!logoRightBytes) {
  logoRightBytes = await loadDefaultLogoPngBytes({ origin });
}
```

Pass brand to `renderCardsPdf()`:

```typescript
const pdfBytes = await renderCardsPdf(game1Cards, {
  eventDate: eventDateDisplay,
  footerItems,
  logoLeftPngBytes: eventLogoBytes,
  logoRightPngBytes: logoRightBytes,
  brand,
});
```

Update the QR code generation to use brand colour for foreground:

```typescript
// In the qrPng function or its callsite, if brand is available:
const qrFgColor = brand?.color_primary ?? "#000000";
```

- [ ] **Step 3: Update the footer QR logic for brand-sourced items**

After the existing Management API QR fetch, add brand QR item fallback:

```typescript
// If no management API items, use brand qr_items
if (footerQrItems.length === 0 && brand?.qr_items?.length) {
  footerQrItems = brand.qr_items.map((item) => ({
    label: item.label,
    url: item.url,
  }));
} else if (footerQrItems.length === 0 && brand?.website_url) {
  footerQrItems = [{ label: "Upcoming Events", url: brand.website_url }];
}
// If still empty — no footer items (clean card)
```

- [ ] **Step 4: Verify TypeScript compiles and build passes**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 5: Commit**

```bash
git add lib/pdf.ts app/api/generate/route.ts
git commit -m "feat(brands): apply brand colours and logos to PDF bingo card generation"
```

---

## Task 16: Update Prep Screen with Brand Selector

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add brand state and selector to the prep screen**

Add import:

```typescript
import { BrandSelector } from "@/components/brand/BrandSelector";
```

Add state near the other state declarations:

```typescript
const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
```

In `buildLiveSessionPayload()`, add `brandId` to the returned object (after `prepData`):

```typescript
  brandId: selectedBrandId ?? undefined,
```

In the form submission that calls `/api/generate`, add `brand_id` to the FormData:

```typescript
if (selectedBrandId) {
  form.set("brand_id", selectedBrandId);
}
```

Add the `<BrandSelector>` component to the "Event Setup" step (StepEventSetup), or if that component is not easily extensible, add it inline in the step 1 UI near the event name/date fields:

```tsx
<div>
  <label className="block text-sm font-semibold text-slate-700 mb-1">Brand</label>
  <BrandSelector
    value={selectedBrandId}
    onChange={setSelectedBrandId}
    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
  />
</div>
```

- [ ] **Step 2: Test manually**

Run: `npm run dev`
Navigate to `/` (prep screen) and verify the Brand dropdown appears and works.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(brands): add brand selector to prep screen and pass to session/PDF"
```

---

## Task 17: Update Host Dashboard with Brand Indicator & Change

**Files:**
- Modify: `app/host/page.tsx`

- [ ] **Step 1: Add brand display and change capability**

Add imports:

```typescript
import { BrandSelector } from "@/components/brand/BrandSelector";
```

In each session card (inside the `.map()` at line 266), add a brand indicator below the event date:

```tsx
{session.brandId ? (
  <p className="text-xs text-slate-500 mb-0.5">
    Brand: {session.brandId.slice(0, 8)}…
  </p>
) : null}
```

For a better UX, add brand change capability. Add a state to track which session is having its brand changed:

```typescript
const [changingBrand, setChangingBrand] = useState<string | null>(null);
```

Add a "Change Brand" button to each session card's action bar, and a `BrandSelector` that appears when clicked:

```tsx
<Button
  variant="secondary"
  size="sm"
  onClick={() => setChangingBrand(changingBrand === session.id ? null : session.id)}
>
  Change Brand
</Button>

{changingBrand === session.id ? (
  <div className="mt-2 w-full">
    <BrandSelector
      value={session.brandId ?? null}
      onChange={async (brandId) => {
        try {
          const res = await fetch(`/api/sessions/${session.id}/brand`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brand_id: brandId }),
          });
          if (!res.ok) throw new Error("Failed to update brand");
          await refreshSessions();
          setChangingBrand(null);
          setNotice(`Updated brand for: ${session.name}`);
        } catch (err: any) {
          setError(err?.message ?? "Failed to update brand.");
        }
      }}
      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
    />
  </div>
) : null}
```

- [ ] **Step 2: Create the session brand update API route**

```typescript
// app/api/sessions/[id]/brand/route.ts
import { NextRequest, NextResponse } from "next/server";
import { updateSessionBrand } from "@/lib/live/sessionRepo";
import { resolveBrandConfig } from "@/lib/brands/brandRepo";

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json();
    const brandId = body?.brand_id;
    if (!brandId || typeof brandId !== "string") {
      return NextResponse.json({ error: "brand_id is required" }, { status: 400 });
    }

    await updateSessionBrand(id, brandId);
    const brand = await resolveBrandConfig(brandId);
    return NextResponse.json({ brand });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Also update the re-download handler to include brand_id**

In `onRedownload()`, add `brand_id` to the form data:

```typescript
if (session.brandId) {
  form.set("brand_id", session.brandId);
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add app/host/page.tsx app/api/sessions/[id]/brand/
git commit -m "feat(brands): add brand indicator and change capability to host dashboard"
```

---

## Task 18: Brand Admin Page — Listing

**Files:**
- Create: `app/brands/page.tsx`

- [ ] **Step 1: Create the brand listing page**

```typescript
// app/brands/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import type { Brand } from "@/lib/brands/types";

export default function BrandsPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refreshBrands() {
    const res = await fetch("/api/brands");
    if (res.ok) setBrands(await res.json());
  }

  useEffect(() => {
    refreshBrands().finally(() => setLoading(false));
  }, []);

  async function onDelete(brand: Brand) {
    if (!window.confirm(`Delete brand "${brand.name}"?`)) return;
    try {
      const res = await fetch(`/api/brands/${brand.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete brand.");
      }
      await refreshBrands();
      setNotice(`Deleted brand: ${brand.name}`);
      setError("");
    } catch (err: any) {
      setError(err?.message ?? "Failed to delete brand.");
      setNotice("");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title="Brand Management"
        subtitle="Create and manage venue brands"
        variant="light"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push("/brands/new/edit")}
          >
            + New Brand
          </Button>
        }
      />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        {notice ? <Notice variant="success">{notice}</Notice> : null}
        {error ? <Notice variant="error">{error}</Notice> : null}

        {loading ? (
          <Card><p className="text-slate-500 text-sm">Loading brands…</p></Card>
        ) : brands.length === 0 ? (
          <Card>
            <h2 className="text-lg font-bold text-slate-800 mb-2">No brands</h2>
            <p className="text-slate-500 text-sm">Create your first brand to get started.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {brands.map((brand) => (
              <Card
                key={brand.id}
                className={brand.is_default ? "ring-2 ring-brand-gold" : ""}
              >
                {/* Colour preview header */}
                <div
                  className="rounded-xl p-4 mb-3 flex items-center gap-3"
                  style={{ backgroundColor: brand.color_primary }}
                >
                  <div className="text-white font-bold text-sm truncate">
                    {brand.name}
                  </div>
                  {brand.is_default ? (
                    <span className="ml-auto text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">
                      ⭐ Default
                    </span>
                  ) : null}
                </div>

                {/* Colour swatches */}
                <div className="flex gap-1.5 mb-3">
                  {[brand.color_primary, brand.color_primary_light, brand.color_accent, brand.color_accent_light].map(
                    (c, i) => (
                      <div
                        key={i}
                        className="w-7 h-7 rounded-md border border-slate-200"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    )
                  )}
                </div>

                <p className="text-xs text-slate-500 mb-1">
                  Font: {brand.font_family ?? "Inter (default)"}
                </p>
                {brand.break_message ? (
                  <p className="text-xs text-slate-500 mb-3 truncate">
                    Break: {brand.break_message}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push(`/brands/${brand.id}/edit`)}
                  >
                    Edit
                  </Button>
                  {!brand.is_default ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void onDelete(brand)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Test manually**

Run: `npm run dev`
Navigate to `/brands` and verify the listing renders with the seeded Anchor brand.

- [ ] **Step 3: Commit**

```bash
git add app/brands/page.tsx
git commit -m "feat(brands): add brand listing page at /brands"
```

---

## Task 19: Brand Admin Page — Editor

**Files:**
- Create: `app/brands/[id]/edit/page.tsx`
- Create: `app/brands/new/edit/page.tsx` (thin wrapper that creates then redirects)

- [ ] **Step 1: Create the brand editor page**

This is the largest UI component. Create `app/brands/[id]/edit/page.tsx` with a two-column form matching the spec: left column for name/colours/font, right column for logos/messages/website/QR items.

The editor should:
- Load the brand by ID on mount (GET `/api/brands/{id}`)
- For "new" brands, start with empty fields and POST to `/api/brands` on save
- For existing brands, PUT to `/api/brands/{id}` on save
- Logo uploads use POST to `/api/brands/{id}/logo` with FormData
- Colour inputs use `<input type="color">` + text display
- QR items use a dynamic list of label+URL field pairs with add/remove buttons
- "Set as default" checkbox
- Cancel navigates back to `/brands`

This file will be ~200-250 lines. Write it as a single `"use client"` page component.

**Note for the implementer:** Reference the mockup from the brainstorming session at `.superpowers/brainstorm/12682-1777013081/content/brands-admin.html` for the exact layout. The two-column layout matches the spec in Section 3.2.

- [ ] **Step 2: Create the "new" wrapper page**

```typescript
// app/brands/new/edit/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";

export default function NewBrandPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Same form as the edit page but with empty defaults and POST instead of PUT.
  // For DRY, extract a shared BrandForm component, or inline the form here.
  // Implementation detail left to the implementer — the key requirement is
  // that saving POSTs to /api/brands and then redirects to /brands/{newId}/edit.

  // Minimal version: redirect to a placeholder
  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader title="New Brand" subtitle="Create a new venue brand" variant="light" />
      <main className="max-w-3xl mx-auto px-4 py-8">
        {error ? <Notice variant="error">{error}</Notice> : null}
        <Card>
          <p className="text-slate-500 text-sm">Brand editor form renders here.</p>
          <p className="text-xs text-slate-400 mt-2">
            Implementation: extract a shared BrandForm component used by both /brands/new/edit and /brands/[id]/edit.
          </p>
        </Card>
      </main>
    </div>
  );
}
```

**For the implementer:** The cleanest approach is to create a `components/brand/BrandForm.tsx` shared component that both the "new" and "edit" pages import. The form handles all fields; the page wrapper decides whether to POST (create) or PUT (update). The form component receives `initialData?: Brand` and `onSave: (data: BrandInput) => Promise<void>`.

- [ ] **Step 3: Test manually**

Run: `npm run dev`
Navigate to `/brands/{anchor-id}/edit` and verify the editor loads the brand data.
Navigate to `/brands/new/edit` and verify the empty form renders.

- [ ] **Step 4: Commit**

```bash
git add app/brands/
git commit -m "feat(brands): add brand editor pages for create and update"
```

---

## Task 20: Dynamic Page Title

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Make the page title dynamic**

The root layout sets static metadata. Since brand context is session-dependent and only known client-side, use a client-side `document.title` update in the `BrandProvider` component instead.

In `components/brand/BrandProvider.tsx`, add to the `useEffect`:

```typescript
// Update page title
document.title = `${brand.name} — Music Bingo`;
```

And in the cleanup:

```typescript
document.title = "Music Bingo";
```

- [ ] **Step 2: Commit**

```bash
git add components/brand/BrandProvider.tsx
git commit -m "feat(brands): dynamically update page title from brand name"
```

---

## Task 21: Full Verification Pipeline

**Files:** None — verification only.

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: PASS with zero warnings

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS (all existing + new hexToRgb tests)

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Manual smoke test**

1. Start dev server: `npm run dev`
2. Navigate to `/brands` — verify Anchor brand card renders with green/gold
3. Navigate to `/` (prep screen) — verify brand dropdown appears
4. Create a session with default brand — verify it saves
5. Navigate to `/host` — verify brand indicator on session card
6. Open guest screen — verify green/gold theming matches current look exactly
7. Generate a PDF — verify brand colours on grid borders and logos

- [ ] **Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final verification fixes for multi-brand support"
```
