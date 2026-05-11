# Review Pack: brand-event-feeds-impl

**Generated:** 2026-05-11
**Mode:** B (A=Adversarial / B=Code / C=Spec Compliance)
**Project root:** `/Users/peterpitcher/Cursor/OJ-MusicBingo/.claude/worktrees/musing-snyder-91248f`
**Base ref:** `HEAD`
**HEAD:** `c413fc0`
**Diff range:** `HEAD`
**Stats:**  6 files changed, 257 insertions(+), 21 deletions(-)

> This pack is the sole input for reviewers. Do NOT read files outside it unless a specific finding requires verification. If a file not in the pack is needed, mark the finding `Needs verification` and describe what would resolve it.

## Changed Files

```
app/api/brands/[id]/route.ts
app/api/brands/route.ts
app/api/generate/route.ts
components/brand/BrandForm.tsx
lib/brands/brandRepo.ts
lib/brands/types.ts
lib/brands/validation.ts
lib/eventFeed/anchorAdapter.ts
lib/eventFeed/baronshubAdapter.ts
lib/eventFeed/index.ts
lib/eventFeed/types.ts
supabase/migrations/20260511120000_add_event_feed_to_brands.sql
```

## Diff (`HEAD`)

```diff
diff --git a/app/api/brands/[id]/route.ts b/app/api/brands/[id]/route.ts
index ec68fb5..0840b4d 100644
--- a/app/api/brands/[id]/route.ts
+++ b/app/api/brands/[id]/route.ts
@@ -4,6 +4,7 @@ import { getBrand, updateBrand, deleteBrand } from "@/lib/brands/brandRepo";
 import { getBrandLogoPublicUrl } from "@/lib/brands/brandStorage";
 import { brandInputSchema } from "@/lib/brands/types";
 import type { Brand } from "@/lib/brands/types";
+import { validateEventFeedUrl } from "@/lib/brands/validation";
 
 type RouteParams = { params: Promise<{ id: string }> };
 
@@ -37,7 +38,28 @@ export async function PUT(request: NextRequest, { params }: RouteParams): Promis
         { status: 400 }
       );
     }
-    const brand = await updateBrand(id, parsed.data);
+
+    // Validate event feed URL when feed type is not 'none'
+    const feedType = parsed.data.event_feed_type;
+    const feedUrl = parsed.data.event_feed_base_url;
+    if (feedType && feedType !== "none" && feedUrl) {
+      const urlError = validateEventFeedUrl(feedUrl);
+      if (urlError) {
+        return NextResponse.json(
+          { error: `event_feed_base_url: ${urlError}` },
+          { status: 400 }
+        );
+      }
+    }
+
+    // Build DB input: only include event_feed_api_key if explicitly provided
+    // (non-empty string). Omitting it preserves the existing value in the DB.
+    const dbInput: Parameters<typeof updateBrand>[1] = { ...parsed.data };
+    if (typeof body.event_feed_api_key === "string" && body.event_feed_api_key !== "") {
+      dbInput.event_feed_api_key = body.event_feed_api_key;
+    }
+
+    const brand = await updateBrand(id, dbInput);
     return NextResponse.json(resolveLogoUrls(brand));
   } catch (err: any) {
     return NextResponse.json({ error: err.message }, { status: 500 });
diff --git a/app/api/brands/route.ts b/app/api/brands/route.ts
index c8ec22d..b1d7b3a 100644
--- a/app/api/brands/route.ts
+++ b/app/api/brands/route.ts
@@ -4,6 +4,7 @@ import { listBrands, createBrand } from "@/lib/brands/brandRepo";
 import { getBrandLogoPublicUrl } from "@/lib/brands/brandStorage";
 import { brandInputSchema } from "@/lib/brands/types";
 import type { Brand } from "@/lib/brands/types";
+import { validateEventFeedUrl } from "@/lib/brands/validation";
 
 function resolveLogoUrls(brand: Brand): Brand & { logo_dark_public_url: string; logo_light_public_url: string } {
   return {
@@ -32,7 +33,26 @@ export async function POST(request: NextRequest): Promise<NextResponse> {
         { status: 400 }
       );
     }
-    const brand = await createBrand(parsed.data);
+
+    // Validate event feed URL when feed type is not 'none'
+    const { event_feed_type, event_feed_base_url } = parsed.data;
+    if (event_feed_type && event_feed_type !== "none" && event_feed_base_url) {
+      const urlError = validateEventFeedUrl(event_feed_base_url);
+      if (urlError) {
+        return NextResponse.json(
+          { error: `event_feed_base_url: ${urlError}` },
+          { status: 400 }
+        );
+      }
+    }
+
+    // Build DB input: pass event_feed_api_key from raw body (not in Zod schema)
+    const dbInput: Parameters<typeof createBrand>[0] = {
+      ...parsed.data,
+      event_feed_api_key: typeof body.event_feed_api_key === "string" ? body.event_feed_api_key : null,
+    };
+
+    const brand = await createBrand(dbInput);
     return NextResponse.json(resolveLogoUrls(brand), { status: 201 });
   } catch (err: any) {
     return NextResponse.json({ error: err.message }, { status: 500 });
diff --git a/app/api/generate/route.ts b/app/api/generate/route.ts
index f205917..c25fdf5 100644
--- a/app/api/generate/route.ts
+++ b/app/api/generate/route.ts
@@ -9,8 +9,8 @@ import {
   resolveChallengeSong,
   resolveChallengeSongs,
 } from "@/lib/gameInput";
-import { fetchUpcomingEventDetails } from "@/lib/managementApi";
-import type { EventDetail } from "@/lib/managementApi";
+import { fetchEventsForBrand } from "@/lib/eventFeed";
+import type { NormalisedEvent } from "@/lib/eventFeed";
 import {
   loadDefaultEventLogoPngBytes,
   loadDefaultLogoPngBytes,
@@ -26,7 +26,7 @@ import {
 } from "@/lib/spotifyWeb";
 import type { Card, ParseResult, Song } from "@/lib/types";
 import { sanitizeFilenamePart } from "@/lib/utils";
-import { resolveBrandConfig } from "@/lib/brands/brandRepo";
+import { resolveBrandConfig, getBrandFeedConfig } from "@/lib/brands/brandRepo";
 import { fetchBrandLogoPngBytes } from "@/lib/brands/brandStorage";
 import type { BrandConfig } from "@/lib/brands/types";
 
@@ -143,7 +143,7 @@ async function renderGamePdfWithEvents(params: {
   theme: string;
   logoLeftPngBytes: Uint8Array | null;
   logoRightPngBytes: Uint8Array | null;
-  events: EventDetail[];
+  events: NormalisedEvent[];
   brandConfig: BrandConfig | null;
 }): Promise<Uint8Array> {
   const cardsPdfBytes = await renderCardsPdf(params.cards, {
@@ -325,7 +325,8 @@ export async function POST(request: Request) {
     const brandId = asString(form.get("brand_id")).trim() || null;
     const brandConfig = await resolveBrandConfig(brandId);
 
-    const upcomingEvents = await fetchUpcomingEventDetails({ eventDateDisplay: eventDateInput });
+    const feedConfig = brandConfig ? await getBrandFeedConfig(brandConfig.id) : null;
+    const upcomingEvents = feedConfig ? await fetchEventsForBrand(feedConfig, eventDateInput) : [];
 
     let logoRightPngBytes: Uint8Array | null = null;
     let logoLeftPngBytes: Uint8Array | null = null;
diff --git a/components/brand/BrandForm.tsx b/components/brand/BrandForm.tsx
index 3282da5..cbe5350 100644
--- a/components/brand/BrandForm.tsx
+++ b/components/brand/BrandForm.tsx
@@ -62,6 +62,14 @@ export function BrandForm({ brand, onSaved }: BrandFormProps): React.ReactElemen
     brand?.qr_items?.map((item) => ({ label: item.label, url: item.url })) ?? []
   );
 
+  // Event feed state
+  const [eventFeedType, setEventFeedType] = useState<"anchor_management" | "baronshub" | "none">(
+    brand?.event_feed_type ?? "none"
+  );
+  const [eventFeedBaseUrl, setEventFeedBaseUrl] = useState(brand?.event_feed_base_url ?? "");
+  const [eventFeedApiKey, setEventFeedApiKey] = useState("");
+  const [eventFeedApiKeyTouched, setEventFeedApiKeyTouched] = useState(false);
+
   // Logo upload state
   const [logoDarkFile, setLogoDarkFile] = useState<File | null>(null);
   const [logoLightFile, setLogoLightFile] = useState<File | null>(null);
@@ -126,6 +134,17 @@ export function BrandForm({ brand, onSaved }: BrandFormProps): React.ReactElemen
       return;
     }
 
+    if (eventFeedType !== "none") {
+      if (!eventFeedBaseUrl.trim()) {
+        setError("API base URL is required when an event feed is configured.");
+        return;
+      }
+      if (!brand?.event_feed_has_key && !eventFeedApiKey.trim()) {
+        setError("API key is required for new event feed configurations.");
+        return;
+      }
+    }
+
     setSaving(true);
     try {
       // Filter out empty QR items
@@ -145,8 +164,16 @@ export function BrandForm({ brand, onSaved }: BrandFormProps): React.ReactElemen
         end_message: endMessage.trim() || null,
         website_url: websiteUrl.trim() || null,
         qr_items: validQrItems.length > 0 ? validQrItems : null,
+        event_feed_type: eventFeedType,
+        event_feed_base_url: eventFeedType !== "none" ? (eventFeedBaseUrl.trim() || null) : null,
       };
 
+      // Build body with optional API key (outside Zod schema for security)
+      const body: Record<string, unknown> = { ...payload };
+      if (eventFeedType !== "none" && eventFeedApiKey.trim()) {
+        body.event_feed_api_key = eventFeedApiKey.trim();
+      }
+
       let savedBrand: Brand;
 
       if (isNew) {
@@ -154,7 +181,7 @@ export function BrandForm({ brand, onSaved }: BrandFormProps): React.ReactElemen
         const res = await fetch("/api/brands", {
           method: "POST",
           headers: { "Content-Type": "application/json" },
-          body: JSON.stringify(payload),
+          body: JSON.stringify(body),
         });
         if (!res.ok) {
           const data = await res.json().catch(() => ({}));
@@ -166,7 +193,7 @@ export function BrandForm({ brand, onSaved }: BrandFormProps): React.ReactElemen
         const res = await fetch(`/api/brands/${brand.id}`, {
           method: "PUT",
           headers: { "Content-Type": "application/json" },
-          body: JSON.stringify(payload),
+          body: JSON.stringify(body),
         });
         if (!res.ok) {
           const data = await res.json().catch(() => ({}));
@@ -496,6 +523,70 @@ export function BrandForm({ brand, onSaved }: BrandFormProps): React.ReactElemen
               />
             </label>
           </Card>
+
+          {/* Event Feed Configuration */}
+          <Card>
+            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">
+              Event Feed Configuration
+            </h2>
+
+            <label className="block mb-4">
+              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
+                Feed Type
+              </span>
+              <select
+                value={eventFeedType}
+                onChange={(e) => setEventFeedType(e.target.value as "anchor_management" | "baronshub" | "none")}
+                className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
+                  focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
+              >
+                <option value="none">None</option>
+                <option value="anchor_management">Anchor Management API</option>
+                <option value="baronshub">BaronsHub API</option>
+              </select>
+            </label>
+
+            {eventFeedType !== "none" && (
+              <>
+                <label className="block mb-4">
+                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
+                    API Base URL *
+                  </span>
+                  <input
+                    type="url"
+                    value={eventFeedBaseUrl}
+                    onChange={(e) => setEventFeedBaseUrl(e.target.value)}
+                    placeholder="https://api.example.com"
+                    className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
+                      focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
+                    required
+                  />
+                </label>
+
+                <label className="block">
+                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
+                    API Key {!brand?.event_feed_has_key && "*"}
+                  </span>
+                  <input
+                    type="password"
+                    value={eventFeedApiKey}
+                    onChange={(e) => {
+                      setEventFeedApiKey(e.target.value);
+                      setEventFeedApiKeyTouched(true);
+                    }}
+                    placeholder={brand?.event_feed_has_key ? "Key stored securely" : "Enter API key"}
+                    className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
+                      focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold"
+                  />
+                  {brand?.event_feed_has_key && !eventFeedApiKeyTouched && (
+                    <p className="mt-1 text-xs text-slate-400">
+                      Leave blank to keep the existing key.
+                    </p>
+                  )}
+                </label>
+              </>
+            )}
+          </Card>
         </div>
       </div>
 
diff --git a/lib/brands/brandRepo.ts b/lib/brands/brandRepo.ts
index cb9e586..809605f 100644
--- a/lib/brands/brandRepo.ts
+++ b/lib/brands/brandRepo.ts
@@ -1,6 +1,6 @@
 // lib/brands/brandRepo.ts
 import { getSupabaseClient } from "@/lib/supabase";
-import type { Brand, BrandConfig } from "@/lib/brands/types";
+import type { Brand, BrandConfig, BrandFeedConfig } from "@/lib/brands/types";
 
 type BrandRow = {
   id: string;
@@ -17,21 +17,18 @@ type BrandRow = {
   end_message: string | null;
   website_url: string | null;
   qr_items: unknown;
+  event_feed_type: string;
+  event_feed_base_url: string | null;
+  event_feed_api_key: string | null;
   created_at: string;
   updated_at: string;
 };
 
 function rowToBrand(row: BrandRow): Brand {
-  return {
-    ...row,
-    qr_items: Array.isArray(row.qr_items) ? (row.qr_items as Brand["qr_items"]) : null,
-  };
-}
-
-function rowToBrandConfig(row: BrandRow): BrandConfig {
   return {
     id: row.id,
     name: row.name,
+    is_default: row.is_default,
     logo_dark_url: row.logo_dark_url,
     logo_light_url: row.logo_light_url,
     color_primary: row.color_primary,
@@ -43,6 +40,11 @@ function rowToBrandConfig(row: BrandRow): BrandConfig {
     end_message: row.end_message,
     website_url: row.website_url,
     qr_items: Array.isArray(row.qr_items) ? (row.qr_items as Brand["qr_items"]) : null,
+    event_feed_type: row.event_feed_type as Brand["event_feed_type"],
+    event_feed_base_url: row.event_feed_base_url,
+    event_feed_has_key: Boolean(row.event_feed_api_key),
+    created_at: row.created_at,
+    updated_at: row.updated_at,
   };
 }
 
@@ -94,17 +96,58 @@ export async function getDefaultBrand(): Promise<Brand | null> {
   return fallback ? rowToBrand(fallback as BrandRow) : null;
 }
 
+function brandToBrandConfig(brand: Brand): BrandConfig {
+  return {
+    id: brand.id,
+    name: brand.name,
+    logo_dark_url: brand.logo_dark_url,
+    logo_light_url: brand.logo_light_url,
+    color_primary: brand.color_primary,
+    color_primary_light: brand.color_primary_light,
+    color_accent: brand.color_accent,
+    color_accent_light: brand.color_accent_light,
+    font_family: brand.font_family,
+    break_message: brand.break_message,
+    end_message: brand.end_message,
+    website_url: brand.website_url,
+    qr_items: brand.qr_items,
+    event_feed_type: brand.event_feed_type,
+    event_feed_base_url: brand.event_feed_base_url,
+    event_feed_has_key: brand.event_feed_has_key,
+  };
+}
+
 /** Resolve a brand for a session: use brand_id if provided, otherwise default. */
 export async function resolveBrandConfig(brandId: string | null | undefined): Promise<BrandConfig | null> {
   if (brandId) {
     const brand = await getBrand(brandId);
-    if (brand) return rowToBrandConfig(brand as unknown as BrandRow);
+    if (brand) return brandToBrandConfig(brand);
   }
   const defaultBrand = await getDefaultBrand();
-  return defaultBrand ? rowToBrandConfig(defaultBrand as unknown as BrandRow) : null;
+  return defaultBrand ? brandToBrandConfig(defaultBrand) : null;
 }
 
-export async function createBrand(input: Omit<Brand, "id" | "created_at" | "updated_at">): Promise<Brand> {
+/** Input type for createBrand — matches DB columns, includes event_feed_api_key. */
+type CreateBrandInput = {
+  name: string;
+  is_default: boolean;
+  logo_dark_url: string;
+  logo_light_url: string;
+  color_primary: string;
+  color_primary_light: string;
+  color_accent: string;
+  color_accent_light: string;
+  font_family?: string | null;
+  break_message?: string | null;
+  end_message?: string | null;
+  website_url?: string | null;
+  qr_items?: Brand["qr_items"];
+  event_feed_type?: string;
+  event_feed_base_url?: string | null;
+  event_feed_api_key?: string | null;
+};
+
+export async function createBrand(input: CreateBrandInput): Promise<Brand> {
   const supabase = getSupabaseClient();
 
   // If setting as default, unset the current default first
@@ -124,7 +167,7 @@ export async function createBrand(input: Omit<Brand, "id" | "created_at" | "upda
 
 export async function updateBrand(
   id: string,
-  input: Partial<Omit<Brand, "id" | "created_at" | "updated_at">>
+  input: Partial<CreateBrandInput>
 ): Promise<Brand> {
   const supabase = getSupabaseClient();
 
@@ -144,6 +187,44 @@ export async function updateBrand(
   return rowToBrand(data as BrandRow);
 }
 
+/**
+ * Server-only: returns the full feed configuration for a brand, including
+ * the secret API key. For anchor_management brands without per-brand
+ * credentials, falls back to environment variables.
+ */
+export async function getBrandFeedConfig(brandId: string): Promise<BrandFeedConfig | null> {
+  const supabase = getSupabaseClient();
+  const { data, error } = await supabase
+    .from("brands")
+    .select("event_feed_type, event_feed_base_url, event_feed_api_key, website_url")
+    .eq("id", brandId)
+    .maybeSingle();
+
+  if (error) throw new Error(`Failed to get brand feed config: ${error.message}`);
+  if (!data) return null;
+
+  const feedType = (data.event_feed_type ?? "none") as BrandFeedConfig["type"];
+
+  if (feedType === "none") {
+    return { type: "none", baseUrl: null, apiKey: null, websiteUrl: null };
+  }
+
+  // For anchor_management, fall back to env vars when the brand has no per-brand values
+  let baseUrl: string | null = data.event_feed_base_url;
+  let apiKey: string | null = data.event_feed_api_key;
+  let websiteUrl: string | null = data.website_url;
+
+  if (feedType === "anchor_management") {
+    if (!baseUrl) baseUrl = process.env.MANAGEMENT_API_BASE_URL ?? null;
+    if (!apiKey) apiKey = process.env.MANAGEMENT_API_TOKEN ?? null;
+    if (!websiteUrl) {
+      websiteUrl = process.env.MANAGEMENT_PUBLIC_EVENTS_BASE_URL ?? "https://www.the-anchor.pub";
+    }
+  }
+
+  return { type: feedType, baseUrl, apiKey, websiteUrl };
+}
+
 export async function deleteBrand(id: string): Promise<void> {
   const supabase = getSupabaseClient();
 
diff --git a/lib/brands/types.ts b/lib/brands/types.ts
index 506ffd0..a9ce56f 100644
--- a/lib/brands/types.ts
+++ b/lib/brands/types.ts
@@ -7,6 +7,12 @@ export const qrItemSchema = z.object({
   url: z.string().url(),
 });
 
+/** Validates that an event feed base URL uses HTTPS. */
+export const eventFeedBaseUrlSchema = z.string().url().refine(
+  (url) => url.startsWith("https://"),
+  { message: "Must be an HTTPS URL" }
+);
+
 export const brandSchema = z.object({
   id: z.string().uuid(),
   name: z.string().min(1).max(100),
@@ -22,6 +28,9 @@ export const brandSchema = z.object({
   end_message: z.string().max(500).nullable(),
   website_url: z.string().max(200).nullable().or(z.literal("")),
   qr_items: z.array(qrItemSchema).max(4).nullable(),
+  event_feed_type: z.enum(["anchor_management", "baronshub", "none"]).default("none"),
+  event_feed_base_url: z.string().url().nullable().or(z.literal("")),
+  event_feed_has_key: z.boolean(),
   created_at: z.string(),
   updated_at: z.string(),
 });
@@ -44,13 +53,25 @@ export type BrandConfig = Pick<
   | "end_message"
   | "website_url"
   | "qr_items"
+  | "event_feed_type"
+  | "event_feed_base_url"
+  | "event_feed_has_key"
 >;
 
+/** Server-only type for event feed configuration (includes secret API key). */
+export type BrandFeedConfig = {
+  type: "anchor_management" | "baronshub" | "none";
+  baseUrl: string | null;
+  apiKey: string | null;
+  websiteUrl: string | null;
+};
+
 /** Schema for creating/updating a brand (no id, timestamps auto-generated). */
 export const brandInputSchema = brandSchema.omit({
   id: true,
   created_at: true,
   updated_at: true,
+  event_feed_has_key: true,
 });
 
 export type BrandInput = z.infer<typeof brandInputSchema>;
```

## Changed File Contents

### `app/api/brands/[id]/route.ts`

```
// app/api/brands/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getBrand, updateBrand, deleteBrand } from "@/lib/brands/brandRepo";
import { getBrandLogoPublicUrl } from "@/lib/brands/brandStorage";
import { brandInputSchema } from "@/lib/brands/types";
import type { Brand } from "@/lib/brands/types";
import { validateEventFeedUrl } from "@/lib/brands/validation";

type RouteParams = { params: Promise<{ id: string }> };

function resolveLogoUrls(brand: Brand): Brand & { logo_dark_public_url: string; logo_light_public_url: string } {
  return {
    ...brand,
    logo_dark_public_url: getBrandLogoPublicUrl(brand.logo_dark_url),
    logo_light_public_url: getBrandLogoPublicUrl(brand.logo_light_url),
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const brand = await getBrand(id);
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    return NextResponse.json(resolveLogoUrls(brand));
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

    // Validate event feed URL when feed type is not 'none'
    const feedType = parsed.data.event_feed_type;
    const feedUrl = parsed.data.event_feed_base_url;
    if (feedType && feedType !== "none" && feedUrl) {
      const urlError = validateEventFeedUrl(feedUrl);
      if (urlError) {
        return NextResponse.json(
          { error: `event_feed_base_url: ${urlError}` },
          { status: 400 }
        );
      }
    }

    // Build DB input: only include event_feed_api_key if explicitly provided
    // (non-empty string). Omitting it preserves the existing value in the DB.
    const dbInput: Parameters<typeof updateBrand>[1] = { ...parsed.data };
    if (typeof body.event_feed_api_key === "string" && body.event_feed_api_key !== "") {
      dbInput.event_feed_api_key = body.event_feed_api_key;
    }

    const brand = await updateBrand(id, dbInput);
    return NextResponse.json(resolveLogoUrls(brand));
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

### `app/api/brands/route.ts`

```
// app/api/brands/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listBrands, createBrand } from "@/lib/brands/brandRepo";
import { getBrandLogoPublicUrl } from "@/lib/brands/brandStorage";
import { brandInputSchema } from "@/lib/brands/types";
import type { Brand } from "@/lib/brands/types";
import { validateEventFeedUrl } from "@/lib/brands/validation";

function resolveLogoUrls(brand: Brand): Brand & { logo_dark_public_url: string; logo_light_public_url: string } {
  return {
    ...brand,
    logo_dark_public_url: getBrandLogoPublicUrl(brand.logo_dark_url),
    logo_light_public_url: getBrandLogoPublicUrl(brand.logo_light_url),
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const brands = await listBrands();
    return NextResponse.json(brands.map(resolveLogoUrls));
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

    // Validate event feed URL when feed type is not 'none'
    const { event_feed_type, event_feed_base_url } = parsed.data;
    if (event_feed_type && event_feed_type !== "none" && event_feed_base_url) {
      const urlError = validateEventFeedUrl(event_feed_base_url);
      if (urlError) {
        return NextResponse.json(
          { error: `event_feed_base_url: ${urlError}` },
          { status: 400 }
        );
      }
    }

    // Build DB input: pass event_feed_api_key from raw body (not in Zod schema)
    const dbInput: Parameters<typeof createBrand>[0] = {
      ...parsed.data,
      event_feed_api_key: typeof body.event_feed_api_key === "string" ? body.event_feed_api_key : null,
    };

    const brand = await createBrand(dbInput);
    return NextResponse.json(resolveLogoUrls(brand), { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

### `app/api/generate/route.ts`

```
import JSZip from "jszip";

import { renderClipboardDocx } from "@/lib/clipboardDocx";
import { formatEventDateDisplay } from "@/lib/eventDate";
import { generateCards } from "@/lib/generator";
import {
  normalizeGameTheme,
  parseGameSongsText,
  resolveChallengeSong,
  resolveChallengeSongs,
} from "@/lib/gameInput";
import { fetchEventsForBrand } from "@/lib/eventFeed";
import type { NormalisedEvent } from "@/lib/eventFeed";
import {
  loadDefaultEventLogoPngBytes,
  loadDefaultLogoPngBytes,
  renderCardsPdf,
  renderEventsPage,
} from "@/lib/pdf";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { cookies } from "next/headers";
import {
  getOrRefreshAccessToken,
  spotifyApiRequest,
  SPOTIFY_COOKIE_ACCESS,
} from "@/lib/spotifyWeb";
import type { Card, ParseResult, Song } from "@/lib/types";
import { sanitizeFilenamePart } from "@/lib/utils";
import { resolveBrandConfig, getBrandFeedConfig } from "@/lib/brands/brandRepo";
import { fetchBrandLogoPngBytes } from "@/lib/brands/brandStorage";
import type { BrandConfig } from "@/lib/brands/types";

export const runtime = "nodejs";

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}


const COOKIE_REFRESH = "spotify_refresh_token";

type SpotifyTrack = { trackId: string; title: string; artist: string };

/**
 * Fetch playlist tracks from Spotify and return them in playlist order.
 * Returns null on any failure so callers can degrade gracefully to user-input order.
 *
 * Token handling: cookies() returns ReadonlyRequestCookies in Route Handlers so
 * token write-back is not possible here without threading results through to a
 * NextResponse. The generate route is not the primary auth surface — the dedicated
 * /api/spotify/playlist/[id]/tracks route handles rotation. Token rotation here is
 * therefore best-effort: reads use the current cached token, rotated values are
 * discarded. In practice this is rare and the user will re-authenticate naturally
 * on the next interactive Spotify request.
 */
async function fetchSpotifyPlaylistTracks(
  playlistId: string,
  origin: string
): Promise<SpotifyTrack[] | null> {
  if (!playlistId.trim()) return null;

  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(COOKIE_REFRESH)?.value ?? "";
  if (!refreshToken.trim()) return null;

  let accessToken: string;
  try {
    const result = await getOrRefreshAccessToken({
      refreshToken,
      cachedRaw: cookieStore.get(SPOTIFY_COOKIE_ACCESS)?.value ?? null,
      origin,
    });
    accessToken = result.accessToken;
  } catch {
    console.warn("[music-bingo] Could not refresh Spotify token for clipboard ordering — using input order.");
    return null;
  }

  try {
    const tracks: SpotifyTrack[] = [];
    const fields = encodeURIComponent("items(track(id,name,artists(name))),next,total");
    let url: string | null = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?fields=${fields}&limit=100`;

    while (url) {
      const res = await spotifyApiRequest({ accessToken, url });
      if (!res.ok) {
        console.warn(`[music-bingo] Spotify playlist fetch failed (HTTP ${res.status}) — using input order.`);
        return null;
      }
      const json = (await res.json()) as { items?: unknown[]; next?: string | null };
      for (const item of json.items ?? []) {
        const t = (item as { track?: { id?: string; name?: string; artists?: { name?: string }[] } })?.track;
        if (!t || typeof t.id !== "string") continue;
        const artist = Array.isArray(t.artists) && t.artists.length > 0
          ? String(t.artists[0]?.name ?? "")
          : "";
        tracks.push({ trackId: t.id, title: String(t.name ?? ""), artist });
      }
      url = json.next ?? null;
    }

    return tracks;
  } catch {
    console.warn("[music-bingo] Error fetching Spotify playlist for clipboard ordering — using input order.");
    return null;
  }
}

/**
 * Sort songs to match Spotify playlist order using normalised artist+title key matching.
 * Songs with no Spotify match are appended at the end in their original relative order.
 * The returned array always contains all input songs — count is always preserved.
 */
function sortSongsBySpotifyOrder(songs: Song[], spotifyTracks: SpotifyTrack[] | null): Song[] {
  if (!spotifyTracks || spotifyTracks.length === 0) return songs;
  const norm = (s: string) => s.trim().toLowerCase();
  const spotifyIndex = new Map<string, number>();
  spotifyTracks.forEach((t, i) => {
    spotifyIndex.set(`${norm(t.artist)}|${norm(t.title)}`, i);
  });
  return [...songs].sort((a, b) => {
    const ia = spotifyIndex.get(`${norm(a.artist)}|${norm(a.title)}`) ?? Infinity;
    const ib = spotifyIndex.get(`${norm(b.artist)}|${norm(b.title)}`) ?? Infinity;
    return ia - ib;
  });
}

function makeBundleFilename(eventDate: string): string {
  return `music-bingo-event-pack-${sanitizeFilenamePart(eventDate, "event")}.zip`;
}

function makeGamePdfFilename(eventDate: string, gameNumber: 1 | 2): string {
  return `music-bingo-game-${gameNumber}-${sanitizeFilenamePart(eventDate, "event")}.pdf`;
}

function makeClipboardFilename(eventDate: string): string {
  return `event-clipboard-${sanitizeFilenamePart(eventDate, "event")}.docx`;
}

async function renderGamePdfWithEvents(params: {
  cards: Card[];
  eventDate: string;
  theme: string;
  logoLeftPngBytes: Uint8Array | null;
  logoRightPngBytes: Uint8Array | null;
  events: NormalisedEvent[];
  brandConfig: BrandConfig | null;
}): Promise<Uint8Array> {
  const cardsPdfBytes = await renderCardsPdf(params.cards, {
    eventDate: params.eventDate,
    theme: params.theme,
    logoLeftPngBytes: params.logoLeftPngBytes,
    logoRightPngBytes: params.logoRightPngBytes,
    showCardId: true,
    brandConfig: params.brandConfig,
  });

  const pdf = await PDFDocument.load(cardsPdfBytes);
  const cardPageCount = pdf.getPageCount();

  for (let i = cardPageCount - 1; i >= 0; i--) {
    const tempPdf = await PDFDocument.create();
    const tempFont = await tempPdf.embedFont(StandardFonts.Helvetica);
    const tempFontBold = await tempPdf.embedFont(StandardFonts.HelveticaBold);

    await renderEventsPage(tempPdf, tempFont, tempFontBold, {
      events: params.events,
      logoLeftPngBytes: params.logoLeftPngBytes,
      logoRightPngBytes: params.logoRightPngBytes,
      brandConfig: params.brandConfig,
    });

    const [copiedPage] = await pdf.copyPages(tempPdf, [0]);
    pdf.insertPage(i + 1, copiedPage);
  }

  return new Uint8Array(await pdf.save());
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();

    const eventDateInput = asString(form.get("event_date")).trim();
    if (!eventDateInput) {
      return new Response("Event date is required.", { status: 400 });
    }
    const eventDateDisplay = formatEventDateDisplay(eventDateInput);

    const CARDS_PER_PAGE = 6;
    const pagesRaw = asString(form.get("count")).trim() || "40";
    const pages = Number.parseInt(pagesRaw, 10);
    if (!Number.isFinite(pages) || pages < 1 || pages > 200) {
      return new Response("Pages must be a whole number between 1 and 200.", { status: 400 });
    }
    const count = pages * CARDS_PER_PAGE;

    const seed = asString(form.get("seed")).trim();
    const game1SongsText = asString(form.get("game1_songs"));
    const game2SongsText = asString(form.get("game2_songs"));

[truncated at line 200 — original has 414 lines]
```

### `components/brand/BrandForm.tsx`

```
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import type { Brand, BrandInput } from "@/lib/brands/types";

type QrItem = { label: string; url: string };

const FONT_OPTIONS = [
  "Inter",
  "Playfair Display",
  "Poppins",
  "Montserrat",
  "Roboto",
  "Open Sans",
  "Lato",
  "Oswald",
  "Raleway",
  "Nunito",
];

const COLOUR_FIELDS: { key: keyof Pick<BrandInput, "color_primary" | "color_primary_light" | "color_accent" | "color_accent_light">; label: string }[] = [
  { key: "color_primary", label: "Primary" },
  { key: "color_primary_light", label: "Primary Light" },
  { key: "color_accent", label: "Accent" },
  { key: "color_accent_light", label: "Accent Light" },
];

const DEFAULT_COLOURS: Pick<BrandInput, "color_primary" | "color_primary_light" | "color_accent" | "color_accent_light"> = {
  color_primary: "#1a3a2a",
  color_primary_light: "#2d5a3d",
  color_accent: "#c8a951",
  color_accent_light: "#d4b96a",
};

type BrandFormProps = {
  /** Existing brand to edit. If undefined, the form is in "create" mode. */
  brand?: Brand;
  /** Called when Save succeeds; the parent page handles redirect. */
  onSaved?: (brand: Brand) => void;
};

export function BrandForm({ brand, onSaved }: BrandFormProps): React.ReactElement {
  const router = useRouter();
  const isNew = !brand;

  // Form state
  const [name, setName] = useState(brand?.name ?? "");
  const [colorPrimary, setColorPrimary] = useState(brand?.color_primary ?? DEFAULT_COLOURS.color_primary);
  const [colorPrimaryLight, setColorPrimaryLight] = useState(brand?.color_primary_light ?? DEFAULT_COLOURS.color_primary_light);
  const [colorAccent, setColorAccent] = useState(brand?.color_accent ?? DEFAULT_COLOURS.color_accent);
  const [colorAccentLight, setColorAccentLight] = useState(brand?.color_accent_light ?? DEFAULT_COLOURS.color_accent_light);
  const [fontFamily, setFontFamily] = useState(brand?.font_family ?? "Inter");
  const [websiteUrl, setWebsiteUrl] = useState(brand?.website_url ?? "");
  const [breakMessage, setBreakMessage] = useState(brand?.break_message ?? "");
  const [endMessage, setEndMessage] = useState(brand?.end_message ?? "");
  const [isDefault, setIsDefault] = useState(brand?.is_default ?? false);
  const [qrItems, setQrItems] = useState<QrItem[]>(
    brand?.qr_items?.map((item) => ({ label: item.label, url: item.url })) ?? []
  );

  // Event feed state
  const [eventFeedType, setEventFeedType] = useState<"anchor_management" | "baronshub" | "none">(
    brand?.event_feed_type ?? "none"
  );
  const [eventFeedBaseUrl, setEventFeedBaseUrl] = useState(brand?.event_feed_base_url ?? "");
  const [eventFeedApiKey, setEventFeedApiKey] = useState("");
  const [eventFeedApiKeyTouched, setEventFeedApiKeyTouched] = useState(false);

  // Logo upload state
  const [logoDarkFile, setLogoDarkFile] = useState<File | null>(null);
  const [logoLightFile, setLogoLightFile] = useState<File | null>(null);
  const [logoDarkPreview, setLogoDarkPreview] = useState(
    (brand as Brand & { logo_dark_public_url?: string })?.logo_dark_public_url ?? brand?.logo_dark_url ?? ""
  );
  const [logoLightPreview, setLogoLightPreview] = useState(
    (brand as Brand & { logo_light_public_url?: string })?.logo_light_public_url ?? brand?.logo_light_url ?? ""
  );

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function addQrItem(): void {
    if (qrItems.length >= 4) return;
    setQrItems([...qrItems, { label: "", url: "" }]);
  }

  function removeQrItem(index: number): void {
    setQrItems(qrItems.filter((_, i) => i !== index));
  }

  function updateQrItem(index: number, field: "label" | "url", value: string): void {
    const updated = [...qrItems];
    updated[index] = { ...updated[index], [field]: value };
    setQrItems(updated);
  }

  function handleLogoSelect(slot: "dark" | "light", file: File | null): void {
    if (!file) return;
    if (slot === "dark") {
      setLogoDarkFile(file);
      setLogoDarkPreview(URL.createObjectURL(file));
    } else {
      setLogoLightFile(file);
      setLogoLightPreview(URL.createObjectURL(file));
    }
  }

  async function uploadLogo(brandId: string, slot: "dark" | "light", file: File): Promise<void> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("slot", `logo-${slot}`);
    const res = await fetch(`/api/brands/${brandId}/logo`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || `Failed to upload ${slot} logo.`);
    }
  }

  async function handleSave(): Promise<void> {
    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError("Brand name is required.");
      return;
    }

    if (eventFeedType !== "none") {
      if (!eventFeedBaseUrl.trim()) {
        setError("API base URL is required when an event feed is configured.");
        return;
      }
      if (!brand?.event_feed_has_key && !eventFeedApiKey.trim()) {
        setError("API key is required for new event feed configurations.");
        return;
      }
    }

    setSaving(true);
    try {
      // Filter out empty QR items
      const validQrItems = qrItems.filter((item) => item.label.trim() && item.url.trim());

      const payload: BrandInput = {
        name: name.trim(),
        is_default: isDefault,
        logo_dark_url: brand?.logo_dark_url ?? "pending-upload",
        logo_light_url: brand?.logo_light_url ?? "pending-upload",
        color_primary: colorPrimary,
        color_primary_light: colorPrimaryLight,
        color_accent: colorAccent,
        color_accent_light: colorAccentLight,
        font_family: fontFamily || null,
        break_message: breakMessage.trim() || null,
        end_message: endMessage.trim() || null,
        website_url: websiteUrl.trim() || null,
        qr_items: validQrItems.length > 0 ? validQrItems : null,
        event_feed_type: eventFeedType,
        event_feed_base_url: eventFeedType !== "none" ? (eventFeedBaseUrl.trim() || null) : null,
      };

      // Build body with optional API key (outside Zod schema for security)
      const body: Record<string, unknown> = { ...payload };
      if (eventFeedType !== "none" && eventFeedApiKey.trim()) {
        body.event_feed_api_key = eventFeedApiKey.trim();
      }

      let savedBrand: Brand;

      if (isNew) {
        // Create brand
        const res = await fetch("/api/brands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || "Failed to create brand.");
        }
        savedBrand = await res.json();
      } else {
        // Update brand
        const res = await fetch(`/api/brands/${brand.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || "Failed to update brand.");

[truncated at line 200 — original has 622 lines]
```

### `lib/brands/brandRepo.ts`

```
// lib/brands/brandRepo.ts
import { getSupabaseClient } from "@/lib/supabase";
import type { Brand, BrandConfig, BrandFeedConfig } from "@/lib/brands/types";

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
  event_feed_type: string;
  event_feed_base_url: string | null;
  event_feed_api_key: string | null;
  created_at: string;
  updated_at: string;
};

function rowToBrand(row: BrandRow): Brand {
  return {
    id: row.id,
    name: row.name,
    is_default: row.is_default,
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
    event_feed_type: row.event_feed_type as Brand["event_feed_type"],
    event_feed_base_url: row.event_feed_base_url,
    event_feed_has_key: Boolean(row.event_feed_api_key),
    created_at: row.created_at,
    updated_at: row.updated_at,
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

function brandToBrandConfig(brand: Brand): BrandConfig {
  return {
    id: brand.id,
    name: brand.name,
    logo_dark_url: brand.logo_dark_url,
    logo_light_url: brand.logo_light_url,
    color_primary: brand.color_primary,
    color_primary_light: brand.color_primary_light,
    color_accent: brand.color_accent,
    color_accent_light: brand.color_accent_light,
    font_family: brand.font_family,
    break_message: brand.break_message,
    end_message: brand.end_message,
    website_url: brand.website_url,
    qr_items: brand.qr_items,
    event_feed_type: brand.event_feed_type,
    event_feed_base_url: brand.event_feed_base_url,
    event_feed_has_key: brand.event_feed_has_key,
  };
}

/** Resolve a brand for a session: use brand_id if provided, otherwise default. */
export async function resolveBrandConfig(brandId: string | null | undefined): Promise<BrandConfig | null> {
  if (brandId) {
    const brand = await getBrand(brandId);
    if (brand) return brandToBrandConfig(brand);
  }
  const defaultBrand = await getDefaultBrand();
  return defaultBrand ? brandToBrandConfig(defaultBrand) : null;
}

/** Input type for createBrand — matches DB columns, includes event_feed_api_key. */
type CreateBrandInput = {
  name: string;
  is_default: boolean;
  logo_dark_url: string;
  logo_light_url: string;
  color_primary: string;
  color_primary_light: string;
  color_accent: string;
  color_accent_light: string;
  font_family?: string | null;
  break_message?: string | null;
  end_message?: string | null;
  website_url?: string | null;
  qr_items?: Brand["qr_items"];
  event_feed_type?: string;
  event_feed_base_url?: string | null;
  event_feed_api_key?: string | null;
};

export async function createBrand(input: CreateBrandInput): Promise<Brand> {
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
  input: Partial<CreateBrandInput>
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

/**
 * Server-only: returns the full feed configuration for a brand, including
 * the secret API key. For anchor_management brands without per-brand
 * credentials, falls back to environment variables.
 */
export async function getBrandFeedConfig(brandId: string): Promise<BrandFeedConfig | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("brands")
    .select("event_feed_type, event_feed_base_url, event_feed_api_key, website_url")
    .eq("id", brandId)

[truncated at line 200 — original has 249 lines]
```

### `lib/brands/types.ts`

```
import { z } from "zod";

const HEX_COLOUR = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be #RRGGBB format");

export const qrItemSchema = z.object({
  label: z.string().max(50),
  url: z.string().url(),
});

/** Validates that an event feed base URL uses HTTPS. */
export const eventFeedBaseUrlSchema = z.string().url().refine(
  (url) => url.startsWith("https://"),
  { message: "Must be an HTTPS URL" }
);

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
  website_url: z.string().max(200).nullable().or(z.literal("")),
  qr_items: z.array(qrItemSchema).max(4).nullable(),
  event_feed_type: z.enum(["anchor_management", "baronshub", "none"]).default("none"),
  event_feed_base_url: z.string().url().nullable().or(z.literal("")),
  event_feed_has_key: z.boolean(),
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
  | "event_feed_type"
  | "event_feed_base_url"
  | "event_feed_has_key"
>;

/** Server-only type for event feed configuration (includes secret API key). */
export type BrandFeedConfig = {
  type: "anchor_management" | "baronshub" | "none";
  baseUrl: string | null;
  apiKey: string | null;
  websiteUrl: string | null;
};

/** Schema for creating/updating a brand (no id, timestamps auto-generated). */
export const brandInputSchema = brandSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  event_feed_has_key: true,
});

export type BrandInput = z.infer<typeof brandInputSchema>;
```

### `lib/brands/validation.ts`

```
// lib/brands/validation.ts

/**
 * Returns true if the given hostname resolves to a private or link-local IP range.
 *
 * Checked ranges:
 *  - 10.0.0.0/8
 *  - 172.16.0.0/12
 *  - 192.168.0.0/16
 *  - 127.0.0.0/8
 *  - 169.254.0.0/16
 *  - ::1, fc00::/7 (fc00::, fd00::)
 */
export function isPrivateIp(hostname: string): boolean {
  // Normalise: strip surrounding brackets for IPv6 literals like [::1]
  const h = hostname.replace(/^\[|\]$/g, "");

  // IPv6 checks
  if (h === "::1") return true;
  const lower = h.toLowerCase();
  if (lower.startsWith("fc00:") || lower.startsWith("fd00:")) return true;

  // IPv4 checks
  if (h.startsWith("10.")) return true;
  if (h.startsWith("127.")) return true;
  if (h.startsWith("192.168.")) return true;
  if (h.startsWith("169.254.")) return true;

  // 172.16.0.0 – 172.31.255.255
  if (h.startsWith("172.")) {
    const second = parseInt(h.split(".")[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  // "localhost" is effectively 127.0.0.1
  if (lower === "localhost") return true;

  return false;
}

/**
 * Validates that a URL string is safe to use as an event feed base URL.
 * Returns null if valid, or a human-readable error message if invalid.
 */
export function validateEventFeedUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Invalid URL";
  }

  if (parsed.protocol !== "https:") {
    return "Must be an HTTPS URL";
  }

  if (isPrivateIp(parsed.hostname)) {
    return "URL must not point to a private or internal IP address";
  }

  return null;
}
```

### `lib/eventFeed/anchorAdapter.ts`

```
/**
 * Anchor Management API adapter.
 *
 * Extracts and adapts the event-fetching + normalisation logic originally in
 * lib/managementApi.ts into the EventFeedAdapter interface.
 */

import type { EventFeedAdapter, EventFeedConfig, NormalisedEvent } from "./types";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type ManagementApiEvent = {
  id?: unknown;
  slug?: unknown;
  eventUrl?: unknown;
  event_url?: unknown;
  bookingUrl?: unknown;
  booking_url?: unknown;
  name?: unknown;
  startDate?: unknown;
  start_date?: unknown;
  endDate?: unknown;
  end_date?: unknown;
  offers?: unknown;
  url?: unknown;
  qrUrl?: unknown;
  qr_url?: unknown;
  qrCodeUrl?: unknown;
  qr_code_url?: unknown;
  publicUrl?: unknown;
  public_url?: unknown;
  title?: unknown;
  event_name?: unknown;
  event_status?: unknown;
  description?: unknown;
  short_description?: unknown;
  long_description?: unknown;
};

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

type ApiEventsResponse = {
  events: ManagementApiEvent[];
  meta?: { has_more?: boolean };
};

// ---------------------------------------------------------------------------
// Helpers (ported from managementApi.ts)
// ---------------------------------------------------------------------------

function getString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function resolveHttpUrl(value: string, baseUrl: string): string | null {
  let cleaned = value.trim();
  if (!cleaned) return null;

  // Strip trailing punctuation that commonly sneaks in from copy/paste.
  while (/[)\].,!?;:]+$/.test(cleaned)) cleaned = cleaned.slice(0, -1);

  if (cleaned.startsWith("//")) {
    return resolveHttpUrl(`https:${cleaned}`, baseUrl);
  }

  if (
    /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|$)/i.test(cleaned) &&
    !/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)
  ) {
    return resolveHttpUrl(`https://${cleaned}`, baseUrl);
  }

  try {
    const url = new URL(cleaned, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function getEventStart(event: ManagementApiEvent): Date | null {
  const start = getString(event.startDate) ?? getString(event.start_date);
  if (!start) return null;
  const d = new Date(start);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getEventName(event: ManagementApiEvent): string | null {
  return getString(event.name) ?? getString(event.title) ?? getString(event.event_name);
}

function getCanonicalEventUrlBySlug(
  event: ManagementApiEvent,
  websiteUrl: string,
): string | null {
  const slugRaw = getString(event.slug);
  if (!slugRaw) return null;
  const slug = slugRaw.replace(/^\/+|\/+$/g, "");
  if (!slug) return null;
  return resolveHttpUrl(`/events/${slug}`, websiteUrl);
}

function getEventUrl(
  event: ManagementApiEvent,
  baseUrl: string,
  websiteUrl: string,
): string | null {
  const candidates = [
    getString(event.eventUrl),
    getString(event.event_url),
    getString(event.publicUrl),
    getString(event.public_url),
    getCanonicalEventUrlBySlug(event, websiteUrl),
    getString(event.url),
    getString(event.qrUrl),
    getString(event.qr_url),
    getString(event.qrCodeUrl),
    getString(event.qr_code_url),
  ].filter((v): v is string => !!v);

  for (const url of candidates) {
    const resolved = resolveHttpUrl(url, baseUrl);
    if (resolved) return resolved;
  }

  const offers = event.offers as unknown;
  if (Array.isArray(offers)) {
    for (const offer of offers) {
      if (!offer || typeof offer !== "object") continue;
      const offerUrl =
        getString((offer as Record<string, unknown>).url) ??
        getString((offer as Record<string, unknown>).bookingUrl) ??
        getString((offer as Record<string, unknown>).booking_url);
      if (!offerUrl) continue;
      const resolved = resolveHttpUrl(offerUrl, baseUrl);
      if (resolved) return resolved;
    }
  } else if (offers && typeof offers === "object") {
    const offerUrl =
      getString((offers as Record<string, unknown>).url) ??
      getString((offers as Record<string, unknown>).bookingUrl) ??
      getString((offers as Record<string, unknown>).booking_url);
    if (offerUrl) {
      const resolved = resolveHttpUrl(offerUrl, baseUrl);
      if (resolved) return resolved;
    }
  }

  const bookingCandidates = [
    getString(event.bookingUrl),
    getString(event.booking_url),
  ].filter((v): v is string => !!v);
  for (const url of bookingCandidates) {
    const resolved = resolveHttpUrl(url, baseUrl);
    if (resolved) return resolved;
  }

  return null;
}

function formatTime12h(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/London",
  }).format(date);
}

function formatEventPrice(event: ManagementApiEvent): string {
  const ev = event as Record<string, unknown>;
  if (ev.is_free === true || ev.isFree === true) return "Free entry";

  const price = ev.price;
  if (typeof price === "number" && price > 0) {
    const formatted = Number.isInteger(price) ? `£${price}` : `£${price.toFixed(2)}`;
    return `${formatted} per person`;
  }

  return "Free entry";
}

function getEventDescription(event: ManagementApiEvent): string {
  const ev = event as Record<string, unknown>;

  const desc = getString(ev.description);
  if (desc) return desc;

  const short = getString(ev.short_description);
  if (short) return short;

  const long = getString(ev.long_description);
  if (long) {

[truncated at line 200 — original has 404 lines]
```

### `lib/eventFeed/baronshubAdapter.ts`

```
/**
 * BaronsHub public events API adapter.
 *
 * Maps BaronsHub PublicEvent responses to NormalisedEvent objects that match
 * the shape expected by consumers (pdf.ts, clipboardDocx.ts).
 */

import type { EventFeedAdapter, EventFeedConfig, NormalisedEvent } from "./types";

// ---------------------------------------------------------------------------
// BaronsHub response shape
// ---------------------------------------------------------------------------

type BaronsHubEvent = {
  id: string;
  slug: string;
  title: string;
  teaser: string | null;
  highlights: string[];
  eventType: string;
  status: string;
  startAt: string;
  endAt: string;
  description: string | null;
  bookingType: string | null;
  ticketPrice: number | null;
  bookingUrl: string | null;
  eventImageUrl: string | null;
  venue: {
    id: string;
    name: string;
    address: string | null;
    capacity: number | null;
  };
  updatedAt: string;
};

type BaronsHubResponse = {
  data: BaronsHubEvent[];
  pagination: { nextCursor: string | null; hasMore: boolean };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime12h(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/London",
  }).format(date);
}

function formatPrice(ticketPrice: number | null, bookingType: string | null): string {
  if (ticketPrice != null && ticketPrice > 0) {
    const formatted = Number.isInteger(ticketPrice)
      ? `£${ticketPrice}`
      : `£${ticketPrice.toFixed(2)}`;
    return `${formatted} per person`;
  }

  if (bookingType === "free_entry" || ticketPrice === 0) return "Free entry";

  // Null price without explicit free_entry booking type: unknown
  return "Free entry";
}

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function resolveEventUrl(
  bookingUrl: string | null,
  websiteUrl: string,
  slug: string,
): string | null {
  if (bookingUrl && isHttpsUrl(bookingUrl)) return bookingUrl;

  // Construct from websiteUrl + slug.
  if (websiteUrl && slug) {
    const base = websiteUrl.replace(/\/+$/, "");
    const cleanSlug = slug.replace(/^\/+|\/+$/g, "");
    if (cleanSlug) {
      const constructed = `${base}/events/${cleanSlug}`;
      if (isHttpsUrl(constructed)) return constructed;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Map a BaronsHub event to NormalisedEvent
// ---------------------------------------------------------------------------

function toNormalisedEvent(
  event: BaronsHubEvent,
  websiteUrl: string,
): NormalisedEvent | null {
  const name = event.title?.trim();
  if (!name) return null;

  const startDate = new Date(event.startAt);
  if (Number.isNaN(startDate.getTime())) return null;

  const dayOfWeek = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    timeZone: "Europe/London",
  }).format(startDate);

  const dayNumber = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    timeZone: "Europe/London",
  }).format(startDate);

  const monthShort = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "Europe/London",
  }).format(startDate);

  const dateFormatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  }).format(startDate);

  return {
    name,
    date: startDate,
    time: formatTime12h(startDate),
    dayOfWeek,
    dayNumber,
    monthShort,
    dateFormatted,
    price: formatPrice(event.ticketPrice, event.bookingType),
    description: event.description?.trim() ?? name,
    highlights: Array.isArray(event.highlights)
      ? event.highlights
          .map((h) => (typeof h === "string" ? h.trim() : ""))
          .filter((h) => h.length > 0)
      : [],
    eventUrl: resolveEventUrl(event.bookingUrl, websiteUrl, event.slug),
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createBaronsHubAdapter(config: EventFeedConfig): EventFeedAdapter {
  return {
    async fetchUpcomingEvents(opts) {
      const { afterDate, limit } = opts;

      // Convert afterDate (YYYY-MM-DD) to midnight London time ISO.
      // We use noon UTC as a safe approximation that avoids DST edge cases,
      // then format back to the date boundary in London timezone.
      const fromDate = new Date(`${afterDate}T00:00:00Z`);
      if (Number.isNaN(fromDate.getTime())) return [];
      const fromIso = fromDate.toISOString();

      const url = new URL("/api/v1/events", config.baseUrl);
      url.searchParams.set("from", fromIso);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("endsAfter", fromIso);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} from BaronsHub API${text ? `: ${text}` : ""}`);
      }

      const json = (await res.json()) as BaronsHubResponse;
      const events = json?.data ?? [];

      return events
        .map((e) => toNormalisedEvent(e, config.websiteUrl))
        .filter((d): d is NormalisedEvent => d !== null)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, limit);
    },
  };
}
```

### `lib/eventFeed/index.ts`

```
/**
 * Event feed adapter factory and main entry point.
 *
 * Consumers call `fetchEventsForBrand()` with a BrandFeedConfig (from
 * brandRepo.ts) and a session date. The factory selects the right adapter
 * (Anchor Management or BaronsHub) and returns normalised events.
 */

import type { BrandFeedConfig } from "@/lib/brands/types";
import { createAnchorAdapter } from "./anchorAdapter";
import { createBaronsHubAdapter } from "./baronshubAdapter";
import type { EventFeedAdapter, EventFeedConfig, NormalisedEvent } from "./types";

export type { NormalisedEvent } from "./types";
export type { EventFeedConfig } from "./types";

/**
 * Create an adapter for the given event feed configuration.
 */
export function createEventFeedAdapter(config: EventFeedConfig): EventFeedAdapter {
  switch (config.type) {
    case "anchor_management":
      return createAnchorAdapter(config);
    case "baronshub":
      return createBaronsHubAdapter(config);
    default: {
      // Exhaustiveness check
      const _exhaustive: never = config.type;
      throw new Error(`Unknown event feed type: ${_exhaustive}`);
    }
  }
}

/**
 * Fetch upcoming events for a brand using its feed configuration.
 *
 * Returns an empty array on any error (network, parse, missing config).
 * Never logs API keys.
 */
export async function fetchEventsForBrand(
  feedConfig: BrandFeedConfig,
  sessionDate: string,
  limit: number = 12,
): Promise<NormalisedEvent[]> {
  if (feedConfig.type === "none") return [];
  if (!feedConfig.baseUrl && feedConfig.type !== "anchor_management") return [];
  if (!feedConfig.apiKey && feedConfig.type !== "anchor_management") return [];

  try {
    const config: EventFeedConfig = {
      type: feedConfig.type as "anchor_management" | "baronshub",
      baseUrl: feedConfig.baseUrl ?? "",
      apiKey: feedConfig.apiKey ?? "",
      websiteUrl: feedConfig.websiteUrl ?? "",
    };
    const adapter = createEventFeedAdapter(config);
    return await adapter.fetchUpcomingEvents({
      afterDate: sessionDate,
      limit,
      sessionDate,
    });
  } catch (error) {
    const brandType = feedConfig.type;
    console.warn(
      `Event feed failed for ${brandType} adapter:`,
      error instanceof Error ? error.message : "Unknown error",
    );
    return [];
  }
}
```

### `lib/eventFeed/types.ts`

```
/**
 * Shared types for the event feed adapter layer.
 *
 * NormalisedEvent intentionally mirrors the existing EventDetail type from
 * lib/managementApi.ts so that consumers (pdf.ts, clipboardDocx.ts) need
 * minimal changes when switching to the adapter abstraction.
 */

export interface NormalisedEvent {
  name: string;
  date: Date;
  /** e.g. "7:00 pm" */
  time: string;
  /** e.g. "Wed" */
  dayOfWeek: string;
  /** e.g. "29" */
  dayNumber: string;
  /** e.g. "Apr" */
  monthShort: string;
  /** e.g. "Wednesday 29 April" */
  dateFormatted: string;
  /** e.g. "£3 per person" or "Free entry" */
  price: string;
  /** Short description text */
  description: string;
  /** Bullet-point highlights from API */
  highlights: string[];
  /** Must be HTTPS or null */
  eventUrl: string | null;
}

export interface EventFeedAdapter {
  fetchUpcomingEvents(opts: {
    /** YYYY-MM-DD in Europe/London */
    afterDate: string;
    limit: number;
    sessionDate?: string;
  }): Promise<NormalisedEvent[]>;
}

export interface EventFeedConfig {
  type: "anchor_management" | "baronshub";
  baseUrl: string;
  apiKey: string;
  websiteUrl: string;
}
```

### `supabase/migrations/20260511120000_add_event_feed_to_brands.sql`

```
-- Add event feed configuration columns to brands table
ALTER TABLE brands
  ADD COLUMN event_feed_type text NOT NULL DEFAULT 'none'
    CHECK (event_feed_type IN ('anchor_management', 'baronshub', 'none')),
  ADD COLUMN event_feed_base_url text,
  ADD COLUMN event_feed_api_key text;

-- Ensure non-'none' feed types have complete config (except anchor_management
-- which falls back to env vars during the transition period)
ALTER TABLE brands
  ADD CONSTRAINT event_feed_config_complete CHECK (
    event_feed_type = 'none'
    OR event_feed_type = 'anchor_management'
    OR (event_feed_base_url IS NOT NULL AND event_feed_api_key IS NOT NULL)
  );

-- The default Anchor brand uses env-var fallback, so only set the type
UPDATE brands SET event_feed_type = 'anchor_management' WHERE is_default = true;
```

## Related Files (grep hints)

These files reference the basenames of changed files. They are hints for verification — not included inline. Read them only if a specific finding requires it.

```
.claude/changes-manifest.log
AGENTS.md
CLAUDE.md
IMPLEMENTATION_PLAN.md
PRD.md
app/api/brands/[id]/logo/route.ts
app/api/sessions/[id]/brand/route.ts
app/api/sessions/[id]/route.ts
app/api/spotify/create-playlist/route.ts
app/brands/[id]/edit/page.tsx
```

## Project Conventions (`CLAUDE.md`)

```markdown
# CLAUDE.md — Music Bingo

This file provides project-specific guidance. See the workspace-level `CLAUDE.md` one directory up for shared conventions.

## Quick Profile

- **Framework**: Next.js 16, React 18.3
- **Test runners**: Playwright (E2E), Python pytest, Node (custom scripts)
- **Database**: Supabase (live sessions, persistent storage)
- **Key integrations**: Spotify Web API, Anchor Management API, PDF generation (pdf-lib), QR codes
- **Size**: ~23 files in lib/, 10+ routes, custom Python module
- **Novel aspects**: Dual test suite (JS + Python), localStorage-to-Supabase live session sync, multi-device gameplay

## Commands

```bash
npm run dev          # Start Next.js dev with custom localStorage script
npm run build        # Production build with custom script
npm run start        # Production server
npm run lint         # ESLint (zero warnings)
npm run typecheck    # TypeScript (no emit)
npm run test:e2e     # Playwright flows (scripts/e2e-flows.mjs)
npm run test:py      # Python pytest -q
npm run verify       # Full pipeline: lint → typecheck → test:py → test:e2e → build
```

## Architecture

**Routes & Pages**
- `/` — Home/landing
- `/host` — Game host view (prep + gameplay)
- `/guest/[sessionId]` — Guest player view
- `/api/sessions/*` — Live session management (Supabase Realtime)
- `/api/spotify/*` — Spotify OAuth + playlist creation
- `/api/generate/*` — PDF & DOCX export

**Key Patterns**
- **Live Sessions**: WebSocket-like via Supabase Realtime on `live_sessions` table; clients subscribe to session channel
- **Game State**: Hosted in localStorage (client) synced to Supabase; reveals (clues/answers) computed on-the-fly
- **PDF Generation**: Custom lib/pdf.ts using pdf-lib + Sharp for image rendering
- **Spotify Auth**: OAuth 2.0 callback → token stored server-side, used to create/populate playlists
- **Custom Scripts**:
  - `next-with-localstorage.mjs` wraps Next.js CLI to enable localStorage in Node/SSR
  - `e2e-flows.mjs` runs Playwright flows end-to-end

## Key Files

| Path | Purpose |
|------|---------|
| `lib/live/types.ts` | Session, game, card, reveal types |
| `lib/live/channel.ts` | Supabase Realtime subscription logic |
| `lib/live/sessionRepo.ts` | CRUD for `live_sessions` table |
| `lib/live/storage.ts` | localStorage ↔ Session object conversion |
| `lib/live/reveal.ts` | Clue/answer reveal computation |
| `lib/generator.ts` | Create bingo cards from tracks |
| `lib/pdf.ts` | PDF export (pdf-lib + Sharp) |
| `lib/spotifyWeb.ts` | Spotify OAuth & web API calls |
| `lib/spotifyLive.ts` | Live Spotify player control |
| `lib/supabase.ts` | Supabase client init (service-role for migrations) |
| `components/` | Game UI (host, guest, card display) |
| `app/api/sessions/` | Session CRUD endpoints |
| `app/api/spotify/` | OAuth callback, playlist creation |
| `app/api/generate/` | PDF/DOCX generation |
| `supabase/migrations/` | DB schema: `live_sessions`, `session_events` |

## Environment Variables

```
# Spotify OAuth (from developer.spotify.com)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
# Optional: override callback URI if default doesn't match Spotify app settings
SPOTIFY_WEB_REDIRECT_URI=http://localhost:3000/api/spotify/callback

# Supabase (required)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Optional: Anchor Management API (for next 3 events in PDF QR codes)
MANAGEMENT_API_BASE_URL=https://management.orangejelly.co.uk
MANAGEMENT_API_TOKEN=anch_your_api_key_here
```

## Project-Specific Rules / Gotchas

### localStorage in Node/SSR
Next.js doesn't provide localStorage natively on the server. The project works around this:
- `next-with-localstorage.mjs` monkeypatches `globalThis.localStorage` during builds and server runs
- All DB writes go through `lib/live/sessionRepo.ts` (Supabase client)
- Client components hydrate from session data passed as props

### Supabase Realtime Subscriptions
- Live sessions use `supabase.channel()` for real-time updates
- Clients subscribe on mount; unsubscribe on unmount to avoid connection leaks
- Message format defined in `lib/live/types.ts` — stay consistent

### Reveal Logic
- `lib/live/reveal.ts` computes clues on-the-fly from card + reveal index
- **Critical**: all clients must use the same seed/reveal algorithm for consistency
- Test with `npm run test:py` (Python implementation also available)

### PDF Export Path
- Uses Sharp + pdf-lib to render images + embed fonts
- Spotify metadata fetched at export time (may vary if playlist updated mid-game)
- QR codes generated via `qrcode` library; embed in PDF with dimensions ~50x50px

### Python Test Suite
- Located in `music_bingo/` (Python module)
- Tests game logic, reveal computation, PDF parsing
- Run with `npm run test:py`; requires Python 3.8+
- Useful for validating cross-language consistency

### Spotify Redirect URI Mismatch
- Common issue: localhost vs 127.0.0.1
- Spotify app settings must list **both** URIs if testing locally
- Production: ensure `SPOTIFY_WEB_REDIRECT_URI` matches your domain exactly

## Deployment Notes

- Build requires `SUPABASE_SERVICE_ROLE_KEY` (used during migration setup)
- Vercel: set all env vars in project settings
- DB migrations auto-run on first deploy (see `supabase/migrations/`)
- Playwright tests can run in CI via `test:e2e` (uses native browser locally; set `BROWSERLESS_URL` in CI)
```

---

_End of pack._
