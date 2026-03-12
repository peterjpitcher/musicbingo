-- Add a runtime_data column to live_sessions for cross-device runtime state sync.
-- The host writes current playback/reveal state here; guests poll it.
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS runtime_data JSONB;
