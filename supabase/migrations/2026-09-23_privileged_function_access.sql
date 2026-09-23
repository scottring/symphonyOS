-- Privileged (SECURITY DEFINER) function review, 2026-09-23.
-- Findings, ranked by demonstrated impact, are in
-- docs/security/2026-09-23-privileged-functions.md; proof in
-- supabase/tests/094_privileged_function_access.test.sql.
--
-- Supabase grants EXECUTE on new functions to anon and authenticated by
-- default, so several functions meant only for server jobs were callable by
-- anyone holding the public anon key.

-- 1. HIGH — get_household_context(p_user) returned any user's family members
--    (allergies, medications, health conditions), service-provider contacts
--    and task counts to a signed-out caller, or to a signed-in user of
--    another household, given only a user id. Nothing in the app calls it;
--    it exists for the agent/engine, which run with the service role.
revoke execute on function public.get_household_context(uuid) from public, anon, authenticated;
--    Defense in depth if it is ever re-granted: a signed-in caller may only
--    read their own household. (Service role and cron have no auth.uid().)
create or replace function public.get_household_context(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if auth.uid() is not null and not public.users_share_household(auth.uid(), p_user) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('id',fm.id,'name',fm.name,'role',fm.role_label,'age_range',fm.age_range,'allergies',fm.allergies,'medications',fm.medications,'dietary_restrictions',fm.dietary_restrictions,'health_conditions',fm.health_conditions) order by fm.display_order)
      from family_members fm where fm.user_id = p_user and fm.member_type = 'core'), '[]'::jsonb),
    'service_providers', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'category',c.category,'phone',c.phone,'email',c.email,'relationship',c.relationship) order by c.name)
      from contacts c where c.user_id = p_user and c.category in ('service_provider','medical','school','professional')), '[]'::jsonb),
    'obligations', jsonb_build_object(
      'overdue_count', (select count(*) from tasks t where t.user_id = p_user and t.completed = false and t.scheduled_for is not null and t.scheduled_for < now()),
      'waiting_count', (select count(*) from tasks t where t.user_id = p_user and t.completed = false and t.is_waiting = true),
      'inbox_count', (select count(*) from tasks t where t.user_id = p_user and t.completed = false and t.scheduled_for is null and t.bucket = 'inbox'),
      'active_routines', (select count(*) from routines r where r.user_id = p_user and r.visibility = 'active')),
    'pending_actions', (select count(*) from action_queue q where q.user_id = p_user and q.status = 'pending'),
    'generated_at', now()) into v_result;
  return v_result;
end $$;
revoke execute on function public.get_household_context(uuid) from public, anon, authenticated;

-- 2. MEDIUM — server-job entry points anyone could invoke. claim_engine_run
--    let an outsider claim the proactive engine's run slot (suppressing the
--    morning warm); cos_ingest_all / cos_ingest_proposals queue assistant
--    proposals for any user; tasks_sync_from_commitments rewrites any task's
--    placement cache. All are called only by cron or by other SECURITY
--    DEFINER functions/triggers running as the owner.
revoke execute on function public.claim_engine_run(text, integer) from public, anon, authenticated;
revoke execute on function public.cos_ingest_all() from public, anon, authenticated;
revoke execute on function public.cos_ingest_proposals(uuid) from public, anon, authenticated;
revoke execute on function public.tasks_sync_from_commitments(uuid) from public, anon, authenticated;

-- 3. BUG (School mail, medication log) — pgcrypto lives in the `extensions`
--    schema, but these functions search only `public`, so gen_random_bytes
--    was not found and forwarding-address / med-log token creation failed.
--    Also restores the original intent (signed-in users only).
create or replace function public.ensure_inbound_token(p_household uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
begin
  if not exists (
    select 1 from household_members
    where household_id = p_household and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not a member of this household';
  end if;

  update households
     set inbound_token = coalesce(inbound_token, encode(extensions.gen_random_bytes(8), 'hex'))
   where id = p_household
   returning inbound_token into v_token;
  return v_token;
end;
$$;
revoke execute on function public.ensure_inbound_token(uuid) from public, anon;
grant execute on function public.ensure_inbound_token(uuid) to authenticated;

create or replace function public.ensure_med_log_token()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select token into t from med_log_tokens where user_id = auth.uid();
  if t is null then
    t := encode(extensions.gen_random_bytes(24), 'hex');
    insert into med_log_tokens(user_id, token) values (auth.uid(), t)
      on conflict (user_id) do update set token = excluded.token
      returning token into t;
  end if;
  return t;
end;
$$;
revoke execute on function public.ensure_med_log_token() from public, anon;
grant execute on function public.ensure_med_log_token() to authenticated;

-- 4. HYGIENE — trigger functions cannot be called directly (verified: Postgres
--    refuses), but they need no EXECUTE grant for app roles either; triggers
--    fire regardless of the caller's EXECUTE privilege.
revoke execute on function public.check_allowed_signup() from public, anon, authenticated;
revoke execute on function public.ensure_user_has_household() from public, anon, authenticated;
revoke execute on function public.task_commitments_after_change() from public, anon, authenticated;
revoke execute on function public.tasks_mirror_to_commitments() from public, anon, authenticated;
revoke execute on function public.waitlist_signup_to_inbox() from public, anon, authenticated;

-- 5. HARDENING — SECURITY DEFINER functions with no pinned search_path can be
--    steered by objects earlier on the caller's path (e.g. temp tables).
--    pg_temp is listed last so it can never shadow public tables.
alter function public.ensure_user_has_household() set search_path = public, pg_temp;
alter function public.get_user_household_id(uuid) set search_path = public, pg_temp;
alter function public.get_user_household_ids(uuid) set search_path = public, pg_temp;
alter function public.is_household_admin(uuid) set search_path = public, pg_temp;
alter function public.users_share_household(uuid, uuid) set search_path = public, pg_temp;
alter function public.search_notes_semantic(vector, double precision, integer, text) set search_path = public, pg_temp;

-- Deliberately unchanged (see the findings doc): users_share_household,
-- get_user_household_id(s) and is_household_admin stay callable because RLS
-- policies and the app use them (they answer yes/no or return an id for a
-- given user id; no personal data). signup_allowed stays callable by anon
-- because sign-up checks it before an account exists. invitation_preview and
-- accept_household_invitation are gated by an unguessable invitation token;
-- append_chat_message, ensure_discuss_thread, setup_household, is_app_admin
-- and search_notes_semantic check auth.uid().
