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
  event_feed_venue_id: string | null;
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
    event_feed_venue_id: row.event_feed_venue_id,
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
    event_feed_venue_id: brand.event_feed_venue_id,
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
  event_feed_venue_id?: string | null;
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
    .select("event_feed_type, event_feed_base_url, event_feed_venue_id, event_feed_api_key, website_url")
    .eq("id", brandId)
    .maybeSingle();

  if (error) throw new Error(`Failed to get brand feed config: ${error.message}`);
  if (!data) return null;

  const feedType = (data.event_feed_type ?? "none") as BrandFeedConfig["type"];

  if (feedType === "none") {
    return { type: "none", baseUrl: null, apiKey: null, websiteUrl: null, venueId: null };
  }

  let baseUrl: string | null = data.event_feed_base_url;
  let apiKey: string | null = data.event_feed_api_key;
  let websiteUrl: string | null = data.website_url;

  if (feedType === "anchor_management") {
    const envBaseUrl = process.env.MANAGEMENT_API_BASE_URL ?? null;
    // Only pair the env-var token with the env-var URL (or no stored URL).
    // A custom base URL with no per-brand key must NOT receive the global token.
    if (!baseUrl) {
      baseUrl = envBaseUrl;
    }
    if (!apiKey) {
      const isEnvUrl = !data.event_feed_base_url || data.event_feed_base_url === envBaseUrl;
      apiKey = isEnvUrl ? (process.env.MANAGEMENT_API_TOKEN ?? null) : null;
    }
    if (!websiteUrl) {
      websiteUrl = process.env.MANAGEMENT_PUBLIC_EVENTS_BASE_URL ?? "https://www.the-anchor.pub";
    }
  }

  return { type: feedType, baseUrl, apiKey, websiteUrl, venueId: data.event_feed_venue_id ?? null };
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
