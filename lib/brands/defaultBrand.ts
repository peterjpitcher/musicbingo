import type { BrandConfig } from "@/lib/brands/types";

/**
 * Fallback brand used by the guest TV before the session's real brand has
 * loaded (and when a session has no brand assigned). Mirrors the Anchor
 * defaults in `app/globals.css :root`, so the TV is correctly themed
 * immediately. Once the real brand arrives it replaces this.
 */
export const DEFAULT_BRAND_CONFIG: BrandConfig = {
  id: "default",
  name: "The Anchor",
  logo_dark_url: "/the-anchor-pub-logo-white-transparent.png",
  logo_light_url: "/the-anchor-pub-logo-black-transparent.png",
  color_primary: "#003F27",
  color_primary_light: "#0F6846",
  color_accent: "#A57626",
  color_accent_light: "#C4952F",
  font_family: null,
  font_display: null,
  font_body: null,
  event_logo_url: null,
  break_message: null,
  end_message: null,
  website_url: "theanchor.pub",
  qr_items: null,
  event_feed_type: "none",
  event_feed_base_url: null,
  event_feed_venue_id: null,
  event_feed_has_key: false,
};
