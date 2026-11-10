-- Music Bingo: clear the event feed key stored on venues (spec M-7, section 8).
--
-- APPLY ONLY AFTER the events-and-reviews release is live in production AND
-- its env key is proven to work (the TV's events loop shows real events, or
-- GET /api/screen/events answers status "ok" or "no_events", not
-- "missing_config" or "error"). From that release on, nothing reads
-- brands.event_feed_api_key: the events feed and the printed pack take the
-- management API key from ANCHOR_API_KEY (or MANAGEMENT_API_TOKEN, the old
-- name, for one release). Clearing it earlier loses nothing the new code
-- needs, but the code before that release would lose its events.
--
-- What it changes:
--   * event_feed_config_complete required a key for every feed other than
--     "none" and "anchor_management" (BaronsHub, used only by the archived
--     Barons Pubs venue). It is replaced by event_feed_api_key_not_stored,
--     which keeps the column empty from now on, so a key can never be stored
--     with a venue again. A BaronsHub venue now has no key and its printed
--     pack builds without events, as it already does in the app.
--   * every stored key is set to null. The column itself stays (dropping it
--     is a later, separate change once no code names it).
-- No row is deleted. Safe to run twice.

alter table public.brands drop constraint if exists event_feed_config_complete;

update public.brands
set event_feed_api_key = null
where event_feed_api_key is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_feed_api_key_not_stored'
      and conrelid = 'public.brands'::regclass
  ) then
    alter table public.brands
      add constraint event_feed_api_key_not_stored check (event_feed_api_key is null);
  end if;
end;
$$;

comment on column public.brands.event_feed_api_key is
  'Retired 2026-11 (spec M-7): always null. The management API key lives in the ANCHOR_API_KEY environment variable.';
