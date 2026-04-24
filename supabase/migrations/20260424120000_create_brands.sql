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
  U&'\1F37A Head to the bar! Kitchen is open until 9pm.',
  U&'\1F37A Drinks & food orders at the bar \2014 kitchen open until 9pm.',
  'https://the-anchor.pub',
  NULL
);
