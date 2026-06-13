-- Foundation for the rewritten live-session model.
-- These tables are additive so existing live_sessions rows keep working while
-- the app moves away from large JSON blobs.

CREATE TABLE IF NOT EXISTS session_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  game_number integer NOT NULL CHECK (game_number IN (1, 2)),
  theme text NOT NULL DEFAULT '',
  playlist_id text NOT NULL DEFAULT '',
  playlist_name text NOT NULL DEFAULT '',
  playlist_url text,
  total_songs integer NOT NULL DEFAULT 0 CHECK (total_songs >= 0),
  added_count integer NOT NULL DEFAULT 0 CHECK (added_count >= 0),
  challenge_bonus_points integer NOT NULL DEFAULT 10 CHECK (challenge_bonus_points >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, game_number)
);

CREATE TABLE IF NOT EXISTS session_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  game_number integer NOT NULL CHECK (game_number IN (1, 2)),
  position integer NOT NULL CHECK (position >= 0),
  artist text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  spotify_track_id text,
  spotify_uri text,
  track_role text NOT NULL DEFAULT 'game'
    CHECK (track_role IN ('game', 'intro', 'challenge', 'break')),
  challenge_type text
    CHECK (challenge_type IS NULL OR challenge_type IN ('sing-along', 'dance-along')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, game_number, position, track_role)
);

CREATE TABLE IF NOT EXISTS session_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  game_number integer NOT NULL CHECK (game_number IN (1, 2)),
  card_index integer NOT NULL CHECK (card_index >= 0),
  card_id text NOT NULL,
  items jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, game_number, card_index)
);

CREATE TABLE IF NOT EXISTS session_runtime_snapshots (
  session_id uuid PRIMARY KEY REFERENCES live_sessions(id) ON DELETE CASCADE,
  runtime_data jsonb NOT NULL,
  source text NOT NULL DEFAULT 'host',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  client_event_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, client_event_id)
);

CREATE TABLE IF NOT EXISTS session_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('host', 'display')),
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (session_id, role, token_hash)
);

CREATE TABLE IF NOT EXISTS spotify_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES live_sessions(id) ON DELETE SET NULL,
  provider_user_id text,
  refresh_token_ciphertext text,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_games_session_id
  ON session_games(session_id);

CREATE INDEX IF NOT EXISTS idx_session_tracks_session_game
  ON session_tracks(session_id, game_number, position);

CREATE INDEX IF NOT EXISTS idx_session_events_session_created
  ON session_events(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_access_tokens_session_role
  ON session_access_tokens(session_id, role)
  WHERE revoked_at IS NULL;
