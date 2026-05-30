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

/**
 * A brand logo object key: a Supabase Storage key (e.g. "<brandId>/logo-dark.png")
 * or a legacy "/public" path (e.g. "/logo.png"). Must not contain ".." — path
 * traversal is rejected here as defence-in-depth alongside the filesystem
 * confinement in brandStorage.ts.
 */
const logoUrlSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes(".."), {
    message: "Logo path must not contain '..'",
  });

export const brandSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  is_default: z.boolean(),
  logo_dark_url: logoUrlSchema,
  logo_light_url: logoUrlSchema,
  color_primary: HEX_COLOUR,
  color_primary_light: HEX_COLOUR,
  color_accent: HEX_COLOUR,
  color_accent_light: HEX_COLOUR,
  font_family: z.string().max(100).nullable(),
  font_display: z.string().max(100).nullable().optional(),
  font_body: z.string().max(100).nullable().optional(),
  event_logo_url: z.string().max(300).nullable().or(z.literal("")).optional(),
  break_message: z.string().max(500).nullable(),
  end_message: z.string().max(500).nullable(),
  website_url: z.string().max(200).nullable().or(z.literal("")),
  qr_items: z.array(qrItemSchema).max(4).nullable(),
  event_feed_type: z.enum(["anchor_management", "baronshub", "none"]).default("none"),
  event_feed_base_url: z.string().url().nullable().or(z.literal("")),
  event_feed_venue_id: z.string().max(100).nullable().or(z.literal("")),
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
  | "font_display"
  | "font_body"
  | "event_logo_url"
  | "break_message"
  | "end_message"
  | "website_url"
  | "qr_items"
  | "event_feed_type"
  | "event_feed_base_url"
  | "event_feed_venue_id"
  | "event_feed_has_key"
>;

/** Server-only type for event feed configuration (includes secret API key). */
export type BrandFeedConfig = {
  type: "anchor_management" | "baronshub" | "none";
  baseUrl: string | null;
  apiKey: string | null;
  websiteUrl: string | null;
  venueId: string | null;
};

/** Schema for creating/updating a brand (no id, timestamps auto-generated). */
export const brandInputSchema = brandSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  event_feed_has_key: true,
});

export type BrandInput = z.infer<typeof brandInputSchema>;
