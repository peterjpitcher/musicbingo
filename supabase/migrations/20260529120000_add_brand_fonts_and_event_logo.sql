-- After Hours redesign: split display/body fonts + add a gold event logo.
-- Additive only; font_family is retained as a deprecated alias of font_body.
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS font_display text,     -- e.g. "Anton"   (nullable; default resolved in app)
  ADD COLUMN IF NOT EXISTS font_body text,        -- e.g. "Archivo" (nullable; default resolved in app)
  ADD COLUMN IF NOT EXISTS event_logo_url text;   -- brand-assets Storage object key for the gold event logo

-- Backfill: existing single font becomes the body font.
UPDATE brands
  SET font_body = font_family
  WHERE font_body IS NULL AND font_family IS NOT NULL;
