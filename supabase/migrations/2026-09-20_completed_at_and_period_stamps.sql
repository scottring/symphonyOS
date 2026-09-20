-- Batch A, group 6 (2026-09-20): two integrity gaps the first real-data
-- walkthrough and its outside review named.
--
-- 1. tasks.completed_at — "nothing records when a task was completed"
--    undermined every look-back. Nullable; written by every completion writer
--    (app toggle, triage verdicts, MCP, agent); cleared on reopen. Legacy
--    completed rows stay NULL = "unknown" — never guessed.
--
-- 2. Period stamps filled at the source. As of this date, in production:
--    month rows unstamped 75/77 · season 19/21 · week 25/71 (dry-run below).
--    Readers treat a NULL stamp as "the current period", so an unstamped row
--    never leaves "this month". A BEFORE trigger fills the stamp whenever a
--    row is INSERTED into, or MOVED into, a period bucket with no stamp —
--    covering every writer at once (app, MCP, agent queue, capture function,
--    wall, paper import, iOS) instead of patching each. The app keeps
--    stamping first; the trigger only fills NULL.
--
--    NOT backfilled: without movement history, "created within the period"
--    is not evidence of the intended period (review, 2026-09-20). The
--    report query at the end lists the ambiguous rows for a person.

alter table public.tasks
  add column if not exists completed_at timestamptz;

comment on column public.tasks.completed_at is
  'When the task was ticked done. NULL on open rows and on rows completed before 2026-09-20 (unknown, never guessed).';

-- Season start for a date, from the household''s configured seasons
-- (households.seasons jsonb: [{name, month, day} x4]) or the default four.
create or replace function public.season_start_for(p_user uuid, p_date date)
returns date
language plpgsql
stable
as $$
declare
  v_seasons jsonb;
  v_year int := extract(year from p_date)::int;
  v_best date := null;
  v_candidate date;
  v_b jsonb;
begin
  select h.seasons into v_seasons
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = p_user
  limit 1;

  if v_seasons is null or jsonb_typeof(v_seasons) <> 'array' or jsonb_array_length(v_seasons) <> 4 then
    v_seasons := '[{"name":"Spring","month":3,"day":1},{"name":"Summer","month":6,"day":1},{"name":"Fall","month":9,"day":1},{"name":"Winter","month":12,"day":1}]'::jsonb;
  end if;

  -- The latest boundary on or before the date, looking at this year and last
  -- (a January date belongs to the season that began in December).
  for v_b in select * from jsonb_array_elements(v_seasons) loop
    foreach v_candidate in array array[
      make_date(v_year, (v_b->>'month')::int, least((v_b->>'day')::int, extract(day from (date_trunc('month', make_date(v_year, (v_b->>'month')::int, 1)) + interval '1 month - 1 day'))::int)),
      make_date(v_year - 1, (v_b->>'month')::int, least((v_b->>'day')::int, extract(day from (date_trunc('month', make_date(v_year - 1, (v_b->>'month')::int, 1)) + interval '1 month - 1 day'))::int))
    ] loop
      if v_candidate <= p_date and (v_best is null or v_candidate > v_best) then
        v_best := v_candidate;
      end if;
    end loop;
  end loop;

  return v_best;
end;
$$;

-- Fill the one period stamp a bucket implies, only when it is missing.
-- Week anchors on Sunday (the app''s default cadence; a device with a
-- different week start stamps week_start itself before this runs).
create or replace function public.tasks_fill_period_stamps()
returns trigger
language plpgsql
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  if new.bucket = 'week' and new.week_start is null then
    new.week_start := v_today - extract(dow from v_today)::int;
  elsif new.bucket = 'month' and new.month_start is null then
    new.month_start := date_trunc('month', v_today)::date;
  elsif new.bucket = 'quarter' and new.season_start is null then
    new.season_start := public.season_start_for(new.user_id, v_today);
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_fill_period_stamps on public.tasks;
create trigger tasks_fill_period_stamps
  before insert or update of bucket on public.tasks
  for each row execute function public.tasks_fill_period_stamps();

-- ── Dry-run report (read-only; run by hand, resolve by hand) ──────────────
-- select id, title, bucket, created_at::date as created, source_id is not null as has_lineage, completed
-- from public.tasks
-- where (bucket = 'week' and week_start is null)
--    or (bucket = 'month' and month_start is null)
--    or (bucket = 'quarter' and season_start is null)
-- order by bucket, created_at;
