#!/usr/bin/env bash
#
# Behaviour checks for staff sign-in (spec M-8) on a replayed database, run by
# replay.sh. Each check acts as the caller a real request would be: anon (the
# public key with no session), a pending account, a host, an admin, a banned
# host, a deactivated host, an account with no profile, the service role and
# the Auth hook role. Every act-as query runs in a transaction that is rolled
# back, so checks cannot leak into each other.
#
#   TEST_DB_NAME=music_bingo_replay_test bash supabase/tests/auth-checks.sh
#
# The kit replays its own templates far more deeply in its own CI; these
# checks prove what Music Bingo relies on: the active-identity gate, the game
# tables closed to every API role, profiles that nobody can promote
# themselves through, the kit tables closed, and the invite-only hook.
#
# Exit codes: 0 every check passed, 1 otherwise.

set -u -o pipefail

DB="$TEST_DB_NAME"

q() { psql -X -At -q -v ON_ERROR_STOP=1 -d "$DB" "$@" 2>&1; }
as_anon() { q -c "begin; set local role anon; $1; rollback;"; }
as_user() { q -c "begin; set local role authenticated; set local request.jwt.claim.sub = '$1'; $2; rollback;"; }
as_service() { q -c "begin; set local role service_role; $1; rollback;"; }
as_hook() { q -c "begin; set local role supabase_auth_admin; $1; rollback;"; }

fails=0
check() {
  if [ "$2" = "$3" ]; then echo "PASS  $1: $2"
  else echo "FAIL  $1: got '$2', want '$3'"; fails=$((fails + 1)); fi
}
refused() {
  if printf '%s' "$2" | grep -qF -- "$3"; then echo "PASS  $1: refused ($3)"
  else echo "FAIL  $1: not refused, got '$(printf '%s' "$2" | head -1)'"; fails=$((fails + 1)); fi
}

# ---- fixtures, made as the database owner the way Supabase Auth and the
# kit's invite acceptance would make them.
mkuser() {
  local id
  id=$(q -c "insert into auth.users (email) values ('$1') returning id") || { echo "$id"; return 1; }
  q -c "insert into public.profiles (id) values ('$id')" >/dev/null || return 1
  echo "$id"
}
PENDING=$(mkuser pending@example.com)
HOST=$(mkuser host@example.com)
ADMIN=$(mkuser admin@example.com)
BANNED=$(mkuser banned@example.com)
GONE=$(mkuser gone@example.com)
NOPROFILE=$(q -c "insert into auth.users (email) values ('noprofile@example.com') returning id")
fixtures="$(q -c "update public.profiles set role = 'host' where id in ('$HOST', '$BANNED', '$GONE');
      update public.profiles set role = 'admin' where id = '$ADMIN';
      update public.profiles set deactivated_at = now() where id = '$GONE';
      update auth.users set banned_until = now() + interval '876000 hours' where id = '$BANNED';
      insert into public.live_sessions (id, name, data)
        values ('00000000-0000-4000-8000-000000000001', 'Replay night', '{}'::jsonb);" 2>&1)"
if ! printf '%s' "$HOST" | grep -Eq '^[0-9a-f-]{36}$' || ! printf '%s' "$ADMIN" | grep -Eq '^[0-9a-f-]{36}$' \
   || printf '%s' "$fixtures" | grep -qi error; then
  echo "FAIL  fixtures could not be made (is the kit auth schema there?)"
  printf '%s\n%s\n' "$HOST" "$fixtures" | head -5
  exit 1
fi

echo "-- the active-identity gate (is_active_staff, current_staff_role)"
for who in "pending:$PENDING:f:pending" "host:$HOST:t:host" "admin:$ADMIN:t:admin" \
           "banned host:$BANNED:f:pending" "deactivated host:$GONE:f:pending" "no profile:$NOPROFILE:f:"; do
  IFS=: read -r label uid active role <<<"$who"
  check "$label is_active_staff()" "$(as_user "$uid" "select public.is_active_staff()")" "$active"
  check "$label current_staff_role()" "$(as_user "$uid" "select public.current_staff_role()")" "$role"
done
check "admin is_active_admin()" "$(as_user "$ADMIN" "select public.is_active_admin()")" t
check "host is_active_admin()" "$(as_user "$HOST" "select public.is_active_admin()")" f
refused "anon asks for a role" "$(as_anon "select public.current_staff_role()")" "permission denied"

echo "-- game tables: the app reaches them only through the service role"
for t in live_sessions session_runtime_snapshots session_events brands app_errors; do
  refused "anon reads $t" "$(as_anon "select count(*) from public.$t")" "permission denied"
  refused "admin reads $t with the public key" "$(as_user "$ADMIN" "select count(*) from public.$t")" "permission denied"
  refused "host writes $t with the public key" "$(as_user "$HOST" "delete from public.$t")" "permission denied"
done
check "the service role reads live_sessions" "$(as_service "select count(*) from public.live_sessions where id = '00000000-0000-4000-8000-000000000001'")" 1

echo "-- profiles"
check "admin reads every profile" "$(as_user "$ADMIN" "select count(*) >= 5 from public.profiles")" t
check "host reads only their own profile" "$(as_user "$HOST" "select count(*) from public.profiles where id <> '$HOST'")" 0
for who in "pending:$PENDING" "banned host:$BANNED" "deactivated host:$GONE" "no profile:$NOPROFILE"; do
  label="${who%%:*}"; uid="${who#*:}"
  check "$label reads profiles" "$(as_user "$uid" "select count(*) from public.profiles")" 0
done
refused "anon reads profiles" "$(as_anon "select count(*) from public.profiles")" "permission denied"
refused "host promotes themselves, even given the grant" \
  "$(q -c "begin; grant update on public.profiles to authenticated;
           create policy tmp_all on public.profiles for update to authenticated using (true) with check (true);
           set local role authenticated; set local request.jwt.claim.sub = '$HOST';
           update public.profiles set role = 'admin' where id = '$HOST'; rollback;")" "changed by an admin only"
check "the service role sets a role" "$(as_service "update public.profiles set role = 'host' where id = '$PENDING' returning 'ok'")" ok

echo "-- kit tables"
for t in invites recovery_grants auth_audit; do
  refused "anon reads $t" "$(as_anon "select count(*) from public.$t")" "permission denied"
done
for t in invites recovery_grants; do
  refused "admin reads $t" "$(as_user "$ADMIN" "select count(*) from public.$t")" "permission denied"
done
check "host reads no audit rows" "$(as_user "$HOST" "select count(*) from public.auth_audit")" 0
refused "admin writes an audit row" \
  "$(as_user "$ADMIN" "insert into public.auth_audit (app, environment, event, outcome) values ('music-bingo', 'test', 'sign_out', 'success')")" "permission denied"
refused "the service role deletes audit rows" "$(as_service "delete from public.auth_audit")" "permission denied"
refused "authenticated issues an invite" \
  "$(as_user "$ADMIN" "select * from public.kit_issue_invite('z@example.com', 'host', '$(printf 'a%.0s' {1..64})', '$ADMIN')")" "permission denied"
check "the service role issues an invite (the bootstrap script's path)" \
  "$(as_service "select role from public.kit_issue_invite('first@example.com', 'admin', '$(printf 'b%.0s' {1..64})', null)")" admin

echo "-- invite only"
check "the hook refuses an uninvited sign-up" \
  "$(as_hook "select public.kit_before_user_created('{\"user\":{\"email\":\"stranger@example.com\",\"app_metadata\":{\"provider\":\"email\"}}}'::jsonb) -> 'error' ->> 'http_code'")" 403
refused "authenticated calls the hook" "$(as_user "$ADMIN" "select public.kit_before_user_created('{}'::jsonb)")" "permission denied"

echo "-- catalogue"
kit_fns="p.proname like 'kit\\_%' or p.proname in ('is_active_staff', 'is_active_admin', 'current_staff_role')"
check "kit functions anon may execute" \
  "$(q -c "select coalesce(string_agg(p.proname, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and ($kit_fns) and has_function_privilege('anon', p.oid, 'execute')")" ""
check "kit functions authenticated may execute" \
  "$(q -c "select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and ($kit_fns) and has_function_privilege('authenticated', p.oid, 'execute')")" \
  "current_staff_role,is_active_admin,is_active_staff"
check "public tables granted to anon" \
  "$(q -c "select coalesce(string_agg(distinct table_name, ','), '') from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'")" ""
check "public tables granted to authenticated" \
  "$(q -c "select coalesce(string_agg(distinct table_name || ':' || privilege_type, ',' order by table_name || ':' || privilege_type), '') from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated'")" \
  "auth_audit:SELECT,profiles:SELECT"

# ACTIVE_STAFF_GATE_AUDIT_SQL from @anchor-nights/kit/auth/sql, copied so this
# job needs no npm install; lib/auth/gateAuditSql.test.ts fails if it drifts.
GATE_AUDIT_SQL="select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and (
    has_table_privilege('authenticated', c.oid, 'select')
    or has_table_privilege('authenticated', c.oid, 'insert')
    or has_table_privilege('authenticated', c.oid, 'update')
    or has_table_privilege('authenticated', c.oid, 'delete')
  )
  and (
    not c.relrowsecurity
    or not exists (
      select 1 from pg_policy p
      where p.polrelid = c.oid
        and not p.polpermissive
        and pg_get_expr(p.polqual, p.polrelid) like '%is_active_staff()%'
    )
  )
order by 1"
check "tables authenticated can reach without the gate" "$(q -c "$GATE_AUDIT_SQL" | paste -sd, -)" ""
check "game tables carrying the gate" \
  "$(q -c "select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid where p.polname = 'active_staff_gate' and c.relname in ('live_sessions', 'session_runtime_snapshots', 'session_events', 'brands', 'app_errors')")" 5

echo "auth checks failed: $fails"
[ "$fails" -eq 0 ]
