-- APPLIED to the shared project 2026-09-29 with Scott's approval
-- (verified: all households still Sunday, no week records moved).
-- Proof: supabase/tests/103_household_week_start.test.sql (as postgres and as
-- two `authenticated` household members, ends in ROLLBACK).
-- Rollback: supabase/migrations/rollback/2026-09-29_household_week_start.down.sql
-- Existing data (read-only count, 2026-09-29): all 83 week commitments start on
-- a Sunday, so re-anchoring cannot collide on (task_id, level, period_start).
--
-- WHY. Scott and Iris plan the week on Friday, so the week they plan runs
-- Saturday → Friday (2026-09-29). The week start was a per-browser setting
-- (Sunday or Monday) while the database stamped every week Sunday-first
-- (week_start_of, tasks_fill_period_stamps) — a Monday browser already
-- disagreed with its own rows. Week membership is by EXACT period_start, so the
-- start day must be one answer per household, and changing it must move the
-- household's weeks with it.
--
-- WHAT.
--   1. households.week_starts_on — 0 Sunday (default), 1 Monday, 6 Saturday.
--   2. household_week_start(user) and week_start_of(day, start); the three
--      writers that stamp a week (align-to-day, fill-period-stamps, sync from
--      commitments) now ask the task owner's household instead of assuming
--      Sunday. week_start_of(day) (Sunday) is kept for any other caller.
--   3. set_household_week_start(start) — owner only (the seasons rule). Sets the
--      day and, in the same transaction, re-anchors the household's week
--      records to the week each one mostly overlapped — the new week holding
--      the old week's middle day (start + 3), which round-trips exactly
--      (Sun 27 → Sat 26 → Sun 27): week commitments (every status, carried_to
--      too — history stays readable), the tasks' cached week_start, and the
--      weekly planning sessions' tokens. A dated task's open week then follows
--      its day (D1c.1), unless that would collide with another of its weeks.
--      Returns how many rows moved.

alter table public.households
  add column if not exists week_starts_on smallint not null default 0;
do $$ begin
  alter table public.households add constraint households_week_starts_on_check check (week_starts_on in (0, 1, 6));
exception when duplicate_object then null; end $$;

-- The start day of the household a user belongs to (Sunday when none).
create or replace function public.household_week_start(p_user uuid)
returns smallint
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((
    select h.week_starts_on
      from public.household_members hm
      join public.households h on h.id = hm.household_id
     where hm.user_id = p_user and hm.status = 'active'
     order by h.created_at
     limit 1), 0)::smallint;
$$;

-- The start of the week p_day falls in, for a week that begins on p_start.
create or replace function public.week_start_of(p_day date, p_start smallint)
returns date
language sql
immutable
as $$
  select p_day - ((extract(dow from p_day)::int - p_start + 7) % 7);
$$;

create or replace function public.tasks_align_week_to_day()
 returns trigger
 language plpgsql
as $function$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.scheduled_for is not null
     and (tg_op = 'INSERT' or new.scheduled_for is distinct from old.scheduled_for) then
    new.week_start := public.week_start_of((new.scheduled_for at time zone 'America/New_York')::date,
                                           public.household_week_start(new.user_id));
  end if;
  return new;
end;
$function$;

create or replace function public.tasks_fill_period_stamps()
 returns trigger
 language plpgsql
as $function$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  if new.bucket = 'week' and new.week_start is null then
    new.week_start := public.week_start_of(v_today, public.household_week_start(new.user_id));
  elsif new.bucket = 'month' and new.month_start is null then
    new.month_start := date_trunc('month', v_today)::date;
  elsif new.bucket = 'quarter' and new.season_start is null then
    new.season_start := public.season_start_for(new.user_id, v_today);
  end if;
  return new;
end;
$function$;

create or replace function public.tasks_sync_from_commitments(p_task uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_week date; v_month date; v_season date;
  v_task public.tasks%rowtype;
  v_bucket text;
begin
  select * into v_task from public.tasks where id = p_task;
  if not found then return; end if;

  select max(period_start) filter (where level = 'week'),
         max(period_start) filter (where level = 'month'),
         max(period_start) filter (where level = 'season')
    into v_week, v_month, v_season
  from public.task_commitments
  where task_id = p_task and status = 'open';

  -- A dated task's week is the week of its day (D1c.1: scheduling aligns the week).
  if v_task.scheduled_for is not null then
    v_week := public.week_start_of((v_task.scheduled_for at time zone 'America/New_York')::date,
                                   public.household_week_start(v_task.user_id));
    v_bucket := 'timed';
  elsif v_week is not null then v_bucket := 'week';
  elsif v_month is not null then v_bucket := 'month';
  elsif v_season is not null then v_bucket := 'quarter';
  -- No day, no open commitment: a period or 'timed' bucket has nothing to
  -- stand on and falls back to the inbox; inbox/someday are states and stay.
  else v_bucket := case when v_task.bucket in ('inbox', 'someday') then v_task.bucket else 'inbox' end;
  end if;

  update public.tasks
     set bucket = v_bucket, week_start = v_week, month_start = v_month, season_start = v_season
   where id = p_task
     and (bucket is distinct from v_bucket or week_start is distinct from v_week
          or month_start is distinct from v_month or season_start is distinct from v_season);
end;
$function$;

create or replace function public.set_household_week_start(p_start int)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_household uuid; v_owner uuid; v_old smallint; v_start smallint;
  v_moved int := 0; v_n int;
begin
  if p_start is null or p_start not in (0, 1, 6) then
    raise exception 'A week can start on Sunday (0), Monday (1) or Saturday (6).' using errcode = '22023';
  end if;
  v_start := p_start::smallint;

  select h.id, h.owner_id, h.week_starts_on into v_household, v_owner, v_old
    from public.household_members hm
    join public.households h on h.id = hm.household_id
   where hm.user_id = auth.uid() and hm.status = 'active'
   order by h.created_at
   limit 1;
  if v_household is null then
    raise exception 'You are not in a household.' using errcode = '42501';
  end if;
  if v_owner is distinct from auth.uid() then
    raise exception 'Only the household owner can change when the week starts.' using errcode = '42501';
  end if;
  if v_old = v_start then return 0; end if;

  -- The day first: the writers below re-stamp dated weeks by it.
  update public.households set week_starts_on = v_start where id = v_household;

  -- Week records of every task an active member owns, each to the new week
  -- holding its old week's middle day. A shift preserves the 7-day spacing,
  -- so one task's records cannot collide.
  update public.task_commitments c
     set period_start = public.week_start_of(c.period_start + 3, v_start),
         carried_to = case when c.carried_to is null then null else public.week_start_of(c.carried_to + 3, v_start) end
    from public.tasks t
   where t.id = c.task_id
     and c.level = 'week'
     and c.period_start <> public.week_start_of(c.period_start + 3, v_start)
     and t.user_id in (select user_id from public.household_members where household_id = v_household and status = 'active');
  get diagnostics v_n = row_count; v_moved := v_moved + v_n;

  -- A dated task's open week is the week of its day (a Saturday that ended
  -- the old week starts the new one) — skipped where another of its weeks
  -- already holds that start.
  update public.task_commitments c
     set period_start = public.week_start_of((t.scheduled_for at time zone 'America/New_York')::date, v_start)
    from public.tasks t
   where t.id = c.task_id
     and c.level = 'week' and c.status = 'open'
     and t.scheduled_for is not null
     and c.period_start <> public.week_start_of((t.scheduled_for at time zone 'America/New_York')::date, v_start)
     and not exists (select 1 from public.task_commitments d
                      where d.task_id = c.task_id and d.level = 'week'
                        and d.period_start = public.week_start_of((t.scheduled_for at time zone 'America/New_York')::date, v_start))
     and t.user_id in (select user_id from public.household_members where household_id = v_household and status = 'active');
  get diagnostics v_n = row_count; v_moved := v_moved + v_n;

  -- Cached week stamps the commitments trigger did not re-sync (a dated task
  -- with no week record, a legacy stamp): a day's week, else the middle rule.
  update public.tasks t
     set week_start = case when t.scheduled_for is not null
                           then public.week_start_of((t.scheduled_for at time zone 'America/New_York')::date, v_start)
                           else public.week_start_of(t.week_start + 3, v_start) end
   where t.week_start is not null
     and t.week_start is distinct from (case when t.scheduled_for is not null
                           then public.week_start_of((t.scheduled_for at time zone 'America/New_York')::date, v_start)
                           else public.week_start_of(t.week_start + 3, v_start) end)
     and t.user_id in (select user_id from public.household_members where household_id = v_household and status = 'active');
  get diagnostics v_n = row_count; v_moved := v_moved + v_n;

  -- An agreed week plan follows its week (tokens are 'Y-M-D' of the start).
  update public.planning_sessions s
     set period_token = to_char(public.week_start_of(to_date(s.period_token, 'YYYY-MM-DD') + 3, v_start), 'FMYYYY-FMMM-FMDD')
   where s.horizon = 'weekly'
     and s.period_token ~ '^\d{4}-\d{1,2}-\d{1,2}$'
     and to_date(s.period_token, 'YYYY-MM-DD') <> public.week_start_of(to_date(s.period_token, 'YYYY-MM-DD') + 3, v_start)
     and s.author_id in (select user_id from public.household_members where household_id = v_household and status = 'active');
  get diagnostics v_n = row_count; v_moved := v_moved + v_n;

  return v_moved;
end;
$$;

revoke all on function public.set_household_week_start(int) from public, anon;
grant execute on function public.set_household_week_start(int) to authenticated;
revoke all on function public.household_week_start(uuid) from public, anon;
grant execute on function public.household_week_start(uuid) to authenticated;
