-- Makes an empty Postgres look enough like a fresh Supabase project for every
-- migration in supabase/migrations to replay. Test-only: never run this
-- against a real Supabase project.
--
-- What the migrations lean on:
--   roles anon, authenticated, service_role  (grants, revokes, RLS)
--   storage.buckets                          (20260424120002 inserts a bucket)
--   default privileges in public             (20260929112318 probes them)
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
end
$$;

grant anon, authenticated, service_role to postgres;
grant usage on schema public to anon, authenticated, service_role;

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
