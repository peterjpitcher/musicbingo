-- Music Bingo hardening and cleanup.
--
-- Context: the app reaches Supabase through a single client created in
-- lib/supabase.ts using SUPABASE_SERVICE_ROLE_KEY. There is no browser client,
-- no realtime subscription, no anon key in the Vercel project, and auth.users is
-- empty. The service role bypasses RLS and keeps its own grants, so nothing here
-- changes application behaviour.

-- 1. Drop tables left behind by 20260613090000_rewrite_foundation.sql.
--    All five are empty and referenced by zero application code: game state is
--    held in session_runtime_snapshots, and Spotify credentials come from
--    environment variables rather than spotify_connections. Their only foreign
--    keys point at live_sessions and drop with them. No function, view, trigger
--    or inbound foreign key depends on them.
DROP TABLE IF EXISTS public.session_access_tokens;
DROP TABLE IF EXISTS public.session_cards;
DROP TABLE IF EXISTS public.session_games;
DROP TABLE IF EXISTS public.session_tracks;
DROP TABLE IF EXISTS public.spotify_connections;

-- 2. Remove anon and authenticated access.
--    Previously anon held SELECT, INSERT, UPDATE, DELETE and TRUNCATE on every
--    public table. TRUNCATE ignores row level security, so the policies below
--    would not have stopped a wipe if the anon key ever reached a browser.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Drop the policies that granted that access. They are dead once the grants are
-- gone, and leaving them implies an access path that no longer exists.
DROP POLICY IF EXISTS brands_anon_read ON public.brands;
DROP POLICY IF EXISTS brands_authenticated_all ON public.brands;
DROP POLICY IF EXISTS live_sessions_anon_read ON public.live_sessions;
DROP POLICY IF EXISTS live_sessions_authenticated_all ON public.live_sessions;

-- 3. Row level security on every remaining public table. With no policies
--    attached this denies everything except the service role, which bypasses RLS.
ALTER TABLE public.brands                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_runtime_snapshots ENABLE ROW LEVEL SECURITY;

-- 4. Cap growth of session_events. It is append only: 5,935 rows inserted since
--    13 June 2026 with no deletes and nothing to prune it.
CREATE OR REPLACE FUNCTION public.prune_session_events(retain_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  deleted integer;
BEGIN
  IF retain_days IS NULL OR retain_days < 1 THEN
    RAISE EXCEPTION 'retain_days must be at least 1, got %', retain_days;
  END IF;

  DELETE FROM public.session_events
  WHERE created_at < now() - make_interval(days => retain_days);

  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

COMMENT ON FUNCTION public.prune_session_events(integer) IS
  'Deletes session_events older than retain_days (default 90). Scheduled daily via pg_cron where available; otherwise call manually.';

REVOKE ALL ON FUNCTION public.prune_session_events(integer) FROM PUBLIC, anon, authenticated;

-- Supporting index so the prune does not table scan as the table grows.
CREATE INDEX IF NOT EXISTS session_events_created_at_idx
  ON public.session_events (created_at);

-- 5. Run the prune nightly at 03:00 UTC. Wrapped so the migration still applies
--    on an environment where pg_cron is unavailable, in which case the function
--    remains callable by hand.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  PERFORM cron.unschedule('prune-session-events')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-session-events');

  PERFORM cron.schedule(
    'prune-session-events',
    '0 3 * * *',
    $cron$SELECT public.prune_session_events(90);$cron$
  );
EXCEPTION
  WHEN insufficient_privilege OR feature_not_supported THEN
    RAISE NOTICE 'pg_cron unavailable, skipping schedule. Call public.prune_session_events() manually.';
END;
$$;
