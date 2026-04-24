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
