-- Add event feed configuration columns to brands table
ALTER TABLE brands
  ADD COLUMN event_feed_type text NOT NULL DEFAULT 'none'
    CHECK (event_feed_type IN ('anchor_management', 'baronshub', 'none')),
  ADD COLUMN event_feed_base_url text,
  ADD COLUMN event_feed_api_key text;

-- Ensure non-'none' feed types have complete config (except anchor_management
-- which falls back to env vars during the transition period)
ALTER TABLE brands
  ADD CONSTRAINT event_feed_config_complete CHECK (
    event_feed_type = 'none'
    OR event_feed_type = 'anchor_management'
    OR (event_feed_base_url IS NOT NULL AND event_feed_api_key IS NOT NULL)
  );

-- The default Anchor brand uses env-var fallback, so only set the type
UPDATE brands SET event_feed_type = 'anchor_management' WHERE is_default = true;
