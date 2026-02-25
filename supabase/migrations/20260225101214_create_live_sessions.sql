CREATE TABLE live_sessions (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_date  TEXT NOT NULL DEFAULT '',
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_sessions_created_at ON live_sessions (created_at DESC);
