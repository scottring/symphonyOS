-- Every interactive paid route reserves a provider call (beta readiness B03,
-- 2026-10-15). The first allowance migration guarded four routes; a signed-in
-- person could still reach nineteen other paid functions unmetered. The
-- allowlist below must match GUARDED_AI_ROUTES in
-- supabase/functions/_shared/aiUsage.ts. Background routes that run without a
-- person's JWT (email-scanner, extract-email, gmail-check, school-digest,
-- proactive-engine, vault-sync) are NOT here: they need their own trusted
-- attribution and are to be disabled or metered separately before invitations.

create or replace function public.ai_guarded_routes()
returns text[] language sql immutable as $$
  select array[
    'symphony-agent', 'workspace-voice', 'wall-ask', 'wall-say',
    'analyze-attachment', 'analyze-capture', 'analyze-link', 'extract-capture', 'parse-page', 'plan-from-paper', 'routine-from-doc',
    'goal-planning-chat', 'planning-conversation', 'tend-week', 'sharpen-goal', 'suggest-waiting-for', 'rhythms-parse',
    'kiosk-agent', 'math-story', 'meal-planner-chat', 'meal-slot-suggest', 'semantic-search', 'note-match'
  ]
$$;
revoke all on function public.ai_guarded_routes() from public;
grant execute on function public.ai_guarded_routes() to authenticated, service_role;

-- The reservation function, unchanged except that the route allowlist is the
-- shared list above.
create or replace function public.reserve_ai_provider_call(p_route text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
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
  if caller is null then return jsonb_build_object('allowed', false, 'reason', 'unavailable'); end if;
  if p_route is null or p_route <> all (public.ai_guarded_routes()) then
    return jsonb_build_object('allowed', false, 'reason', 'unavailable');
  end if;

  -- One database lock serializes the global check plus every household check.
  -- Edge isolates, parallel devices and retries cannot all spend the last call.
  -- It also makes the emergency disable effective for subsequent reservations.
  select * into global_policy from public.ai_usage_configuration where singleton for update;
  if not found or not global_policy.enabled or global_policy.daily_calls is null or global_policy.monthly_calls is null then
    return jsonb_build_object('allowed', false, 'reason', 'unavailable');
  end if;

  -- The caller cannot pick a billing household in the request. Ambiguous or
  -- missing active membership fails closed, rather than charging another family.
  select count(*), min(hm.household_id::text)::uuid into household_count, household
    from public.household_members hm where hm.user_id = caller and hm.status = 'active';
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
    values (day_start, caller, household, p_route, 1)
    on conflict (usage_day, user_id, household_id, route) do update
      set calls = public.ai_provider_call_usage.calls + 1;
  return jsonb_build_object('allowed', true);
end;
$$;
revoke all on function public.reserve_ai_provider_call(text) from public, anon;
grant execute on function public.reserve_ai_provider_call(text) to authenticated;
