-- Rollback for 20261117090000_light_walk_suggestions.sql. Restores
-- reserve_ai_budget and ai_guarded_routes as they were (20261113150000 and
-- 20261024120000), drops ai_light_routes, and switches the Haiku 5.5 price off.

create or replace function public.reserve_ai_budget(p_user uuid,p_route text,p_model text,p_input bigint,p_output bigint,
  p_minutes numeric default 0,p_input_multiplier numeric default 2)
returns jsonb language plpgsql security definer set search_path='' as $$
declare hh uuid; households integer; policy public.ai_usage_configuration; family public.ai_household_allowances;
  day date := (clock_timestamp() at time zone 'UTC')::date; month date := date_trunc('month',day)::date;
  gd numeric;gm numeric;hd numeric;hm numeric; liability numeric;rid uuid;
begin
  if p_user is null or p_input < 0 or p_output < 0 or p_input is null or p_output is null
    or p_input > 4000000 or p_output > 1000000
    or p_minutes is null or p_minutes < 0 or p_minutes > 60
    or p_input_multiplier is null or p_input_multiplier < 1 or p_input_multiplier > 2
    or p_route is null or not(p_route=any(public.ai_guarded_routes()) or p_route=any(public.ai_background_routes())) then
    return jsonb_build_object('allowed',false,'reason','unavailable');
  end if;
  select * into policy from public.ai_usage_configuration where singleton for update;
  if not found or not policy.enabled then return jsonb_build_object('allowed',false,'reason','unavailable');end if;
  select count(*) into households from public.household_members where user_id=p_user and status='active';
  if households=0 then return jsonb_build_object('allowed',false,'reason','no_household');end if;
  hh := public.ai_household_of(p_user);
  if (select h.edition from public.households h where h.id = hh) = 'light' then
    return jsonb_build_object('allowed', false, 'reason', 'light_edition');
  end if;
  select * into family from public.ai_household_allowances where household_id=hh;
  if not found or not family.enabled then return jsonb_build_object('allowed',false,'reason','unavailable');end if;
  liability := public.ai_cents_for(p_model,ceil(p_input*p_input_multiplier)::bigint,p_output,p_minutes);
  if liability is null or (liability<=0 and (p_input>0 or p_output>0 or p_minutes>0)) then
    return jsonb_build_object('allowed',false,'reason','unavailable');end if;
  select coalesce(sum(cents) filter(where usage_day=day),0),coalesce(sum(cents),0),
    coalesce(sum(cents) filter(where usage_day=day and household_id=hh),0),coalesce(sum(cents) filter(where household_id=hh),0)
    into gd,gm,hd,hm from (
      select usage_day,household_id,cents from public.ai_spend where usage_day between month and day
      union all select usage_day,household_id,held_cents from public.ai_budget_reservations where settled_at is null and usage_day between month and day
    ) liability_rows;
  if (policy.monthly_cents is not null and gm+liability>policy.monthly_cents) or (family.monthly_cents is not null and hm+liability>family.monthly_cents) then
    return jsonb_build_object('allowed',false,'reason','monthly_limit','retry_at',(month+interval '1 month') at time zone 'UTC');end if;
  if (policy.daily_cents is not null and gd+liability>policy.daily_cents) or (family.daily_cents is not null and hd+liability>family.daily_cents) then
    return jsonb_build_object('allowed',false,'reason','daily_limit','retry_at',(day+interval '1 day') at time zone 'UTC');end if;
  if policy.daily_calls is null or policy.monthly_calls is null or family.daily_calls is null or family.monthly_calls is null then
    return jsonb_build_object('allowed',false,'reason','unavailable');end if;
  select coalesce(sum(calls) filter(where usage_day=day),0),coalesce(sum(calls),0),
    coalesce(sum(calls) filter(where usage_day=day and household_id=hh),0),coalesce(sum(calls) filter(where household_id=hh),0)
    into gd,gm,hd,hm from public.ai_provider_call_usage where usage_day between month and day;
  if gm>=policy.monthly_calls or hm>=family.monthly_calls then return jsonb_build_object('allowed',false,'reason','monthly_limit');end if;
  if gd>=policy.daily_calls or hd>=family.daily_calls then return jsonb_build_object('allowed',false,'reason','daily_limit');end if;
  insert into public.ai_provider_call_usage(usage_day,user_id,household_id,route,calls) values(day,p_user,hh,p_route,1)
    on conflict(usage_day,user_id,household_id,route) do update set calls=public.ai_provider_call_usage.calls+1;
  insert into public.ai_budget_reservations(user_id,household_id,route,model,held_cents) values(p_user,hh,p_route,p_model,liability) returning id into rid;
  return jsonb_build_object('allowed',true,'reservation_id',rid);
end;$$;
revoke all on function public.reserve_ai_budget(uuid,text,text,bigint,bigint,numeric,numeric) from public,anon,authenticated;
grant execute on function public.reserve_ai_budget(uuid,text,text,bigint,bigint,numeric,numeric) to service_role;


drop function if exists public.ai_light_routes();

create or replace function public.ai_guarded_routes()
returns text[] language sql immutable as $$
  select array[
    'symphony-agent', 'workspace-voice', 'wall-ask', 'wall-say',
    'analyze-attachment', 'analyze-capture', 'analyze-link', 'extract-capture', 'parse-page', 'plan-from-paper', 'routine-from-doc',
    'goal-planning-chat', 'planning-conversation', 'tend-week', 'sharpen-goal', 'suggest-waiting-for', 'rhythms-parse',
    'kiosk-agent', 'math-story', 'meal-planner-chat', 'meal-slot-suggest', 'semantic-search', 'note-match',
    'question-ideas'
  ]
$$;

update public.ai_model_prices set enabled = false where model = 'claude-haiku-5-5';

notify pgrst, 'reload schema';
