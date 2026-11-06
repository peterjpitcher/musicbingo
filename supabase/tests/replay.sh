#!/usr/bin/env bash
#
# Replays every migration in supabase/migrations, in filename order, against a
# throwaway database bootstrapped to look like a fresh Supabase project, then
# checks the end state. Nothing here touches a real Supabase project.
#
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres \
#     bash supabase/tests/replay.sh
#
# Needs psql on PATH and a Postgres server reachable through the usual PG*
# variables, connecting as postgres (one migration refuses any other role).
# CI provides a postgres:17 service container. Exits non-zero on any failure.
#
# Each migration is applied once, in a single transaction, as production
# applies it. It is not applied twice the way CashBingo's harness does: the
# early migrations (from 20260225101214) use plain CREATE TABLE and were never
# written to be re-run, and history is not rewritten to change that.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS="$HERE/../migrations"
DB="music_bingo_replay_test"

export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
psql_strict() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "==> creating $DB"
psql_strict -d postgres -c "drop database if exists $DB;"
psql_strict -d postgres -c "create database $DB encoding 'UTF8' template template0;"
psql_strict -d "$DB" -f "$HERE/supabase-bootstrap.sql" >/dev/null

COUNT=0
for f in "$MIGRATIONS"/*.sql; do
  COUNT=$((COUNT + 1))
  echo "==> [$COUNT] $(basename "$f")"
  psql_strict --single-transaction -d "$DB" -f "$f" >/dev/null
done
echo "==> replayed $COUNT migrations"

echo "==> asserting the end state"
psql_strict -d "$DB" <<'SQL'
do $$
declare
  missing text;
  exposed text;
  no_rls text;
begin
  -- The tables the app reads and writes (CLAUDE.md, data and sync model).
  select string_agg(t, ', ') into missing
    from unnest(array['brands', 'live_sessions', 'session_events', 'session_runtime_snapshots']) t
   where to_regclass('public.' || t) is null;
  if missing is not null then
    raise exception 'replay: tables missing after replay: %', missing;
  end if;

  -- Every route uses the service role; anon and authenticated get nothing.
  select string_agg(distinct table_name || ' (' || grantee || ')', ', ') into exposed
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated');
  if exposed is not null then
    raise exception 'replay: public tables granted to anon or authenticated: %', exposed;
  end if;

  select string_agg(c.relname, ', ') into no_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if no_rls is not null then
    raise exception 'replay: public tables without RLS: %', no_rls;
  end if;

  if not exists (select 1 from storage.buckets where id = 'brand-assets') then
    raise exception 'replay: brand-assets bucket missing';
  end if;
end
$$;
SQL
echo "==> end state OK"
