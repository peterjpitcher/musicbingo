-- @anchor-nights/kit auth: the active-identity gate on public.live_sessions.
-- Restrictive, so it narrows every other policy on the table: an account that
-- is not active staff (pending, deactivated, banned or deleted) reaches no row
-- here through the Data API, RPC or Realtime, even with a still-valid JWT.
alter table public.live_sessions enable row level security;
drop policy if exists active_staff_gate on public.live_sessions;
create policy active_staff_gate on public.live_sessions
  as restrictive for all to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));

-- @anchor-nights/kit auth: the active-identity gate on public.session_runtime_snapshots.
-- Restrictive, so it narrows every other policy on the table: an account that
-- is not active staff (pending, deactivated, banned or deleted) reaches no row
-- here through the Data API, RPC or Realtime, even with a still-valid JWT.
alter table public.session_runtime_snapshots enable row level security;
drop policy if exists active_staff_gate on public.session_runtime_snapshots;
create policy active_staff_gate on public.session_runtime_snapshots
  as restrictive for all to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));

-- @anchor-nights/kit auth: the active-identity gate on public.session_events.
-- Restrictive, so it narrows every other policy on the table: an account that
-- is not active staff (pending, deactivated, banned or deleted) reaches no row
-- here through the Data API, RPC or Realtime, even with a still-valid JWT.
alter table public.session_events enable row level security;
drop policy if exists active_staff_gate on public.session_events;
create policy active_staff_gate on public.session_events
  as restrictive for all to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));

-- @anchor-nights/kit auth: the active-identity gate on public.brands.
-- Restrictive, so it narrows every other policy on the table: an account that
-- is not active staff (pending, deactivated, banned or deleted) reaches no row
-- here through the Data API, RPC or Realtime, even with a still-valid JWT.
alter table public.brands enable row level security;
drop policy if exists active_staff_gate on public.brands;
create policy active_staff_gate on public.brands
  as restrictive for all to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));

-- @anchor-nights/kit auth: the active-identity gate on public.app_errors.
-- Restrictive, so it narrows every other policy on the table: an account that
-- is not active staff (pending, deactivated, banned or deleted) reaches no row
-- here through the Data API, RPC or Realtime, even with a still-valid JWT.
alter table public.app_errors enable row level security;
drop policy if exists active_staff_gate on public.app_errors;
create policy active_staff_gate on public.app_errors
  as restrictive for all to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));
