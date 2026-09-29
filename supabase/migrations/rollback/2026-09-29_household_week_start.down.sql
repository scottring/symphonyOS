-- Rollback for 2026-09-29_household_week_start.sql. Run as postgres.
-- First moves every household that chose another start back to Sunday weeks
-- (the same re-anchor the switch does, done here without auth.uid()), then
-- restores the Sunday-only writers and drops the new column and functions.
begin;

do $$
declare h record;
begin
  for h in select id from public.households where week_starts_on <> 0 loop
    -- The switch's own rules, toward Sunday: the week holding the old middle
    -- day, then a dated open week follows its day.
    update public.task_commitments c
       set period_start = public.week_start_of(c.period_start + 3, 0::smallint),
           carried_to = case when c.carried_to is null then null else public.week_start_of(c.carried_to + 3, 0::smallint) end
      from public.tasks t
     where t.id = c.task_id and c.level = 'week'
       and c.period_start <> public.week_start_of(c.period_start + 3, 0::smallint)
       and t.user_id in (select user_id from public.household_members where household_id = h.id and status = 'active');
    update public.households set week_starts_on = 0 where id = h.id;
    update public.task_commitments c
       set period_start = public.week_start_of((t.scheduled_for at time zone 'America/New_York')::date, 0::smallint)
      from public.tasks t
     where t.id = c.task_id and c.level = 'week' and c.status = 'open' and t.scheduled_for is not null
       and c.period_start <> public.week_start_of((t.scheduled_for at time zone 'America/New_York')::date, 0::smallint)
       and not exists (select 1 from public.task_commitments d where d.task_id = c.task_id and d.level = 'week'
                        and d.period_start = public.week_start_of((t.scheduled_for at time zone 'America/New_York')::date, 0::smallint))
       and t.user_id in (select user_id from public.household_members where household_id = h.id and status = 'active');
    update public.tasks t
       set week_start = case when t.scheduled_for is not null
                             then public.week_start_of((t.scheduled_for at time zone 'America/New_York')::date, 0::smallint)
                             else public.week_start_of(t.week_start + 3, 0::smallint) end
     where t.week_start is not null
       and t.user_id in (select user_id from public.household_members where household_id = h.id and status = 'active');
    update public.planning_sessions s
       set period_token = to_char(public.week_start_of(to_date(s.period_token, 'YYYY-MM-DD') + 3, 0::smallint), 'FMYYYY-FMMM-FMDD')
     where s.horizon = 'weekly' and s.period_token ~ '^\d{4}-\d{1,2}-\d{1,2}$'
       and s.author_id in (select user_id from public.household_members where household_id = h.id and status = 'active');
  end loop;
end $$;

create or replace function public.tasks_align_week_to_day()
 returns trigger
 language plpgsql
as $function$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.scheduled_for is not null
     and (tg_op = 'INSERT' or new.scheduled_for is distinct from old.scheduled_for) then
    new.week_start := public.week_start_of((new.scheduled_for at time zone 'America/New_York')::date);
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
    new.week_start := v_today - extract(dow from v_today)::int;
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
    v_week := public.week_start_of((v_task.scheduled_for at time zone 'America/New_York')::date);
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

drop function if exists public.set_household_week_start(int);
drop function if exists public.household_week_start(uuid);
drop function if exists public.week_start_of(date, smallint);
alter table public.households drop constraint if exists households_week_starts_on_check;
alter table public.households drop column if exists week_starts_on;

commit;
