-- Money, not only calls (beta readiness B03, 2026-10-15). The plan's trial
-- ceilings are dollars: $250/month globally, $20/month and $3/day per
-- household, as hypotheses. The call allowances stay; this adds a spend
-- ledger in cents, per-model prices an operator approves, and cent ceilings
-- the reservation functions check BEFORE each provider attempt. A call can
-- overshoot a ceiling by at most its own cost; the next one is refused.
--
-- Prices are seeded as PLACEHOLDERS at public list rates and disabled: an
-- operator confirms each row and enables it. Usage of a model with no enabled
-- price is recorded with cents = null and counted as UNPRICED; when the global
-- configuration says `refuse_unpriced`, such a model cannot be called at all.

create table public.ai_model_prices (
  model text primary key,
  -- Cents per million tokens; realtime audio is priced per minute instead.
  input_cents_per_million numeric(12, 4),
  output_cents_per_million numeric(12, 4),
  cents_per_minute numeric(12, 4),
  enabled boolean not null default false,
  note text
);
insert into public.ai_model_prices (model, input_cents_per_million, output_cents_per_million, cents_per_minute, note) values
  ('claude-opus-5-5', 400, 2000, null, 'verified 2026-10-15: platform.claude.com/docs/en/about-claude/pricing'),
  ('claude-sonnet-4-6', 300, 1500, null, 'verified 2026-10-15: platform.claude.com/docs/en/about-claude/pricing'),
  ('claude-haiku-4-5', 100, 500, null, 'verified 2026-10-15: platform.claude.com/docs/en/about-claude/pricing'),
  ('gpt-4o-mini', 15, 60, null, 'verified 2026-10-15: developers.openai.com/api/docs/pricing'),
  ('gpt-4o', 250, 1000, null, 'verified 2026-10-15: developers.openai.com/api/docs/pricing'),
  ('text-embedding-3-small', 2, 0, null, 'verified 2026-10-15: developers.openai.com/api/docs/pricing'),
  ('gpt-4o-mini-tts', 1500, 0, null, 'ESTIMATE 2026-10-15: provider text in $0.60/M tokens + audio out $12/M tokens; recorded per million CHARACTERS spoken (wall-say); ~$0.015 per minute of speech'),
  ('gpt-realtime-2.1', null, null, 600, 'ESTIMATE 2026-10-15: provider lists gpt-realtime audio $32/M in, $64/M out per token and no per-minute rate; 600c/min is a conservative guess until measured'),
  ('gpt-realtime', null, null, 600, 'ESTIMATE 2026-10-15: same basis as gpt-realtime-2.1');

alter table public.ai_usage_configuration
  add column daily_cents bigint check (daily_cents > 0),
  add column monthly_cents bigint check (monthly_cents > 0),
  -- When true, a model with no enabled price cannot be called.
  add column refuse_unpriced boolean not null default false;
alter table public.ai_household_allowances
  add column daily_cents bigint check (daily_cents > 0),
  add column monthly_cents bigint check (monthly_cents > 0);

-- Append-only. No prompts or words: counts and money only.
create table public.ai_spend (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  usage_day date not null default ((clock_timestamp() at time zone 'UTC')::date),
  user_id uuid not null,
  household_id uuid not null,
  route text not null,
  model text not null,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  minutes numeric(10, 3) not null default 0 check (minutes >= 0),
  -- Null when the model had no enabled price at the time.
  cents numeric(14, 4)
);
create index ai_spend_household_day_idx on public.ai_spend (household_id, usage_day);
create index ai_spend_day_idx on public.ai_spend (usage_day);
alter table public.ai_model_prices enable row level security;
alter table public.ai_spend enable row level security;
revoke all on public.ai_model_prices, public.ai_spend from public, anon, authenticated;

-- Cents for a usage, by the enabled price; null when unpriced.
create or replace function public.ai_cents_for(p_model text, p_input bigint, p_output bigint, p_minutes numeric)
returns numeric language sql stable set search_path = '' as $$
  select case when p.model is null then null
    else coalesce(p.input_cents_per_million, 0) * p_input / 1000000.0
       + coalesce(p.output_cents_per_million, 0) * p_output / 1000000.0
       + coalesce(p.cents_per_minute, 0) * p_minutes end
  from (select 1) one
  left join public.ai_model_prices p on p.model = p_model and p.enabled
$$;

-- The household of a user, or null when ambiguous (same rule as the reservation).
create or replace function public.ai_household_of(p_user uuid)
returns uuid language sql stable set search_path = '' as $$
  select case when count(*) = 1 then min(household_id::text)::uuid end
  from public.household_members where user_id = p_user and status = 'active'
$$;

-- Spend so far in cents: global/household, day/month. Unpriced rows count 0.
create or replace function public.ai_spent_cents(p_household uuid, p_day date, p_month date)
returns table (global_day numeric, global_month numeric, family_day numeric, family_month numeric)
language sql stable set search_path = '' as $$
  select coalesce(sum(cents) filter (where usage_day = p_day), 0),
         coalesce(sum(cents), 0),
         coalesce(sum(cents) filter (where usage_day = p_day and household_id = p_household), 0),
         coalesce(sum(cents) filter (where household_id = p_household), 0)
  from public.ai_spend where usage_day >= p_month and usage_day <= p_day
$$;

-- Record one provider usage. A signed-in caller records only its own.
create or replace function public.record_ai_usage(p_route text, p_model text, p_input bigint, p_output bigint, p_minutes numeric default 0)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); hh uuid;
begin
  if me is null then return; end if;
  hh := public.ai_household_of(me);
  if hh is null then return; end if;
  insert into public.ai_spend (user_id, household_id, route, model, input_tokens, output_tokens, minutes, cents)
  values (me, hh, left(coalesce(p_route, ''), 64), left(coalesce(p_model, ''), 80), greatest(coalesce(p_input, 0), 0), greatest(coalesce(p_output, 0), 0), greatest(coalesce(p_minutes, 0), 0),
          public.ai_cents_for(p_model, greatest(coalesce(p_input, 0), 0), greatest(coalesce(p_output, 0), 0), greatest(coalesce(p_minutes, 0), 0)));
end $$;
revoke all on function public.record_ai_usage(text, text, bigint, bigint, numeric) from public, anon;
grant execute on function public.record_ai_usage(text, text, bigint, bigint, numeric) to authenticated, service_role;

-- A worker records for the person it works for; service role only.
create or replace function public.record_ai_usage_for(p_user uuid, p_route text, p_model text, p_input bigint, p_output bigint, p_minutes numeric default 0)
returns void language plpgsql security definer set search_path = '' as $$
declare hh uuid;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_setting('request.jwt.claim.role', true), '') <> 'service_role' then return; end if;
  if p_user is null then return; end if;
  hh := public.ai_household_of(p_user);
  if hh is null then return; end if;
  insert into public.ai_spend (user_id, household_id, route, model, input_tokens, output_tokens, minutes, cents)
  values (p_user, hh, left(coalesce(p_route, ''), 64), left(coalesce(p_model, ''), 80), greatest(coalesce(p_input, 0), 0), greatest(coalesce(p_output, 0), 0), greatest(coalesce(p_minutes, 0), 0),
          public.ai_cents_for(p_model, greatest(coalesce(p_input, 0), 0), greatest(coalesce(p_output, 0), 0), greatest(coalesce(p_minutes, 0), 0)));
end $$;
revoke all on function public.record_ai_usage_for(uuid, text, text, bigint, bigint, numeric) from public, anon, authenticated;
grant execute on function public.record_ai_usage_for(uuid, text, text, bigint, bigint, numeric) to service_role;

-- The cent check both reservation functions run after their call checks.
-- Returns null when allowed, else the refusal object. Optional p_model lets a
-- caller be refused up front for an unpriced model when the operator asks.
create or replace function public.ai_cents_refusal(p_household uuid, p_global public.ai_usage_configuration, p_family public.ai_household_allowances, p_day date, p_month date, p_model text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare s record;
begin
  if p_global.refuse_unpriced and p_model is not null
     and not exists (select 1 from public.ai_model_prices where model = p_model and enabled) then
    return jsonb_build_object('allowed', false, 'reason', 'unavailable', 'detail', 'unpriced_model');
  end if;
  if p_global.daily_cents is null and p_global.monthly_cents is null and p_family.daily_cents is null and p_family.monthly_cents is null then return null; end if;
  select * into s from public.ai_spent_cents(p_household, p_day, p_month);
  if (p_global.monthly_cents is not null and s.global_month >= p_global.monthly_cents)
     or (p_family.monthly_cents is not null and s.family_month >= p_family.monthly_cents) then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_limit', 'retry_at', (p_month + interval '1 month') at time zone 'UTC');
  end if;
  if (p_global.daily_cents is not null and s.global_day >= p_global.daily_cents)
     or (p_family.daily_cents is not null and s.family_day >= p_family.daily_cents) then
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'retry_at', (p_day + interval '1 day') at time zone 'UTC');
  end if;
  return null;
end $$;

-- Re-create both reservation functions with the cent check and an optional
-- model argument. Existing callers (one argument) keep working.
drop function if exists public.reserve_ai_provider_call(text);
create or replace function public.reserve_ai_provider_call(p_route text, p_model text default null)
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
  refusal jsonb;
begin
  if caller is null then return jsonb_build_object('allowed', false, 'reason', 'unavailable'); end if;
  if p_route is null or p_route <> all (public.ai_guarded_routes()) then
    return jsonb_build_object('allowed', false, 'reason', 'unavailable');
  end if;
  select * into global_policy from public.ai_usage_configuration where singleton for update;
  if not found or not global_policy.enabled or global_policy.daily_calls is null or global_policy.monthly_calls is null then
    return jsonb_build_object('allowed', false, 'reason', 'unavailable');
  end if;
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
    return jsonb_build_object('allowed', false, 'reason', 'monthly_limit', 'retry_at', (month_start + interval '1 month') at time zone 'UTC');
  end if;
  if global_day >= global_policy.daily_calls or family_day >= family_policy.daily_calls then
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'retry_at', (day_start + interval '1 day') at time zone 'UTC');
  end if;
  refusal := public.ai_cents_refusal(household, global_policy, family_policy, day_start, month_start, p_model);
  if refusal is not null then return refusal; end if;
  insert into public.ai_provider_call_usage (usage_day, user_id, household_id, route, calls)
    values (day_start, caller, household, p_route, 1)
    on conflict (usage_day, user_id, household_id, route) do update
      set calls = public.ai_provider_call_usage.calls + 1;
  return jsonb_build_object('allowed', true);
end;
$$;
revoke all on function public.reserve_ai_provider_call(text, text) from public, anon;
grant execute on function public.reserve_ai_provider_call(text, text) to authenticated;

drop function if exists public.reserve_ai_provider_call_for(uuid, text);
create or replace function public.reserve_ai_provider_call_for(p_user uuid, p_route text, p_model text default null)
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
  refusal jsonb;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
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
    return jsonb_build_object('allowed', false, 'reason', 'monthly_limit', 'retry_at', (month_start + interval '1 month') at time zone 'UTC');
  end if;
  if global_day >= global_policy.daily_calls or family_day >= family_policy.daily_calls then
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'retry_at', (day_start + interval '1 day') at time zone 'UTC');
  end if;
  refusal := public.ai_cents_refusal(household, global_policy, family_policy, day_start, month_start, p_model);
  if refusal is not null then return refusal; end if;
  insert into public.ai_provider_call_usage (usage_day, user_id, household_id, route, calls)
    values (day_start, p_user, household, p_route, 1)
    on conflict (usage_day, user_id, household_id, route) do update
      set calls = public.ai_provider_call_usage.calls + 1;
  return jsonb_build_object('allowed', true);
end;
$$;
revoke all on function public.reserve_ai_provider_call_for(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_ai_provider_call_for(uuid, text, text) to service_role;
