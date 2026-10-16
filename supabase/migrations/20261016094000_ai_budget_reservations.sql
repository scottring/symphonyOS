-- Hold money before a paid request; settlement is service-authoritative.
create table public.ai_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, household_id uuid not null, route text not null, model text not null,
  usage_day date not null default ((clock_timestamp() at time zone 'UTC')::date),
  held_cents numeric not null check(held_cents >= 0),
  settled_at timestamptz,
  usage_id bigint unique references public.ai_spend(id)
);
alter table public.ai_budget_reservations enable row level security;
revoke all on public.ai_budget_reservations from public,anon,authenticated;

create or replace function public.reserve_ai_budget(p_user uuid,p_route text,p_model text,p_input bigint,p_output bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare hh uuid; policy public.ai_usage_configuration; family public.ai_household_allowances;
  day date := (clock_timestamp() at time zone 'UTC')::date; month date := date_trunc('month',day)::date;
  gd numeric;gm numeric;hd numeric;hm numeric; liability numeric;rid uuid; decision jsonb;
begin
  if p_user is null or p_input < 0 or p_output < 0 or p_input is null or p_output is null
    or p_input > 4000000 or p_output > 1000000
    or p_route is null or not(p_route=any(public.ai_guarded_routes()) or p_route=any(public.ai_background_routes())) then
    return jsonb_build_object('allowed',false,'reason','unavailable');
  end if;
  select * into policy from public.ai_usage_configuration where singleton for update;
  if not found or not policy.enabled then return jsonb_build_object('allowed',false,'reason','unavailable');end if;
  hh := public.ai_household_of(p_user);
  select * into family from public.ai_household_allowances where household_id=hh;
  if not found or not family.enabled then return jsonb_build_object('allowed',false,'reason','unavailable');end if;
  -- 2x input covers both ordinary text and the highest currently used cache-write rate.
  liability := public.ai_cents_for(p_model,p_input*2,p_output,0);
  if liability is null then return jsonb_build_object('allowed',false,'reason','unavailable');end if;
  select coalesce(sum(cents) filter(where usage_day=day),0),coalesce(sum(cents),0),
    coalesce(sum(cents) filter(where usage_day=day and household_id=hh),0),coalesce(sum(cents) filter(where household_id=hh),0)
    into gd,gm,hd,hm from (
      select usage_day,household_id,cents from public.ai_spend where usage_day between month and day
      union all select usage_day,household_id,held_cents from public.ai_budget_reservations where settled_at is null
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

create or replace function public.settle_ai_budget(p_id uuid,p_user uuid,p_input bigint,p_output bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.ai_budget_reservations; actual numeric; entry bigint;
begin
  -- Same lock ordering as reservation; settlement/replay cannot race admission.
  perform 1 from public.ai_usage_configuration where singleton for update;
  select * into r from public.ai_budget_reservations where id=p_id and user_id=p_user for update;
  if not found then return false;end if;
  if r.settled_at is not null then return true;end if;
  if p_input is null or p_output is null or p_input<0 or p_output<0 then return false;end if;
  actual:=public.ai_cents_for(r.model,p_input,p_output,0);
  if actual is null then return false;end if;
  insert into public.ai_spend(user_id,household_id,route,model,usage_day,input_tokens,output_tokens,cents)
    values(r.user_id,r.household_id,r.route,r.model,r.usage_day,p_input,p_output,actual) returning id into entry;
  update public.ai_budget_reservations set settled_at=clock_timestamp(),usage_id=entry where id=r.id;
  return true;
end;$$;
revoke all on function public.reserve_ai_budget(uuid,text,text,bigint,bigint),public.settle_ai_budget(uuid,uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.reserve_ai_budget(uuid,text,text,bigint,bigint),public.settle_ai_budget(uuid,uuid,bigint,bigint) to service_role;
-- Old clients cannot invent usage or bypass pending monetary reservations.
revoke all on function public.record_ai_usage(text,text,bigint,bigint,numeric),public.record_ai_usage_for(uuid,text,text,bigint,bigint,numeric),public.reserve_ai_provider_call(text,text),public.reserve_ai_provider_call_for(uuid,text,text) from public,anon,authenticated,service_role;
