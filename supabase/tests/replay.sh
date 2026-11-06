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
# written to be re-run, and history is not rewritten to change that. The kit
# auth migrations (*_kit_auth_*) are the exception: they are applied a second
# time, because the kit promises they are safe to re-run after a partial
# failure.
#
# After the end state, supabase/tests/auth-checks.sh runs the sign-in
# behaviour checks (M-8). To prove those checks bite, they are also run once
# against a second database replayed WITHOUT the kit auth migrations, and
# that run must fail.

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

for f in "$MIGRATIONS"/*_kit_auth_*.sql; do
  echo "==> again: $(basename "$f")"
  psql_strict --single-transaction -d "$DB" -f "$f" >/dev/null
done

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
    from unnest(array['brands', 'live_sessions', 'session_events', 'session_runtime_snapshots',
                      'profiles', 'auth_audit', 'invites', 'recovery_grants']) t
   where to_regclass('public.' || t) is null;
  if missing is not null then
    raise exception 'replay: tables missing after replay: %', missing;
  end if;

  -- Every game route uses the service role: anon gets nothing, and
  -- authenticated gets only what the kit's sign-in needs (its own profile and,
  -- for an admin, the audit), both behind the active-staff gate. Checked with
  -- has_table_privilege so a grant to PUBLIC cannot hide.
  select string_agg(c.relname || ' (' || r.rolname || ')', ', ') into exposed
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) r(rolname)
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
     and (has_table_privilege(r.rolname, c.oid, 'select')
       or has_table_privilege(r.rolname, c.oid, 'insert')
       or has_table_privilege(r.rolname, c.oid, 'update')
       or has_table_privilege(r.rolname, c.oid, 'delete'))
     and not (r.rolname = 'authenticated' and c.relname in ('profiles', 'auth_audit'));
  if exposed is not null then
    raise exception 'replay: public tables reachable by anon or authenticated: %', exposed;
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

echo "==> sign-in behaviour checks"
TEST_DB_NAME="$DB" bash "$HERE/auth-checks.sh"

# Prove the checks catch the problem: replay everything except the kit auth
# migrations and expect the same checks to fail.
BASELINE="${DB}_without_auth"
echo "==> proving the checks bite: replaying into $BASELINE without the kit auth migrations"
psql_strict -d postgres -c "drop database if exists $BASELINE;"
psql_strict -d postgres -c "create database $BASELINE encoding 'UTF8' template template0;"
psql_strict -d "$BASELINE" -f "$HERE/supabase-bootstrap.sql" >/dev/null
for f in "$MIGRATIONS"/*.sql; do
  case "$(basename "$f")" in *_kit_auth_*) continue ;; esac
  psql_strict --single-transaction -d "$BASELINE" -f "$f" >/dev/null
done
if TEST_DB_NAME="$BASELINE" bash "$HERE/auth-checks.sh" >/dev/null 2>&1; then
  echo "replay: the sign-in checks passed on a database with no sign-in schema, so they prove nothing"
  exit 1
fi
psql_strict -d postgres -c "drop database if exists $BASELINE;"
echo "==> the checks fail without the kit auth migrations, as they should"
