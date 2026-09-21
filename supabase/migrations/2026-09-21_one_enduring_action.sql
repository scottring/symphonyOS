-- One enduring action (D1, decided 2026-09-20 evening).
--
-- A task is ONE row for its whole life. Taking it from a season into a month,
-- a month into a week, a week onto a day never creates another task; "Keep"
-- into the next period keeps the same id. What used to be a copy is now a
-- supporting record on the one row:
--
--   task_commitments       "committed for a period" — season / month / week rows,
--                          each with its own status, so a September look-back
--                          reads September's row and October reads October's.
--   task_focus             "chosen for my day" — per PERSON, task and date. One
--                          adult's choice never overwrites the other's, and a
--                          choice never moves the task's date.
--   task_placement_events  append-only history: committed, carried, scheduled,
--                          rescheduled… so "was Wed · now Fri" and "Carried to
--                          October" are read from the record, not inferred.
--   task_aliases           ids retired by the chain fold (2026-09-21_fold_source_chains)
--                          resolve to the enduring row, so notes, attachments,
--                          threads and wall instance rows keep working.
--
-- tasks.bucket / week_start / month_start / season_start stay as a CACHE of the
-- lowest open commitment (see sync triggers) so the readers that still test
-- `bucket === 'week'` keep working while they move behind one selector set.
-- tasks.planned_on stays for routines' twin on actionable_instances and for
-- older clients; the app reads task_focus.
--
-- Nothing here deletes or rewrites a task. The backfill adds commitment rows
-- for every STAMPED period row and focus rows for every planned_on; unstamped
-- legacy rows are left exactly as they are (the NULL rule still applies to them
-- until a person resolves them — see the 2026-09-20 migration's report query).

begin;

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.task_commitments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  level         text not null check (level in ('season', 'month', 'week')),
  period_start  date not null,
  status        text not null default 'open' check (status in ('open', 'done', 'carried', 'removed')),
  carried_to    date,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  ended_at      timestamptz,
  unique (task_id, level, period_start)
);

comment on table public.task_commitments is
  'A period the task is committed to. One row per (task, level, period). Season/month/week each keep their own status so every look-back reads its own record. Keep into a later period = this row carried + a new open row on the SAME task.';
comment on column public.task_commitments.carried_to is
  'When status = carried: the period_start of the commitment it was carried into ("→ Carried to October").';

create index if not exists task_commitments_task_idx on public.task_commitments (task_id);
create index if not exists task_commitments_open_period_idx
  on public.task_commitments (level, period_start) where status = 'open';

create table if not exists public.task_focus (
  task_id     uuid not null references public.tasks(id) on delete cascade,
  user_id     uuid not null,
  date        date not null,
  created_at  timestamptz not null default now(),
  primary key (task_id, user_id, date)
);

comment on table public.task_focus is
  'This person chose this task for this day. Personal: one row per person. Never changes scheduled_for; a focus day may differ from the scheduled day and the row shows both.';

create index if not exists task_focus_user_date_idx on public.task_focus (user_id, date);

create table if not exists public.task_placement_events (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks(id) on delete cascade,
  at          timestamptz not null default now(),
  by          uuid,
  kind        text not null check (kind in (
                'committed', 'removed', 'carried', 'done',
                'scheduled', 'rescheduled', 'unscheduled',
                'completed', 'reopened', 'folded')),
  from_value  jsonb,
  to_value    jsonb
);

comment on table public.task_placement_events is
  'Append-only. Every commitment and schedule change on a task, so history is read from the record ("was Wed · now Fri"), never inferred from surviving rows.';

create index if not exists task_placement_events_task_at_idx on public.task_placement_events (task_id, at desc);

create table if not exists public.task_aliases (
  old_id      uuid primary key,
  task_id     uuid not null references public.tasks(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now()
);

comment on table public.task_aliases is
  'A retired task id → the enduring row it was folded into. Readers that hold an old id (notes, attachments, discussion threads, actionable_instances, undo) resolve through here.';

create index if not exists task_aliases_task_idx on public.task_aliases (task_id);

-- ── RLS: each child restates the parent task's own rule ──────────────────────
-- tasks: read/update/delete = owner OR (scope in couple/compound AND same household).
-- Verified against pg_policies on 2026-09-20. Restated here (the attachments
-- pattern, 2026-08-03) rather than assumed. auth.uid() is wrapped in a SELECT so
-- it is evaluated once per query, not per row.

create or replace function public.task_reachable(p_task uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task
      and (
        t.user_id = (select auth.uid())
        or (t.scope in ('couple', 'compound') and public.users_share_household((select auth.uid()), t.user_id))
      )
  );
$$;

comment on function public.task_reachable(uuid) is
  'The tasks SELECT/UPDATE rule, restated for child tables. SECURITY INVOKER: it reads tasks under the caller''s own RLS as well.';

alter table public.task_commitments enable row level security;
alter table public.task_focus enable row level security;
alter table public.task_placement_events enable row level security;
alter table public.task_aliases enable row level security;

drop policy if exists "commitments follow the task" on public.task_commitments;
create policy "commitments follow the task" on public.task_commitments
  for all to authenticated
  using (public.task_reachable(task_id))
  with check (public.task_reachable(task_id));

-- Focus is personal: readable by anyone who can see the task (so the pin can
-- show "Iris chose this"), writable only as yourself.
drop policy if exists "focus readable with the task" on public.task_focus;
create policy "focus readable with the task" on public.task_focus
  for select to authenticated
  using (public.task_reachable(task_id));

drop policy if exists "focus is your own" on public.task_focus;
create policy "focus is your own" on public.task_focus
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.task_reachable(task_id));

drop policy if exists "unfocus is your own" on public.task_focus;
create policy "unfocus is your own" on public.task_focus
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "events follow the task" on public.task_placement_events;
create policy "events follow the task" on public.task_placement_events
  for select to authenticated
  using (public.task_reachable(task_id));

-- Events are written by triggers only (see below); no direct insert policy.

drop policy if exists "aliases follow the task" on public.task_aliases;
create policy "aliases follow the task" on public.task_aliases
  for select to authenticated
  using (public.task_reachable(task_id));

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- The week that contains a day. Sunday-anchored, matching tasks_fill_period_stamps.
create or replace function public.week_start_of(p_day date)
returns date
language sql
immutable
as $$
  select p_day - extract(dow from p_day)::int;
$$;

create or replace function public.log_placement_event(
  p_task uuid, p_kind text, p_from jsonb, p_to jsonb
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.task_placement_events (task_id, by, kind, from_value, to_value)
  values (p_task, auth.uid(), p_kind, p_from, p_to);
$$;

revoke execute on function public.log_placement_event(uuid, text, jsonb, jsonb) from public, anon, authenticated;

-- ── Sync: commitments → tasks cache ──────────────────────────────────────────
-- The task row's bucket + stamps mirror its lowest OPEN commitment. A scheduled
-- task (scheduled_for set) keeps bucket = 'timed' but still carries its week.
-- inbox / someday are states, not commitments: a task with no open commitment
-- and no date keeps whatever bucket it has.

create or replace function public.tasks_sync_from_commitments(p_task uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.task_commitments_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- Fired by another trigger (the tasks-side mirror): the cache is already right.
  if pg_trigger_depth() > 1 then return null; end if;
  r := coalesce(new, old);
  -- A cascade from a deleted task: there is no row to log against or sync.
  if tg_op = 'DELETE' and not exists (select 1 from public.tasks t where t.id = r.task_id) then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform public.log_placement_event(r.task_id, 'committed', null,
      jsonb_build_object('level', r.level, 'period_start', r.period_start));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.log_placement_event(r.task_id,
      case new.status when 'carried' then 'carried' when 'done' then 'done' when 'removed' then 'removed' else 'committed' end,
      jsonb_build_object('level', old.level, 'period_start', old.period_start, 'status', old.status),
      jsonb_build_object('level', new.level, 'period_start', new.period_start, 'status', new.status, 'carried_to', new.carried_to));
  elsif tg_op = 'DELETE' then
    perform public.log_placement_event(r.task_id, 'removed',
      jsonb_build_object('level', r.level, 'period_start', r.period_start), null);
  end if;
  perform public.tasks_sync_from_commitments(r.task_id);
  return null;
end;
$$;

drop trigger if exists task_commitments_after_change on public.task_commitments;
create trigger task_commitments_after_change
  after insert or update or delete on public.task_commitments
  for each row execute function public.task_commitments_after_change();

-- ── Mirror: direct writes to tasks → commitments ─────────────────────────────
-- Writers that never learn the new model (MCP, agent queue, capture function,
-- the wall, iOS) still insert a row with a bucket, or move one by rewriting
-- bucket. Each such write ADDS the matching open commitment; it never removes
-- one (removal is an explicit intention, app-only). Schedule changes are logged.
-- Runs only at depth 1, i.e. not when the sync above wrote the cache.

-- BEFORE: scheduling a day aligns the cached week with that day (D1c.1). Only
-- the cache; the week commitment itself is the app's explicit intention.
create or replace function public.tasks_align_week_to_day()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.scheduled_for is not null
     and (tg_op = 'INSERT' or new.scheduled_for is distinct from old.scheduled_for) then
    new.week_start := public.week_start_of((new.scheduled_for at time zone 'America/New_York')::date);
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_align_week_to_day on public.tasks;
create trigger tasks_align_week_to_day
  before insert or update of scheduled_for on public.tasks
  for each row execute function public.tasks_align_week_to_day();

-- AFTER (the row exists, so the FK from task_commitments resolves).
create or replace function public.tasks_mirror_to_commitments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level text; v_start date;
  v_old_day date; v_new_day date;
begin
  if pg_trigger_depth() > 1 then return null; end if;

  -- Period bucket entered (insert, or bucket/stamp changed): ensure its commitment.
  if new.bucket in ('week', 'month', 'quarter') and (
       tg_op = 'INSERT'
       or new.bucket is distinct from old.bucket
       or new.week_start is distinct from old.week_start
       or new.month_start is distinct from old.month_start
       or new.season_start is distinct from old.season_start) then
    v_level := case new.bucket when 'week' then 'week' when 'month' then 'month' else 'season' end;
    v_start := case new.bucket when 'week' then new.week_start when 'month' then new.month_start else new.season_start end;
    if v_start is not null then
      insert into public.task_commitments (task_id, level, period_start, status, created_by)
      values (new.id, v_level, v_start, case when new.completed then 'done' else 'open' end, auth.uid())
      on conflict (task_id, level, period_start) do update
        set status = case when public.task_commitments.status = 'removed' then 'open' else public.task_commitments.status end,
            ended_at = case when public.task_commitments.status = 'removed' then null else public.task_commitments.ended_at end;
    end if;
  end if;

  -- Schedule history.
  if tg_op = 'UPDATE' and new.scheduled_for is distinct from old.scheduled_for then
    v_old_day := (old.scheduled_for at time zone 'America/New_York')::date;
    v_new_day := (new.scheduled_for at time zone 'America/New_York')::date;
    perform public.log_placement_event(new.id,
      case when old.scheduled_for is null then 'scheduled'
           when new.scheduled_for is null then 'unscheduled'
           else 'rescheduled' end,
      case when old.scheduled_for is null then null else jsonb_build_object('day', v_old_day, 'at', old.scheduled_for, 'all_day', old.is_all_day) end,
      case when new.scheduled_for is null then null else jsonb_build_object('day', v_new_day, 'at', new.scheduled_for, 'all_day', new.is_all_day) end);
  elsif tg_op = 'INSERT' and new.scheduled_for is not null then
    perform public.log_placement_event(new.id, 'scheduled', null,
      jsonb_build_object('day', (new.scheduled_for at time zone 'America/New_York')::date, 'at', new.scheduled_for, 'all_day', new.is_all_day));
  end if;

  -- Completion: every open commitment is done with the task; reopen restores them.
  if tg_op = 'UPDATE' and new.completed is distinct from old.completed then
    if new.completed then
      update public.task_commitments
         set status = 'done', ended_at = coalesce(new.completed_at, now())
       where task_id = new.id and status = 'open';
      perform public.log_placement_event(new.id, 'completed', null, jsonb_build_object('completed_at', new.completed_at));
    else
      update public.task_commitments
         set status = 'open', ended_at = null
       where task_id = new.id and status = 'done';
      perform public.log_placement_event(new.id, 'reopened', null, null);
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists tasks_mirror_to_commitments on public.tasks;
create trigger tasks_mirror_to_commitments
  after insert or update of bucket, week_start, month_start, season_start, scheduled_for, is_all_day, completed, completed_at
  on public.tasks
  for each row execute function public.tasks_mirror_to_commitments();

-- ── Backfill (additive only) ─────────────────────────────────────────────────
-- Every STAMPED period row gets its commitment. Unstamped rows are not guessed.
-- Runs at depth 0 so the commitments trigger fires and writes the cache back
-- (a no-op: the values already match) and logs a 'committed' event per row.

insert into public.task_commitments (task_id, level, period_start, status, ended_at)
select id, 'week', week_start, case when completed then 'done' else 'open' end, case when completed then completed_at end
  from public.tasks where bucket = 'week' and week_start is not null
on conflict do nothing;

insert into public.task_commitments (task_id, level, period_start, status, ended_at)
select id, 'month', month_start, case when completed then 'done' else 'open' end, case when completed then completed_at end
  from public.tasks where bucket = 'month' and month_start is not null
on conflict do nothing;

insert into public.task_commitments (task_id, level, period_start, status, ended_at)
select id, 'season', season_start, case when completed then 'done' else 'open' end, case when completed then completed_at end
  from public.tasks where bucket = 'quarter' and season_start is not null
on conflict do nothing;

-- planned_on says WHICH day was chosen but not by whom; the owner is the only
-- defensible guess, and only current/future choices still mean anything.
insert into public.task_focus (task_id, user_id, date)
select id, user_id, planned_on
  from public.tasks
 where planned_on is not null
   and planned_on >= (now() at time zone 'America/New_York')::date - 2
on conflict do nothing;

-- The app subscribes to both record tables (a commitment or focus row changing
-- in the other adult's tab, or written by a trigger, patches the task live).
-- The publication has been empty before (2026-08); add explicitly, once.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'task_commitments') then
    alter publication supabase_realtime add table public.task_commitments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'task_focus') then
    alter publication supabase_realtime add table public.task_focus;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
