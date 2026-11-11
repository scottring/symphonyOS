-- AI spend guard fixes (2026-11-11). Replaces reserve_ai_budget and
-- settle_ai_budget from 20261016094000 with:
--
-- 1. Realtime minutes. Per-minute models (gpt-realtime*) were held and
--    settled at minutes = 0, i.e. nothing, so the guard refused them outright.
--    p_minutes (0–60) now reaches the price.
-- 2. The cache-write multiplier as the caller's request states it. The hold
--    was always input x 2 (the one-hour cache-write rate), but every cached
--    caller writes five-minute entries (1.25x) and uncached ones pay 1x. On
--    2026-10-31 a household with 73¢ of its $3 day left was refused an
--    assistant turn that would have cost about 10¢. p_input_multiplier is
--    clamped to 1–2 and defaults to the old 2, so callers that do not send it
--    reserve exactly as before.
-- 3. A distinct reason when the person belongs to no household
--    ('no_household'), instead of 'unavailable' ("usage controls are not
--    ready"), which is what a household-less account was told on 2026-10-23
--    and 2026-11-01. More than one household stays 'unavailable'.
-- 4. Unsettled holds count only in the day and month they were made, like
--    settled spend. They counted against every later month's total before.
-- 5. A positive request that prices at zero (e.g. minutes for a model with no
--    per-minute rate) is refused rather than admitted for free.
--
-- Both functions keep their names and their first arguments, so callers that
-- send the old argument lists keep working. Edge functions from 2026-11-11 on
-- send the new arguments and fall back to the old list if this migration is
-- not yet applied (per-minute audio stays refused until it is).

drop function if exists public.reserve_ai_budget(uuid,text,text,bigint,bigint);
create function public.reserve_ai_budget(p_user uuid,p_route text,p_model text,p_input bigint,p_output bigint,
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

drop function if exists public.settle_ai_budget(uuid,uuid,bigint,bigint);
create function public.settle_ai_budget(p_id uuid,p_user uuid,p_input bigint,p_output bigint,p_minutes numeric default 0)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.ai_budget_reservations; actual numeric; entry bigint;
begin
  -- Same lock ordering as reservation; settlement/replay cannot race admission.
  perform 1 from public.ai_usage_configuration where singleton for update;
  select * into r from public.ai_budget_reservations where id=p_id and user_id=p_user for update;
  if not found then return false;end if;
  if r.settled_at is not null then return true;end if;
  if p_input is null or p_output is null or p_minutes is null or p_input<0 or p_output<0 or p_minutes<0 or p_minutes>60 then return false;end if;
  actual:=public.ai_cents_for(r.model,p_input,p_output,p_minutes);
  if actual is null then return false;end if;
  insert into public.ai_spend(user_id,household_id,route,model,usage_day,input_tokens,output_tokens,minutes,cents)
    values(r.user_id,r.household_id,r.route,r.model,r.usage_day,p_input,p_output,p_minutes,actual) returning id into entry;
  update public.ai_budget_reservations set settled_at=clock_timestamp(),usage_id=entry where id=r.id;
  return true;
end;$$;

revoke all on function public.reserve_ai_budget(uuid,text,text,bigint,bigint,numeric,numeric),public.settle_ai_budget(uuid,uuid,bigint,bigint,numeric) from public,anon,authenticated;
grant execute on function public.reserve_ai_budget(uuid,text,text,bigint,bigint,numeric,numeric),public.settle_ai_budget(uuid,uuid,bigint,bigint,numeric) to service_role;

notify pgrst, 'reload schema';
