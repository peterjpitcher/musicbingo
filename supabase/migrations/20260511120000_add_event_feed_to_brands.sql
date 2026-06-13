-- Add event feed configuration columns to brands table
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS event_feed_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS event_feed_base_url text,
  ADD COLUMN IF NOT EXISTS event_feed_api_key text;

ALTER TABLE brands
  ALTER COLUMN event_feed_type SET DEFAULT 'none';

UPDATE brands
  SET event_feed_type = 'none'
  WHERE event_feed_type IS NULL;

ALTER TABLE brands
  ALTER COLUMN event_feed_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'brands_event_feed_type_check'
      AND conrelid = 'brands'::regclass
  ) THEN
    ALTER TABLE brands
      ADD CONSTRAINT brands_event_feed_type_check
      CHECK (event_feed_type IN ('anchor_management', 'baronshub', 'none'));
  END IF;
END $$;

-- Ensure non-'none' feed types have complete config (except anchor_management
-- which falls back to env vars during the transition period)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_feed_config_complete'
      AND conrelid = 'brands'::regclass
  ) THEN
    ALTER TABLE brands
      ADD CONSTRAINT event_feed_config_complete CHECK (
        event_feed_type = 'none'
        OR event_feed_type = 'anchor_management'
        OR (event_feed_base_url IS NOT NULL AND event_feed_api_key IS NOT NULL)
      );
  END IF;
END $$;

-- The default Anchor brand uses env-var fallback, so only set the type
UPDATE brands SET event_feed_type = 'anchor_management' WHERE is_default = true;
