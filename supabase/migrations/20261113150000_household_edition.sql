-- Household edition (2026-11-13): 'light' (new free iPhone accounts) or 'full'
-- (every household that existed before this). The edition lives on the
-- household, not the person, so everyone in it sees the same app.
--
-- 1. households.edition. Added as 'full' so every existing row is full, then
--    the default flips to 'light' so every new household is light.
-- 2. households_edition_guard: a signed-in client (JWT role authenticated or
--    anon) cannot choose or change the edition. It never raises: a client
--    that sends a stale edition along with another change still saves the
--    other change. With no JWT role (Postgres, service role, the dashboard)
--    the edition is writable, which is how Plus, or Scott by hand, flips one.
-- 3. my_edition(): 'full' when the caller is an active member of a full
--    household, otherwise 'light'. Authenticated only.
-- 4. reserve_ai_budget refuses a light household ('light_edition'). Same
--    signature; the body is 20261111120000's with one added check.

alter table public.households
  add column edition text not null default 'full' check (edition in ('light', 'full'));
alter table public.households alter column edition set default 'light';

create function public.guard_household_edition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.edition := 'light';
    else
      new.edition := old.edition;
    end if;
  end if;
  return new;
end $$;

create trigger households_edition_guard
  before insert or update on public.households
  for each row execute function public.guard_household_edition();

create function public.my_edition()
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1
    from public.household_members m
    join public.households h on h.id = m.household_id
    where m.user_id = auth.uid() and m.status = 'active' and h.edition = 'full'
  ) then 'full' else 'light' end
$$;

revoke all on function public.my_edition() from public, anon;
grant execute on function public.my_edition() to authenticated;

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

notify pgrst, 'reload schema';
