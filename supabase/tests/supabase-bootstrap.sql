-- Makes an empty Postgres look enough like a fresh Supabase project for every
-- migration in supabase/migrations to replay. Test-only: never run this
-- against a real Supabase project.
--
-- What the migrations lean on:
--   roles anon, authenticated, service_role  (grants, revokes, RLS)
--   role supabase_auth_admin                 (the kit's Before User Created hook)
--   storage.buckets                          (20260424120002 inserts a bucket)
--   auth.users and auth.uid()                (the kit auth migrations, 20261107090000 on)
--   default privileges in public             (20260929112318 probes them)
--
-- auth.uid() reads the same setting PostgREST sets from the JWT, so a check
-- acts as a user with `set local request.jwt.claim.sub = '<uuid>'` (copied
-- from @anchor-nights/kit test/db/supabase-stubs.sql).
--
-- The default privileges mirror the ones production was built with: postgres
-- grants everything in public to the three API roles, and 20260808170000 then
-- takes anon and authenticated back off.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit;
  end if;
end
$$;

grant anon, authenticated, service_role, supabase_auth_admin to postgres;
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
