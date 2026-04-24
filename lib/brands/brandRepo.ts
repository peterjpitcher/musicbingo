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
