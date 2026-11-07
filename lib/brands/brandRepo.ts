// lib/brands/brandRepo.ts
import { getSupabaseClient } from "@/lib/supabase/service";
import { resolveAnchorApiEnv } from "@/lib/anchorApiEnv";
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
  font_display: string | null;
  font_body: string | null;
  event_logo_url: string | null;
  break_message: string | null;
  end_message: string | null;
  website_url: string | null;
  qr_items: unknown;
  event_feed_type: string;
  event_feed_base_url: string | null;
  event_feed_venue_id: string | null;
  event_feed_api_key: string | null;
  /** Absent until the 20261106210000 migration is applied. */
  archived_at?: string | null;
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
    font_display: row.font_display,
    font_body: row.font_body,
    event_logo_url: row.event_logo_url,
    break_message: row.break_message,
    end_message: row.end_message,
    website_url: row.website_url,
    qr_items: Array.isArray(row.qr_items) ? (row.qr_items as Brand["qr_items"]) : null,
    event_feed_type: row.event_feed_type as Brand["event_feed_type"],
    event_feed_base_url: row.event_feed_base_url,
    event_feed_venue_id: row.event_feed_venue_id,
    event_feed_has_key: Boolean(row.event_feed_api_key),
    archived_at: row.archived_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** True for a venue retired with `archived_at`. */
function isArchived(row: Pick<BrandRow, "archived_at">): boolean {
  return Boolean(row.archived_at);
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
  if (data && !isArchived(data as BrandRow)) return rowToBrand(data as BrandRow);

  // Fallback: the first venue that is not archived, by created_at. Archived is
  // checked here rather than in the query so this still works before the
  // archived_at column exists.
  const { data: fallback, error: fallbackError } = await supabase
    .from("brands")
    .select("*")
    .order("created_at", { ascending: true });

  if (fallbackError) throw new Error(`Failed to get fallback brand: ${fallbackError.message}`);
  const live = ((fallback ?? []) as BrandRow[]).find((row) => !isArchived(row));
  return live ? rowToBrand(live) : null;
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
    font_display: brand.font_display,
    font_body: brand.font_body,
    event_logo_url: brand.event_logo_url,
    break_message: brand.break_message,
    end_message: brand.end_message,
    website_url: brand.website_url,
    qr_items: brand.qr_items,
    event_feed_type: brand.event_feed_type,
    event_feed_base_url: brand.event_feed_base_url,
    event_feed_venue_id: brand.event_feed_venue_id,
    event_feed_has_key: brand.event_feed_has_key,
  };
}

/** Resolve a brand for a session: use brand_id if provided, otherwise default. */
export async function resolveBrandConfig(brandId: string | null | undefined): Promise<BrandConfig | null> {
  // Best-effort: brand resolution must never crash its callers (PDF generation,
  // live TV screens, session reads). If Supabase is unavailable/misconfigured or
  // the brand row can't be read, fall back to default branding (null) instead of
  // throwing — the callers all treat null as "use the built-in defaults".
  try {
    if (brandId) {
      const brand = await getBrand(brandId);
      if (brand) return brandToBrandConfig(brand);
    }
    const defaultBrand = await getDefaultBrand();
    return defaultBrand ? brandToBrandConfig(defaultBrand) : null;
  } catch (err) {
    console.warn(
      "[music-bingo] resolveBrandConfig failed; using default branding:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Resolve the venue the TV screens and host console show for a session. Like
 * resolveBrandConfig, but an archived venue (Barons Pubs) falls back to the
 * default venue, so old games still render in The Anchor look. Printed packs
 * keep using resolveBrandConfig.
 */
export async function resolveScreenBrandConfig(
  brandId: string | null | undefined,
): Promise<BrandConfig | null> {
  try {
    if (brandId) {
      const brand = await getBrand(brandId);
      if (brand && !brand.archived_at) return brandToBrandConfig(brand);
    }
    const defaultBrand = await getDefaultBrand();
    return defaultBrand ? brandToBrandConfig(defaultBrand) : null;
  } catch (err) {
    console.warn(
      "[music-bingo] resolveScreenBrandConfig failed; using default branding:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Input type for createBrand: the DB columns it writes (never event_feed_api_key, spec M-7). */
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
  font_display?: string | null;
  font_body?: string | null;
  event_logo_url?: string | null;
  break_message?: string | null;
  end_message?: string | null;
  website_url?: string | null;
  qr_items?: Brand["qr_items"];
  event_feed_type?: string;
  event_feed_base_url?: string | null;
  event_feed_venue_id?: string | null;
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
 * Server-only: the event pack's feed configuration for a brand (spec M-7).
 *
 * The Anchor Management key comes only from the environment (ANCHOR_API_KEY,
 * or MANAGEMENT_API_TOKEN for one more release; lib/anchorApiEnv.ts), never
 * from brands.event_feed_api_key, which a later migration clears. The env key
 * is only ever sent to the env base URL (or the kit's default): a brand that
 * stores a different base URL gets no key, so the global key can never be
 * sent to a host a venue setting names. BaronsHub (the archived Barons venue)
 * has no env key, so its pack builds without events.
 */
export async function getBrandFeedConfig(brandId: string): Promise<BrandFeedConfig | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("brands")
    .select("event_feed_type, event_feed_base_url, event_feed_venue_id, website_url")
    .eq("id", brandId)
    .maybeSingle();

  if (error) throw new Error(`Failed to get brand feed config: ${error.message}`);
  if (!data) return null;
  return feedConfigFromRow(data);
}

/** The pure part of getBrandFeedConfig, for tests. */
export function feedConfigFromRow(
  row: { event_feed_type: string | null; event_feed_base_url: string | null; event_feed_venue_id: string | null; website_url: string | null },
  env: Readonly<Record<string, string | undefined>> = process.env,
): BrandFeedConfig {
  const feedType = (row.event_feed_type ?? "none") as BrandFeedConfig["type"];
  if (feedType === "none") {
    return { type: "none", baseUrl: null, apiKey: null, websiteUrl: null, venueId: null };
  }
  const venueId = row.event_feed_venue_id ?? null;
  if (feedType !== "anchor_management") {
    return { type: feedType, baseUrl: row.event_feed_base_url, apiKey: null, websiteUrl: row.website_url, venueId };
  }

  const anchorApi = resolveAnchorApiEnv(env);
  const stored = row.event_feed_base_url?.trim().replace(/\/+$/, "") || null;
  const sameHost = !stored || originOf(stored) === originOf(anchorApi.baseUrl);
  return {
    type: feedType,
    baseUrl: stored ?? anchorApi.baseUrl,
    apiKey: sameHost ? anchorApi.apiKey : null,
    websiteUrl: row.website_url || env.MANAGEMENT_PUBLIC_EVENTS_BASE_URL || "https://www.the-anchor.pub",
    venueId,
  };
}

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
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
