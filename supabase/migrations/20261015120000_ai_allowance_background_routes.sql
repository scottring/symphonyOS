-- Background paid routes charge the person they work for (beta readiness B03,
-- 2026-10-15). email-scanner, extract-email, gmail-check, school-digest,
-- proactive-engine, vault-sync, extract-capture and parse-page's worker path
-- run with the service role or a shared secret, not a person's JWT, so
-- reserve_ai_provider_call (keyed on auth.uid()) always refused them and they
-- went unmetered. This variant takes the user explicitly and may be called
-- ONLY by the service role: a signed-in person cannot name someone else.
-- Same policies, same counters, same lock as the interactive function.

create or replace function public.ai_background_routes()
returns text[] language sql immutable as $$
  select array['email-scanner', 'extract-email', 'gmail-check', 'school-digest', 'proactive-engine', 'vault-sync', 'extract-capture', 'parse-page']
$$;
revoke all on function public.ai_background_routes() from public;
grant execute on function public.ai_background_routes() to service_role;

create or replace function public.reserve_ai_provider_call_for(p_user uuid, p_route text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  household uuid;
  household_count integer;
  global_policy public.ai_usage_configuration%rowtype;
  family_policy public.ai_household_allowances%rowtype;
  day_start date;
  month_start date;
  global_day bigint;
  global_month bigint;
  family_day bigint;
  family_month bigint;
begin
  -- Only the service role (a worker, a cron) may charge a named person. The
  -- EXECUTE grant below is the first fence; this is the second: inside a
  -- security definer function current_user is the owner, so the proof is the
  -- request's JWT role claim, which PostgREST sets from the service key and a
  -- signed-in person's token can never carry.
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    return jsonb_build_object('allowed', false, 'reason', 'unavailable');
  end if;
  if p_user is null then return jsonb_build_object('allowed', false, 'reason', 'unavailable'); end if;
  if p_route is null or p_route <> all (public.ai_background_routes()) then
    return jsonb_build_object('allowed', false, 'reason', 'unavailable');
  end if;

  select * into global_policy from public.ai_usage_configuration where singleton for update;
  if not found or not global_policy.enabled or global_policy.daily_calls is null or global_policy.monthly_calls is null then
    return jsonb_build_object('allowed', false, 'reason', 'unavailable');
  end if;

  select count(*), min(hm.household_id::text)::uuid into household_count, household
    from public.household_members hm where hm.user_id = p_user and hm.status = 'active';
  if household_count <> 1 then return jsonb_build_object('allowed', false, 'reason', 'unavailable'); end if;
  select * into family_policy from public.ai_household_allowances where household_id = household for share;
  if not found or not family_policy.enabled or family_policy.daily_calls is null or family_policy.monthly_calls is null then
    return jsonb_build_object('allowed', false, 'reason', 'unavailable');
  end if;

  day_start := (clock_timestamp() at time zone 'UTC')::date;
  month_start := date_trunc('month', day_start)::date;
  select coalesce(sum(calls) filter (where usage_day = day_start), 0), coalesce(sum(calls), 0),
    coalesce(sum(calls) filter (where usage_day = day_start and household_id = household), 0),
    coalesce(sum(calls) filter (where household_id = household), 0)
    into global_day, global_month, family_day, family_month
    from public.ai_provider_call_usage where usage_day >= month_start and usage_day <= day_start;
  if global_month >= global_policy.monthly_calls or family_month >= family_policy.monthly_calls then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_limit',
      'retry_at', (month_start + interval '1 month') at time zone 'UTC');
  end if;
  if global_day >= global_policy.daily_calls or family_day >= family_policy.daily_calls then
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit',
      'retry_at', (day_start + interval '1 day') at time zone 'UTC');
  end if;

  insert into public.ai_provider_call_usage (usage_day, user_id, household_id, route, calls)
    values (day_start, p_user, household, p_route, 1)
    on conflict (usage_day, user_id, household_id, route) do update
      set calls = public.ai_provider_call_usage.calls + 1;
  return jsonb_build_object('allowed', true);
end;
$$;
revoke all on function public.reserve_ai_provider_call_for(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_ai_provider_call_for(uuid, text) to service_role;
