-- New households get an allowance automatically (beta readiness B03,
-- 2026-10-15). The bench's fresh synthetic household had no
-- ai_household_allowances row and every AI route refused it with "usage
-- controls are not ready". The operator sets defaults once on the global
-- configuration; a trigger copies them to each new household. Null defaults
-- mean new households stay closed until an operator adds a row, as before.

alter table public.ai_usage_configuration
  add column if not exists default_daily_calls bigint check (default_daily_calls > 0),
  add column if not exists default_monthly_calls bigint check (default_monthly_calls > 0),
  add column if not exists default_daily_cents bigint check (default_daily_cents > 0),
  add column if not exists default_monthly_cents bigint check (default_monthly_cents > 0);

create or replace function public.ai_household_allowance_default()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cfg public.ai_usage_configuration%rowtype;
begin
  select * into cfg from public.ai_usage_configuration where singleton;
  if cfg.default_daily_calls is null or cfg.default_monthly_calls is null then return new; end if;
  insert into public.ai_household_allowances (household_id, enabled, daily_calls, monthly_calls, daily_cents, monthly_cents)
  values (new.id, true, cfg.default_daily_calls, cfg.default_monthly_calls, cfg.default_daily_cents, cfg.default_monthly_cents)
  on conflict (household_id) do nothing;
  return new;
end $$;
drop trigger if exists ai_household_allowance_default on public.households;
create trigger ai_household_allowance_default after insert on public.households
  for each row execute function public.ai_household_allowance_default();
