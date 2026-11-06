-- Somewhere for technical failures to land: public.app_errors.
--
-- WHY
--   lib/reportError.ts (the shared kit's reporter) posts every reported failure
--   to ERROR_SINK_URL. Until now nothing was recorded beyond Vercel's short log
--   retention. Spec assumption A3 (Anchor Nights standard, 6 November 2026)
--   puts the reports in each app's own database at no cost. This is that
--   table, the same shape as Cash Bingo's (20261106194703_app_errors.sql). The
--   route that writes it is app/api/errors/route.ts.
--
-- WHO CAN TOUCH IT
--   Only the service role, which every Music Bingo route uses. anon and
--   authenticated hold NO privilege on the table (revoked explicitly, because
--   production's default privileges would otherwise hand them everything),
--   and RLS is on with no policy, so even a stray grant later would read and
--   write nothing. Music Bingo has no Supabase Auth and no assert_is_admin(),
--   so unlike Cash Bingo there is no list_app_errors_safe() function: any
--   reader goes through the service role behind the admin secret.
--
-- WHAT IS STORED
--   Redacted text only: the route strips uuids, email addresses, phone numbers
--   and pound amounts before the insert, as the reporter already does before
--   it posts. The length checks below keep a runaway payload from filling the
--   table.
--
-- ROLLBACK
--   drop table if exists public.app_errors;
--   It is new and nothing else depends on it; the reports are lost.

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,
  message text not null,
  digest text,
  path text,
  context jsonb not null default '{}'::jsonb,
  user_agent text,
  constraint app_errors_source_length check (char_length(source) between 1 and 120),
  constraint app_errors_message_length check (char_length(message) between 1 and 2000),
  constraint app_errors_digest_length check (digest is null or char_length(digest) <= 200),
  constraint app_errors_path_length check (path is null or char_length(path) <= 500),
  constraint app_errors_user_agent_length check (user_agent is null or char_length(user_agent) <= 300),
  constraint app_errors_context_is_object check (jsonb_typeof(context) = 'object'),
  constraint app_errors_context_size check (pg_column_size(context) <= 4096)
);

comment on table public.app_errors is
  'Redacted technical failures posted by lib/reportError.ts through /api/errors. Service role only.';

-- Newest first is the only read.
create index if not exists app_errors_created_at_idx on public.app_errors (created_at desc);

alter table public.app_errors enable row level security;

revoke all on table public.app_errors from public, anon, authenticated;
grant all on table public.app_errors to service_role;

-- Prove the end state inside the same transaction, so a wrong grant fails the
-- apply instead of shipping.
do $$
declare
  v_priv text;
begin
  foreach v_priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege('anon', 'public.app_errors', v_priv) then
      raise exception 'app_errors: anon holds % on public.app_errors', v_priv;
    end if;
    if has_table_privilege('authenticated', 'public.app_errors', v_priv) then
      raise exception 'app_errors: authenticated holds % on public.app_errors', v_priv;
    end if;
  end loop;

  foreach v_priv in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if not has_table_privilege('service_role', 'public.app_errors', v_priv) then
      raise exception 'app_errors: service_role lacks % on public.app_errors', v_priv;
    end if;
  end loop;

  if not (select relrowsecurity from pg_class where oid = 'public.app_errors'::regclass) then
    raise exception 'app_errors: row level security is off';
  end if;
end;
$$;
