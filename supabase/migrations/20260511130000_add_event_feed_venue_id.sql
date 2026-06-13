-- Add optional venue ID filter for event feed adapters (e.g. BaronsHub multi-venue)
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS event_feed_venue_id text DEFAULT NULL;
