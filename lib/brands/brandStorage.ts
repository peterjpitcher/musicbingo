// lib/brands/brandStorage.ts
import { getSupabaseClient } from "@/lib/supabase";

const BUCKET_NAME = "brand-assets";
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

export type LogoSlot = "logo-dark" | "logo-light" | "event-logo";

/** Upload a logo to Supabase Storage and return the object key. */
export async function uploadBrandLogo(
  brandId: string,
  slot: LogoSlot,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  // The event logo is rendered as the gold lockup on the printed event pack and
  // overlaid on screens, so it must be a transparent WEBP — reject anything else.
  if (slot === "event-logo") {
    if (mimeType !== "image/webp") {
      throw new Error(`Invalid file type for event logo: ${mimeType}. Must be WEBP.`);
    }
  } else if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Invalid file type: ${mimeType}. Must be PNG, JPEG, or WEBP.`);
  }
  if (fileBuffer.byteLength > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(fileBuffer.byteLength / 1024 / 1024).toFixed(1)}MB. Max 2MB.`);
  }

  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
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
