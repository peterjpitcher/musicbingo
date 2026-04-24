-- Add brand_id foreign key to live_sessions
ALTER TABLE live_sessions
  ADD COLUMN brand_id uuid REFERENCES brands(id);

-- Index for lookups
CREATE INDEX idx_live_sessions_brand_id ON live_sessions (brand_id);
