-- Music Bingo: server-held control lock, runtime version and link revocation
-- (spec M-9, S4.3, S4.4).
--
-- Music Bingo reaches its game tables only through the service role, from
-- Route Handlers that have already checked a signed-in, active host or admin
-- (lib/auth/routeGuard.ts). These functions check that person again
-- (kit_staff_role_for, so someone deactivated a moment ago is refused) and
-- hold every live write to the lock inside the database:
--
--   * live_sessions.controller_id is the host console in control (a random id
--     per browser tab, sent as the x-host-device header and passed in as
--     p_device), controller_seen_at its last heartbeat or save. Another
--     console may take over once the holder has been silent for 30 seconds.
--   * live_sessions.runtime_version goes up by one whenever runtime_data
--     changes, whoever writes it (a trigger). save_live_runtime is a
--     compare-and-set on it, so an out-of-date save is refused, and the TV
--     drops a snapshot older than the one it shows by this number, not by a
--     clock.
--   * save_live_runtime writes the runtime, the latest-runtime snapshot row
--     and the session event in one transaction, and a game that does not
--     exist is an error ('missing'), never a silent success.
--   * live_sessions.link_generation is stamped into every signed host and TV
--     link. revoke_live_links adds one, so every link made before stops
--     working at its next request.
--
-- Additive and safe to apply twice. The code before this release keeps
-- working on it: it never reads the new columns, and its direct runtime
-- writes still bump the version through the trigger. Rollback:
--   drop function if exists public.save_live_runtime(uuid, uuid, uuid, bigint, jsonb, text, text, jsonb);
--   drop function if exists public.take_live_control(uuid, uuid, uuid);
--   drop function if exists public.heartbeat_live_control(uuid, uuid, uuid);
--   drop function if exists public.release_live_control(uuid, uuid, uuid);
--   drop function if exists public.revoke_live_links(uuid, uuid);
--   drop trigger if exists live_sessions_runtime_version on public.live_sessions;
--   drop function if exists public.live_sessions_runtime_version();
--   drop function if exists public.live_control_open_to(uuid, timestamptz, uuid);
--   alter table public.live_sessions drop column if exists controller_id,
--     drop column if exists controller_seen_at, drop column if exists runtime_version,
--     drop column if exists link_generation;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.live_sessions
  add column if not exists controller_id uuid,
  add column if not exists controller_seen_at timestamptz,
  add column if not exists runtime_version bigint not null default 0,
  add column if not exists link_generation integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'live_sessions_link_generation_positive'
      and conrelid = 'public.live_sessions'::regclass
  ) then
    alter table public.live_sessions
      add constraint live_sessions_link_generation_positive check (link_generation >= 1);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The version number: up by one on every change to runtime_data
-- ---------------------------------------------------------------------------
create or replace function public.live_sessions_runtime_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.runtime_data is distinct from old.runtime_data then
    new.runtime_version := old.runtime_version + 1;
  else
    new.runtime_version := old.runtime_version;
  end if;
  return new;
end;
$$;
revoke all on function public.live_sessions_runtime_version() from public, anon, authenticated;

drop trigger if exists live_sessions_runtime_version on public.live_sessions;
create trigger live_sessions_runtime_version
  before update on public.live_sessions
  for each row execute function public.live_sessions_runtime_version();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Whether p_device may act on a session whose control stands at
-- (p_controller, p_seen): nobody holds it, the holder has been silent for 30
-- seconds, or p_device is the holder.
create or replace function public.live_control_open_to(p_controller uuid, p_seen timestamptz, p_device uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_controller is null
    or p_seen is null
    or p_seen < pg_catalog.now() - interval '30 seconds'
    or (p_device is not null and p_controller = p_device)
$$;
revoke all on function public.live_control_open_to(uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.live_control_open_to(uuid, timestamptz, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- take, heartbeat, release
-- ---------------------------------------------------------------------------

-- Take control for p_device, or keep it. Refused while another console has
-- saved or sent a heartbeat in the last 30 seconds. Returns
-- {ok, reason?, runtime_version, seen_seconds_ago?}; reason is inactive,
-- missing or not_controller.
create or replace function public.take_live_control(p_session_id uuid, p_device uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_controller uuid;
  v_seen timestamptz;
  v_version bigint;
begin
  if p_device is null or coalesce(public.kit_staff_role_for(p_user) in ('admin', 'host'), false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;

  select s.controller_id, s.controller_seen_at, s.runtime_version
    into v_controller, v_seen, v_version
    from public.live_sessions s
    where s.id = p_session_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;

  if not public.live_control_open_to(v_controller, v_seen, p_device) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_controller',
      'runtime_version', v_version,
      'seen_seconds_ago', floor(extract(epoch from (pg_catalog.now() - v_seen)))::int
    );
  end if;

  update public.live_sessions
    set controller_id = p_device, controller_seen_at = pg_catalog.now()
    where id = p_session_id;
  return jsonb_build_object('ok', true, 'runtime_version', v_version);
end;
$$;
revoke all on function public.take_live_control(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.take_live_control(uuid, uuid, uuid) to service_role;

-- The holder's heartbeat, every 10 seconds. Anything but the console in
-- control is told not_controller, which the console treats as lost control.
create or replace function public.heartbeat_live_control(p_session_id uuid, p_device uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_controller uuid;
  v_seen timestamptz;
  v_version bigint;
begin
  if p_device is null or coalesce(public.kit_staff_role_for(p_user) in ('admin', 'host'), false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;

  select s.controller_id, s.controller_seen_at, s.runtime_version
    into v_controller, v_seen, v_version
    from public.live_sessions s
    where s.id = p_session_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;

  if v_controller is distinct from p_device then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_controller',
      'runtime_version', v_version,
      'seen_seconds_ago', case when v_seen is null then null
        else floor(extract(epoch from (pg_catalog.now() - v_seen)))::int end
    );
  end if;

  update public.live_sessions set controller_seen_at = pg_catalog.now() where id = p_session_id;
  return jsonb_build_object('ok', true, 'runtime_version', v_version);
end;
$$;
revoke all on function public.heartbeat_live_control(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.heartbeat_live_control(uuid, uuid, uuid) to service_role;

-- Let go, so another console can take over at once (the console calls it
-- when its tab closes). Only the holder can release.
create or replace function public.release_live_control(p_session_id uuid, p_device uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released integer;
begin
  if p_device is null or coalesce(public.kit_staff_role_for(p_user) in ('admin', 'host'), false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;

  update public.live_sessions s
    set controller_id = null, controller_seen_at = null
    where s.id = p_session_id and s.controller_id = p_device;
  get diagnostics v_released = row_count;
  if v_released = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_controller');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.release_live_control(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_live_control(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- The one live write
-- ---------------------------------------------------------------------------

-- Save the host's runtime: the lock, then the version, then the runtime, its
-- snapshot row and (when given) the session event, all in one transaction.
-- Returns {ok, reason?, runtime_version}; reason is inactive, missing,
-- not_controller or conflict (p_expected_version is not the stored version,
-- so this save is out of date and nothing was written).
create or replace function public.save_live_runtime(
  p_session_id uuid,
  p_device uuid,
  p_user uuid,
  p_expected_version bigint,
  p_runtime jsonb,
  p_event_type text default null,
  p_client_event_id text default null,
  p_event_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_controller uuid;
  v_seen timestamptz;
  v_version bigint;
  v_new bigint;
begin
  if p_device is null or coalesce(public.kit_staff_role_for(p_user) in ('admin', 'host'), false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;
  if p_runtime is null or jsonb_typeof(p_runtime) <> 'object' then
    raise exception 'save_live_runtime: the runtime must be a JSON object' using errcode = '22023';
  end if;

  select s.controller_id, s.controller_seen_at, s.runtime_version
    into v_controller, v_seen, v_version
    from public.live_sessions s
    where s.id = p_session_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;

  if not public.live_control_open_to(v_controller, v_seen, p_device) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_controller',
      'runtime_version', v_version,
      'seen_seconds_ago', floor(extract(epoch from (pg_catalog.now() - v_seen)))::int
    );
  end if;

  if p_expected_version is null or p_expected_version <> v_version then
    return jsonb_build_object('ok', false, 'reason', 'conflict', 'runtime_version', v_version);
  end if;

  update public.live_sessions
    set runtime_data = p_runtime,
        controller_id = p_device,
        controller_seen_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where id = p_session_id
    returning runtime_version into v_new;
  if v_new is null then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;

  insert into public.session_runtime_snapshots (session_id, runtime_data, source, updated_at)
    values (p_session_id, p_runtime, 'host', pg_catalog.now())
    on conflict (session_id) do update
      set runtime_data = excluded.runtime_data, source = excluded.source, updated_at = excluded.updated_at;

  if p_event_type is not null then
    insert into public.session_events (session_id, client_event_id, event_type, payload)
      values (p_session_id, p_client_event_id, p_event_type, coalesce(p_event_payload, '{}'::jsonb))
      on conflict (session_id, client_event_id) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'runtime_version', v_new);
end;
$$;
revoke all on function public.save_live_runtime(uuid, uuid, uuid, bigint, jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_live_runtime(uuid, uuid, uuid, bigint, jsonb, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Link revocation
-- ---------------------------------------------------------------------------

-- Cancel every host and TV link made so far for a game: the new generation
-- is stamped into links made from now on, and older ones are refused at
-- their next request. Returns the new generation, or null when the game does
-- not exist. Raises inactive for anyone who is not active staff.
create or replace function public.revoke_live_links(p_session_id uuid, p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_generation integer;
begin
  if coalesce(public.kit_staff_role_for(p_user) in ('admin', 'host'), false) is not true then
    raise exception 'inactive' using errcode = 'P0001', hint = 'Only active staff can cancel links.';
  end if;
  update public.live_sessions
    set link_generation = link_generation + 1
    where id = p_session_id
    returning link_generation into v_generation;
  return v_generation;
end;
$$;
revoke all on function public.revoke_live_links(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_live_links(uuid, uuid) to service_role;
