-- Shared, cross-device gate for the AI engine runs (proactive-engine,
-- email-scanner, kiosk-agent). Previously each device/tab gated itself via
-- localStorage, so N open clients ran the engine N times per interval —
-- multiplying the Anthropic/OpenAI bill. This moves the last-run timestamp into
-- a single shared row, claimed atomically, so exactly one client runs per
-- interval per (engine, user).

create table if not exists public.ai_engine_runs (
  key text primary key,           -- e.g. 'proactive-engine:<user_id>'
  last_run timestamptz not null default now()
);
alter table public.ai_engine_runs enable row level security;
-- No policies: the table is only touched by the security-definer function below.

-- Returns true to exactly one caller per interval (the one that claims the run),
-- false to everyone else. Atomic via INSERT ... ON CONFLICT DO UPDATE ... WHERE.
create or replace function public.claim_engine_run(p_key text, p_interval_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $func$
declare claimed boolean;
begin
  insert into public.ai_engine_runs(key, last_run)
  values (p_key, now())
  on conflict (key) do update set last_run = now()
    where public.ai_engine_runs.last_run < now() - make_interval(secs => p_interval_seconds)
  returning true into claimed;
  return coalesce(claimed, false);
end;
$func$;

grant execute on function public.claim_engine_run(text, int) to authenticated;
