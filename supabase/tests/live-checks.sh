#!/usr/bin/env bash
#
# Behaviour checks for the live console (spec M-9) and TV pairing on a
# replayed database, run by replay.sh: the server-held control lock, the
# runtime version, writes that prove they landed, link revocation, and the
# pairing tables and functions closed to every API role.
#
#   TEST_DB_NAME=music_bingo_replay_test bash supabase/tests/live-checks.sh
#
# The app calls these functions only with the service role, from Route
# Handlers that have already checked a signed-in host or admin, so the checks
# act as service_role and pass the user in, as the routes do. Fixtures use
# their own ids and emails, so they never meet auth-checks.sh's.
#
# Exit codes: 0 every check passed, 1 otherwise.

set -u -o pipefail

DB="$TEST_DB_NAME"

q() { psql -X -At -q -v ON_ERROR_STOP=1 -d "$DB" "$@" 2>&1; }
as_anon() { q -c "begin; set local role anon; $1; rollback;"; }
as_user() { q -c "begin; set local role authenticated; set local request.jwt.claim.sub = '$1'; $2; rollback;"; }
# Committed, as the routes' calls are: the scenario below builds on each step.
svc() { q -c "set role service_role; $1"; }

fails=0
check() {
  if [ "$2" = "$3" ]; then echo "PASS  $1: $2"
  else echo "FAIL  $1: got '$2', want '$3'"; fails=$((fails + 1)); fi
}
refused() {
  if printf '%s' "$2" | grep -qF -- "$3"; then echo "PASS  $1: refused ($3)"
  else echo "FAIL  $1: not refused, got '$(printf '%s' "$2" | head -1)'"; fails=$((fails + 1)); fi
}

GAME=00000000-0000-4000-8000-0000000000a1
MISSING=00000000-0000-4000-8000-0000000000ff
DEV_A=11111111-1111-4111-8111-111111111111
DEV_B=22222222-2222-4222-8222-222222222222

mkstaff() {
  local id
  id=$(q -c "insert into auth.users (email) values ('$1') returning id") || { echo "$id"; return 1; }
  q -c "insert into public.profiles (id) values ('$id')" >/dev/null || return 1
  [ -n "$2" ] && { q -c "update public.profiles set role = '$2' where id = '$id'" >/dev/null || return 1; }
  echo "$id"
}
HOST=$(mkstaff live-host@example.com host)
PENDING=$(mkstaff live-pending@example.com "")
GONE=$(mkstaff live-gone@example.com host)
fixtures="$(q -c "update public.profiles set deactivated_at = now() where id = '$GONE';
  insert into public.live_sessions (id, name, data) values ('$GAME', 'Live checks night', '{}'::jsonb);" 2>&1)"
if ! printf '%s' "$HOST" | grep -Eq '^[0-9a-f-]{36}$' || printf '%s' "$fixtures" | grep -qi error \
   || [ -z "$(q -c "select to_regprocedure('public.save_live_runtime(uuid, uuid, uuid, bigint, jsonb, text, text, jsonb)')")" ]; then
  echo "FAIL  fixtures could not be made (is the live console schema there?)"
  printf '%s\n%s\n' "$HOST" "$fixtures" | head -5
  exit 1
fi

save() { # device expected_version [session] [client_event_id]
  svc "select public.save_live_runtime('${3:-$GAME}', '$1', '$HOST', $2, '{\"mode\":\"running\",\"n\":$2}'::jsonb, 'runtime_snapshot', '${4:-evt-$1-$2}', '{}'::jsonb)::text"
}

echo "-- one console in control"
check "a fresh game starts at version 0" "$(svc "select runtime_version from public.live_sessions where id = '$GAME'")" 0
check "console A takes control" "$(svc "select public.take_live_control('$GAME', '$DEV_A', '$HOST') ->> 'ok'")" true
check "console B is refused while A is fresh" \
  "$(svc "select public.take_live_control('$GAME', '$DEV_B', '$HOST') ->> 'reason'")" not_controller
check "console B cannot save without the lock" "$(save "$DEV_B" 0 | sed 's/.*"reason": "\([a-z_]*\)".*/\1/')" not_controller
check "and nothing was written" "$(svc "select runtime_version || ':' || coalesce(runtime_data::text, 'null') from public.live_sessions where id = '$GAME'")" "0:null"
check "console B's heartbeat is refused" \
  "$(svc "select public.heartbeat_live_control('$GAME', '$DEV_B', '$HOST') ->> 'reason'")" not_controller
check "console A's heartbeat is accepted" "$(svc "select public.heartbeat_live_control('$GAME', '$DEV_A', '$HOST') ->> 'ok'")" true

echo "-- writes prove they landed, in one transaction"
check "console A saves at version 0" "$(save "$DEV_A" 0 | sed 's/.*"runtime_version": \([0-9]*\).*/\1/')" 1
check "the runtime, the snapshot row and the event landed together" \
  "$(svc "select (select runtime_data ->> 'n' from public.live_sessions where id = '$GAME') || ':' ||
               (select runtime_data ->> 'n' from public.session_runtime_snapshots where session_id = '$GAME') || ':' ||
               (select count(*) from public.session_events where session_id = '$GAME' and client_event_id = 'evt-$DEV_A-0')")" "0:0:1"
check "a stale save (version 0 again) is refused as a conflict" "$(save "$DEV_A" 0 "$GAME" evt-stale | sed 's/.*"reason": "\([a-z_]*\)".*/\1/')" conflict
check "and the stale event was not recorded" \
  "$(svc "select count(*) from public.session_events where session_id = '$GAME' and client_event_id = 'evt-stale'")" 0
check "a save with no version is refused" \
  "$(svc "select public.save_live_runtime('$GAME', '$DEV_A', '$HOST', null, '{}'::jsonb) ->> 'reason'")" conflict
check "a save to a game that does not exist is an error, not ok" \
  "$(svc "select public.save_live_runtime('$MISSING', '$DEV_A', '$HOST', 0, '{}'::jsonb) ->> 'reason'")" missing
refused "a runtime that is not an object is refused" \
  "$(svc "select public.save_live_runtime('$GAME', '$DEV_A', '$HOST', 1, '[]'::jsonb)")" "must be a JSON object"
check "console A saves at version 1" "$(save "$DEV_A" 1 | sed 's/.*"runtime_version": \([0-9]*\).*/\1/')" 2
check "any direct runtime change still bumps the version (the trigger)" \
  "$(q -c "update public.live_sessions set runtime_data = '{\"mode\":\"idle\"}' where id = '$GAME' returning runtime_version")" 3
check "a change to another column leaves it alone" \
  "$(q -c "update public.live_sessions set name = 'Renamed' where id = '$GAME' returning runtime_version")" 3

echo "-- takeover after 30 seconds of silence"
q -c "update public.live_sessions set controller_seen_at = now() - interval '29 seconds' where id = '$GAME'" >/dev/null
check "at 29 seconds console B is still refused" \
  "$(svc "select public.take_live_control('$GAME', '$DEV_B', '$HOST') ->> 'reason'")" not_controller
q -c "update public.live_sessions set controller_seen_at = now() - interval '31 seconds' where id = '$GAME'" >/dev/null
check "at 31 seconds console B takes over, told the version" \
  "$(svc "select (r ->> 'ok') || ':' || (r ->> 'runtime_version') from public.take_live_control('$GAME', '$DEV_B', '$HOST') r")" "true:3"
check "console A's heartbeat now says it lost control" \
  "$(svc "select public.heartbeat_live_control('$GAME', '$DEV_A', '$HOST') ->> 'reason'")" not_controller
check "console A's queued save is refused" "$(save "$DEV_A" 3 | sed 's/.*"reason": "\([a-z_]*\)".*/\1/')" not_controller
check "console A cannot release B's control" "$(svc "select public.release_live_control('$GAME', '$DEV_A', '$HOST') ->> 'reason'")" not_controller
check "console B releases" "$(svc "select public.release_live_control('$GAME', '$DEV_B', '$HOST') ->> 'ok'")" true
check "and console A may take control at once" "$(svc "select public.take_live_control('$GAME', '$DEV_A', '$HOST') ->> 'ok'")" true
check "taking control of a game that does not exist" \
  "$(svc "select public.take_live_control('$MISSING', '$DEV_A', '$HOST') ->> 'reason'")" missing

echo "-- only active staff"
for who in "pending:$PENDING" "deactivated host:$GONE" "nobody:00000000-0000-4000-8000-000000000000"; do
  label="${who%%:*}"; uid="${who#*:}"
  check "$label cannot take control" "$(svc "select public.take_live_control('$GAME', '$DEV_B', '$uid') ->> 'reason'")" inactive
  check "$label cannot save" "$(svc "select public.save_live_runtime('$GAME', '$DEV_A', '$uid', 3, '{}'::jsonb) ->> 'reason'")" inactive
done
check "a console with no device id cannot take control" \
  "$(svc "select public.take_live_control('$GAME', null, '$HOST') ->> 'reason'")" inactive

echo "-- link revocation"
check "a game starts at link generation 1" "$(svc "select link_generation from public.live_sessions where id = '$GAME'")" 1
check "cancelling links moves it to 2" "$(svc "select public.revoke_live_links('$GAME', '$HOST')")" 2
check "cancelling links for a game that does not exist answers null" "$(svc "select coalesce(public.revoke_live_links('$MISSING', '$HOST')::text, 'null')")" null
refused "a pending account cannot cancel links" "$(svc "select public.revoke_live_links('$GAME', '$PENDING')")" inactive

echo "-- closed to every API role"
for fn in "take_live_control('$GAME', '$DEV_A', '$HOST')" "heartbeat_live_control('$GAME', '$DEV_A', '$HOST')" \
          "release_live_control('$GAME', '$DEV_A', '$HOST')" "save_live_runtime('$GAME', '$DEV_A', '$HOST', 3, '{}'::jsonb)" \
          "revoke_live_links('$GAME', '$HOST')"; do
  refused "anon calls ${fn%%(*}" "$(as_anon "select public.$fn")" "permission denied"
  refused "a host calls ${fn%%(*} with the public key" "$(as_user "$HOST" "select public.$fn")" "permission denied"
done
for t in tv_devices tv_pairing_codes tv_pairing_attempts; do
  refused "anon reads $t" "$(as_anon "select count(*) from public.$t")" "permission denied"
  refused "a host reads $t with the public key" "$(as_user "$HOST" "select count(*) from public.$t")" "permission denied"
done
check "live and pairing functions anon or authenticated may execute" \
  "$(q -c "select coalesce(string_agg(p.proname, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and (p.proname like 'kit\\_tv\\_%' or p.proname in ('take_live_control', 'heartbeat_live_control', 'release_live_control',
                  'save_live_runtime', 'revoke_live_links', 'live_control_open_to', 'live_sessions_runtime_version'))
             and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))")" ""
check "security definer functions without a fixed search_path" \
  "$(q -c "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and p.proconfig is null")" 0

echo "live checks failed: $fails"
[ "$fails" -eq 0 ]
