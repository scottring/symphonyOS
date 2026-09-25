-- 096_planning_commitments.test.sql
-- Database-level proof for the planning-review writes (Keep, Drop, complete),
-- which the client otherwise proves only against mocks.
--
-- LOCAL ONLY. Run by scripts/test-planning-commitments-locally.sh against a
-- throwaway cluster loaded with supabase/tests/fixtures/planning_commitments_schema.sql
-- (the live schema, read from the catalog 2026-09-25). It commits rows, so it
-- must never be pointed at a shared database.
--
-- Shape: each contract is its own DO block (its own transaction), so one
-- failing contract does not hide the others. A pass ends in NOTICE 'PASS …';
-- a failure raises 'FAIL …' naming the exact assertion.
--
-- Every client write is transcribed into a tst.* function below: same table,
-- same columns, same filters, same onConflict, citing the client line. The
-- functions are SECURITY INVOKER, so they run as whichever user the block is
-- acting as (role authenticated + request.jwt.claims), under RLS — the same
-- position a supabase-js request is in. Each supabase-js call is its own
-- PostgREST transaction; here a whole flow shares one. That does not change
-- trigger behaviour (all triggers are row-level, AFTER/BEFORE, not deferred).
--
-- People (seeded by the runner into household_members):
--   alex     — owns the tasks
--   partner  — same household as alex (the acting household member)
--   outsider — a DIFFERENT household
--
-- Periods: weeks start Sunday (week_start_of). Sep 2026 → Oct 2026;
-- week of Sun 2026-09-20 → Sun 2026-09-27; Fall season starts 2026-09-01.

\set ON_ERROR_STOP 0

drop schema if exists tst cascade;
create schema tst;
grant usage on schema tst to authenticated;

create table tst.people (name text primary key, id uuid not null);
insert into tst.people values
  ('alex',     'f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7'),
  ('partner',  '3431facd-dc33-41a1-b42d-f1a375eec505'),
  ('outsider', '4b8f6412-d067-449e-9c5e-2d31c22f8822');
grant select on tst.people to authenticated;

-- Act as a signed-in user: what a supabase-js request carries.
create function tst.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Back to the test harness (postgres, no JWT) for setup and inspection.
create function tst.as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ── Client writes, transcribed ─────────────────────────────────────────────

-- keepForward's row write — src/hooks/useSupabaseTasks.ts:1545-1553
--   supabase.from('tasks').update({ bucket, week_start, month_start, season_start }).eq('id', t.id)
-- dropCommitment's row write — :1593-1599 (same columns). weekend_start only
-- rides when plan.row has it; none of these tasks has a weekend.
create function tst.row_write(p_task uuid, p_bucket text, p_week date, p_month date, p_season date) returns int
language plpgsql as $$
declare n int;
begin
  update public.tasks set bucket = p_bucket, week_start = p_week, month_start = p_month, season_start = p_season
   where id = p_task;
  get diagnostics n = row_count;
  return n;
end $$;

-- writePlacementOps 'ensure' — :1414-1416
--   .upsert({ task_id, level, period_start, status: 'open', ended_at: null, carried_to: null, created_by: user?.id ?? null },
--           { onConflict: 'task_id,level,period_start' })
-- PostgREST merge-duplicates: ON CONFLICT (...) DO UPDATE SET <every payload column> = EXCLUDED.<col>.
create function tst.op_ensure(p_task uuid, p_level text, p_start date) returns void
language plpgsql as $$
begin
  insert into public.task_commitments (task_id, level, period_start, status, ended_at, carried_to, created_by)
  values (p_task, p_level, p_start, 'open', null, null, auth.uid())
  on conflict (task_id, level, period_start) do update set
    task_id = excluded.task_id, level = excluded.level, period_start = excluded.period_start,
    status = excluded.status, ended_at = excluded.ended_at, carried_to = excluded.carried_to,
    created_by = excluded.created_by;
end $$;

-- writePlacementOps 'remove' — :1418-1421
--   .update({ status: 'removed', ended_at: now }).eq(task_id).eq(level).eq(period_start).eq('status','open')
create function tst.op_remove(p_task uuid, p_level text, p_start date) returns int
language plpgsql as $$
declare n int;
begin
  update public.task_commitments set status = 'removed', ended_at = now()
   where task_id = p_task and level = p_level and period_start = p_start and status = 'open';
  get diagnostics n = row_count;
  return n;
end $$;

-- writePlacementOps 'carry' — :1423-1426
--   .update({ status: 'carried', carried_to: localYmd(op.to), ended_at: now }).eq(...).eq('status','open')
create function tst.op_carry(p_task uuid, p_level text, p_start date, p_to date) returns int
language plpgsql as $$
declare n int;
begin
  update public.task_commitments set status = 'carried', carried_to = p_to, ended_at = now()
   where task_id = p_task and level = p_level and period_start = p_start and status = 'open';
  get diagnostics n = row_count;
  return n;
end $$;

-- writeCompletion (completeTask → writeCompletion) — :1196-1206
--   .from('tasks').update({ completed, completed_at: completed ? now : null }).eq('id', id)
-- (is_waiting / needs_discussion ride along only when set; not set here.)
create function tst.complete(p_task uuid, p_completed boolean) returns int
language plpgsql as $$
declare n int;
begin
  update public.tasks set completed = p_completed, completed_at = case when p_completed then now() else null end
   where id = p_task;
  get diagnostics n = row_count;
  return n;
end $$;

-- writePlacementOps focus 'set' — :1467-1469
--   .from('task_focus').upsert({ task_id, user_id, date }, { onConflict: 'task_id,user_id,date', ignoreDuplicates: true })
-- PostgREST ignore-duplicates: ON CONFLICT (...) DO NOTHING — needs no UPDATE policy.
create function tst.op_focus_set(p_task uuid, p_user uuid, p_date date) returns void
language plpgsql as $$
begin
  insert into public.task_focus (task_id, user_id, date) values (p_task, p_user, p_date)
  on conflict (task_id, user_id, date) do nothing;
end $$;

grant execute on all functions in schema tst to authenticated;

-- Fixed task ids so later blocks and the runner's report can name them.
create table tst.ids (name text primary key, id uuid not null default gen_random_uuid());
insert into tst.ids (name) values ('keep_month'), ('keep_week'), ('keep_partial'), ('drop_mid'), ('drop_sibling'),
  ('drop_last'), ('done'), ('done_sub'), ('idem'), ('carried_reensure'), ('private'), ('focus');
grant select on tst.ids to authenticated;
create function tst.id(p text) returns uuid language sql stable as $$ select id from tst.ids where name = p $$;
create function tst.who(p text) returns uuid language sql stable as $$ select id from tst.people where name = p $$;
grant execute on all functions in schema tst to authenticated;

-- ═══ 1. keepForward — month, acted by the household partner ════════════════
do $$
declare
  t uuid := tst.id('keep_month');
  r record; n int;
begin
  -- Setup: alex's shared task, on September (the mirror trigger opens the commitment).
  perform tst.act_as(tst.who('alex'));
  insert into public.tasks (id, user_id, title, scope, bucket, month_start)
    values (t, tst.who('alex'), 'keep: month', 'couple', 'month', date '2026-09-01');

  -- keepForward(t, { monthStart: Oct }, from: Sep) as partner.
  -- planKeep → row {bucket month, month_start Oct, week/season null};
  --           ops [carry month Sep→Oct, ensure month Oct].
  perform tst.act_as(tst.who('partner'));
  n := tst.row_write(t, 'month', null, date '2026-10-01', null);
  if n <> 1 then raise exception 'FAIL 1a: partner row write touched % rows (want 1)', n; end if;
  n := tst.op_carry(t, 'month', date '2026-09-01', date '2026-10-01');
  if n <> 1 then raise exception 'FAIL 1b: carry closed % rows (want 1)', n; end if;
  perform tst.op_ensure(t, 'month', date '2026-10-01');

  perform tst.as_admin();
  select * into r from public.task_commitments where task_id = t and level = 'month' and period_start = '2026-09-01';
  if r.status <> 'carried' or r.carried_to is distinct from date '2026-10-01' or r.ended_at is null then
    raise exception 'FAIL 1c: old period should be carried→2026-10-01 with ended_at; got status=% carried_to=% ended_at=%', r.status, r.carried_to, r.ended_at;
  end if;
  select * into r from public.task_commitments where task_id = t and level = 'month' and period_start = '2026-10-01';
  if not found or r.status <> 'open' or r.ended_at is not null then
    raise exception 'FAIL 1d: new period should be open; got %', r;
  end if;
  if r.created_by is distinct from tst.who('partner') then
    raise exception 'FAIL 1e: new commitment created_by should be the acting partner; got %', r.created_by;
  end if;
  select count(*) into n from public.task_commitments where task_id = t;
  if n <> 2 then raise exception 'FAIL 1f: expected exactly 2 commitment rows, got %', n; end if;
  select bucket, week_start, month_start, season_start into r from public.tasks where id = t;
  if r.bucket <> 'month' or r.month_start is distinct from date '2026-10-01' or r.week_start is not null or r.season_start is not null then
    raise exception 'FAIL 1g: tasks cache should be month/2026-10-01; got %', r;
  end if;
  select count(*) into n from public.task_placement_events where task_id = t and kind = 'carried' and by = tst.who('partner');
  if n <> 1 then raise exception 'FAIL 1h: one carried event by partner expected, got %', n; end if;
  raise notice 'PASS 1: keepForward (month) — old carried, new open, cache follows, by a household member';
end $$;

-- ═══ 2. keepForward — week, with a month commitment that must stay ════════
do $$
declare
  t uuid := tst.id('keep_week');
  r record; n int;
begin
  perform tst.act_as(tst.who('alex'));
  insert into public.tasks (id, user_id, title, bucket, week_start, month_start)
    values (t, tst.who('alex'), 'keep: week', 'week', date '2026-09-20', date '2026-09-01');
  perform tst.op_ensure(t, 'month', date '2026-09-01');   -- a placement earlier put it on September too

  -- keepForward(t, { weekStart: 09-27 }, from: 09-20)
  -- planKeep → row {bucket week, week 09-27, month 09-01, season null}; ops [carry week, ensure week].
  n := tst.row_write(t, 'week', date '2026-09-27', date '2026-09-01', null);
  n := tst.op_carry(t, 'week', date '2026-09-20', date '2026-09-27');
  if n <> 1 then raise exception 'FAIL 2a: week carry closed % rows', n; end if;
  perform tst.op_ensure(t, 'week', date '2026-09-27');

  perform tst.as_admin();
  select status into r from public.task_commitments where task_id = t and level = 'week' and period_start = '2026-09-20';
  if r.status <> 'carried' then raise exception 'FAIL 2b: old week should be carried, got %', r.status; end if;
  select status into r from public.task_commitments where task_id = t and level = 'week' and period_start = '2026-09-27';
  if r.status <> 'open' then raise exception 'FAIL 2c: new week should be open, got %', r.status; end if;
  select status into r from public.task_commitments where task_id = t and level = 'month';
  if r.status <> 'open' then raise exception 'FAIL 2d: the month commitment must be untouched by a week Keep, got %', r.status; end if;
  select bucket, week_start, month_start into r from public.tasks where id = t;
  if r.bucket <> 'week' or r.week_start <> date '2026-09-27' or r.month_start <> date '2026-09-01' then
    raise exception 'FAIL 2e: cache should be week/09-27 with month 09-01; got %', r;
  end if;
  raise notice 'PASS 2: keepForward (week) — carries the week, leaves the month open';
end $$;

-- ═══ 3. keepForward retry after a partial failure ══════════════════════════
do $$
declare
  t uuid := tst.id('keep_partial');
  r record; n int;
begin
  perform tst.act_as(tst.who('alex'));
  insert into public.tasks (id, user_id, title, bucket, month_start)
    values (t, tst.who('alex'), 'keep: partial', 'month', date '2026-09-01');

  -- First attempt: row write OK, carry FAILS (not sent), ensure OK
  -- (writePlacementOps keeps going after a failed op).
  perform tst.row_write(t, 'month', null, date '2026-10-01', null);
  perform tst.op_ensure(t, 'month', date '2026-10-01');

  perform tst.as_admin();
  select count(*) into n from public.task_commitments where task_id = t and status = 'open';
  if n <> 2 then raise exception 'FAIL 3a: after the half-failed Keep both months should be open, got %', n; end if;
  select month_start into r from public.tasks where id = t;
  if r.month_start <> date '2026-10-01' then raise exception 'FAIL 3b: cache should read the latest open month (Oct), got %', r.month_start; end if;

  -- Retry: planKeep(from Sep) sees Sep still open → [carry Sep→Oct, ensure Oct]; same row.
  perform tst.act_as(tst.who('alex'));
  perform tst.row_write(t, 'month', null, date '2026-10-01', null);
  n := tst.op_carry(t, 'month', date '2026-09-01', date '2026-10-01');
  if n <> 1 then raise exception 'FAIL 3c: retry carry should close the still-open Sep (1 row), got %', n; end if;
  perform tst.op_ensure(t, 'month', date '2026-10-01');
  -- A second full retry: planKeep now sees Sep carried → only [ensure Oct].
  perform tst.row_write(t, 'month', null, date '2026-10-01', null);
  n := tst.op_carry(t, 'month', date '2026-09-01', date '2026-10-01');  -- even if a stale client re-sent it
  if n <> 0 then raise exception 'FAIL 3d: re-running a carry must be a no-op, touched % rows', n; end if;
  perform tst.op_ensure(t, 'month', date '2026-10-01');

  perform tst.as_admin();
  select count(*) into n from public.task_commitments where task_id = t;
  if n <> 2 then raise exception 'FAIL 3e: retries must not duplicate rows; expected 2, got %', n; end if;
  select count(*) into n from public.task_commitments where task_id = t and status = 'carried' and carried_to = '2026-10-01';
  if n <> 1 then raise exception 'FAIL 3f: expected one carried row, got %', n; end if;
  select count(*) into n from public.task_placement_events where task_id = t and kind = 'carried';
  if n <> 1 then raise exception 'FAIL 3g: expected exactly one carried event across retries, got %', n; end if;
  raise notice 'PASS 3: keepForward retry after partial failure converges, no duplicates, carry re-run is a no-op';
end $$;

-- ═══ 4. dropCommitment closes exactly ONE commitment ══════════════════════
do $$
declare
  t uuid := tst.id('drop_mid');
  sib uuid := tst.id('drop_sibling');
  r record; n int;
begin
  perform tst.act_as(tst.who('alex'));
  insert into public.tasks (id, user_id, title, scope, bucket, week_start)
    values (t, tst.who('alex'), 'drop: three rungs', 'couple', 'week', date '2026-09-20');
  perform tst.op_ensure(t, 'month', date '2026-09-01');
  perform tst.op_ensure(t, 'season', date '2026-09-01');
  insert into public.tasks (id, user_id, title, bucket, month_start)
    values (sib, tst.who('alex'), 'drop: sibling on the same month', 'month', date '2026-09-01');

  perform tst.as_admin();
  create temp table before_drop as select id, task_id, level, period_start, status, carried_to, ended_at from public.task_commitments;
  grant select on before_drop to authenticated;

  -- dropCommitment(t, 'month', Sep) as partner.
  -- planDropCommitment → ops [remove month Sep];
  --   row = deriveCache: week 09-20 open → {bucket week, week 09-20, month null, season 09-01}.
  perform tst.act_as(tst.who('partner'));
  n := tst.row_write(t, 'week', date '2026-09-20', null, date '2026-09-01');
  if n <> 1 then raise exception 'FAIL 4a: partner drop row write touched % rows', n; end if;
  n := tst.op_remove(t, 'month', date '2026-09-01');
  if n <> 1 then raise exception 'FAIL 4b: remove closed % rows (want 1)', n; end if;

  perform tst.as_admin();
  select count(*) into n
    from public.task_commitments c join before_drop b using (id)
   where (c.status, c.carried_to, c.ended_at) is distinct from (b.status, b.carried_to, b.ended_at);
  if n <> 1 then raise exception 'FAIL 4c: exactly one commitment should change, % did', n; end if;
  select count(*) into n from public.task_commitments c where not exists (select 1 from before_drop b where b.id = c.id);
  if n <> 0 then raise exception 'FAIL 4d: drop must not create commitments; % new', n; end if;
  select status into r from public.task_commitments where task_id = t and level = 'month';
  if r.status <> 'removed' then raise exception 'FAIL 4e: dropped month should be removed, got %', r.status; end if;
  select count(*) into n from public.task_commitments where task_id = t and status = 'open' and level in ('week', 'season');
  if n <> 2 then raise exception 'FAIL 4f: week and season must stay open, % open', n; end if;
  select status into r from public.task_commitments where task_id = sib;
  if r.status <> 'open' then raise exception 'FAIL 4g: sibling task on the same month must stay open, got %', r.status; end if;
  select bucket, week_start, month_start, season_start into r from public.tasks where id = t;
  if r.bucket <> 'week' or r.month_start is not null or r.season_start <> date '2026-09-01' then
    raise exception 'FAIL 4h: cache should be week, no month, season 09-01; got %', r;
  end if;

  -- Retry: the remove is a no-op.
  perform tst.act_as(tst.who('partner'));
  n := tst.op_remove(t, 'month', date '2026-09-01');
  if n <> 0 then raise exception 'FAIL 4i: re-running remove must be a no-op, touched %', n; end if;
  perform tst.as_admin();
  drop table before_drop;
  raise notice 'PASS 4: dropCommitment closes exactly one commitment; retry is a no-op';
end $$;

-- ═══ 5. dropCommitment of the last commitment → Inbox ═════════════════════
do $$
declare
  t uuid := tst.id('drop_last');
  r record; n int;
begin
  perform tst.act_as(tst.who('alex'));
  insert into public.tasks (id, user_id, title, bucket, month_start)
    values (t, tst.who('alex'), 'drop: last one', 'month', date '2026-09-01');
  -- planDropCommitment → row = {bucket inbox, all stamps null}; ops [remove month Sep].
  perform tst.row_write(t, 'inbox', null, null, null);
  n := tst.op_remove(t, 'month', date '2026-09-01');
  if n <> 1 then raise exception 'FAIL 5a: remove closed % rows', n; end if;
  perform tst.as_admin();
  select bucket, week_start, month_start, season_start into r from public.tasks where id = t;
  if r.bucket <> 'inbox' or r.month_start is not null then raise exception 'FAIL 5b: expected inbox with no stamps, got %', r; end if;
  select count(*) into n from public.task_commitments where task_id = t and status = 'open';
  if n <> 0 then raise exception 'FAIL 5c: nothing should stay open, % open', n; end if;
  raise notice 'PASS 5: dropping the last commitment leaves the task in the Inbox';
end $$;

-- ═══ 6. completeTask — the completion trigger's done / reopen ═════════════
do $$
declare
  t uuid := tst.id('done');
  sub uuid := tst.id('done_sub');
  r record; n int;
  done_at timestamptz;
begin
  perform tst.act_as(tst.who('alex'));
  insert into public.tasks (id, user_id, title, scope, bucket, month_start)
    values (t, tst.who('alex'), 'done: shared', 'couple', 'month', date '2026-08-01');
  -- August was kept into September (history), then September also has a week.
  perform tst.op_carry(t, 'month', date '2026-08-01', date '2026-09-01');
  perform tst.op_ensure(t, 'month', date '2026-09-01');
  perform tst.op_ensure(t, 'week', date '2026-09-20');
  perform tst.op_remove(t, 'week', date '2026-09-20');   -- a let-go week: history, stays removed
  perform tst.op_ensure(t, 'week', date '2026-09-27');
  insert into public.tasks (id, user_id, title, bucket, week_start, parent_task_id)
    values (sub, tst.who('alex'), 'done: subtask', 'week', date '2026-09-27', t);

  perform tst.as_admin();
  select bucket, week_start, month_start into r from public.tasks where id = t;
  if r.bucket <> 'week' or r.week_start <> date '2026-09-27' then raise exception 'FAIL 6pre: setup cache wrong: %', r; end if;

  -- completeTask as partner.
  perform tst.act_as(tst.who('partner'));
  n := tst.complete(t, true);
  if n <> 1 then raise exception 'FAIL 6a: partner completion touched % rows', n; end if;
  perform tst.as_admin();
  select completed_at into done_at from public.tasks where id = t;
  select count(*) into n from public.task_commitments where task_id = t and status = 'open';
  if n <> 0 then raise exception 'FAIL 6b: no commitment may stay open after completion, % open', n; end if;
  select count(*) into n from public.task_commitments where task_id = t and status = 'done' and ended_at = done_at;
  if n <> 2 then raise exception 'FAIL 6c: the two open commitments (month Sep, week 09-27) should be done at completed_at, % are', n; end if;
  select status into r from public.task_commitments where task_id = t and level = 'month' and period_start = '2026-08-01';
  if r.status <> 'carried' then raise exception 'FAIL 6d: carried history must survive completion, got %', r.status; end if;
  select status into r from public.task_commitments where task_id = t and level = 'week' and period_start = '2026-09-20';
  if r.status <> 'removed' then raise exception 'FAIL 6e: removed history must survive completion, got %', r.status; end if;
  -- PIN (observed behaviour, not a stated contract): the done/reopen UPDATE
  -- runs inside the tasks trigger (depth 2), so task_commitments_after_change
  -- skips its sync and the cache columns do not move on completion.
  select bucket, week_start, month_start into r from public.tasks where id = t;
  if r.bucket <> 'week' or r.week_start <> date '2026-09-27' or r.month_start <> date '2026-09-01' then
    raise exception 'FAIL 6f: (pin) cache columns moved on completion: %', r;
  end if;

  -- Reopen (toggleTask → writeCompletion(task, false)).
  perform tst.act_as(tst.who('partner'));
  perform tst.complete(t, false);
  perform tst.as_admin();
  select count(*) into n from public.task_commitments where task_id = t and status = 'open' and ended_at is null;
  if n <> 2 then raise exception 'FAIL 6g: reopen should restore exactly the two done commitments, % open', n; end if;
  select count(*) into n from public.task_commitments where task_id = t and status in ('carried', 'removed');
  if n <> 2 then raise exception 'FAIL 6h: reopen must not touch carried/removed history, % left', n; end if;
  select count(*) into n from public.task_commitments where task_id = t;
  if n <> 4 then raise exception 'FAIL 6i: completion/reopen must not add rows; expected 4 (Aug carried, Sep, wk 09-20 removed, wk 09-27), got %', n; end if;

  -- Subtask path (:1257): .update({ completed: true }) with NO completed_at.
  perform tst.act_as(tst.who('alex'));
  update public.tasks set completed = true where id in (sub);
  perform tst.as_admin();
  select status, ended_at into r from public.task_commitments where task_id = sub;
  if r.status <> 'done' or r.ended_at is null then raise exception 'FAIL 6j: subtask commitment should be done with ended_at=now(); got %', r; end if;
  raise notice 'PASS 6: completion marks open commitments done (history untouched); reopen restores them';
end $$;

-- ═══ 7. Idempotency of the ensure upsert ══════════════════════════════════
do $$
declare
  t uuid := tst.id('idem');
  r record; n int;
begin
  perform tst.act_as(tst.who('alex'));
  insert into public.tasks (id, user_id, title, bucket, month_start)
    values (t, tst.who('alex'), 'idem', 'month', date '2026-09-01');
  perform tst.op_ensure(t, 'month', date '2026-09-01');
  perform tst.op_ensure(t, 'month', date '2026-09-01');
  perform tst.op_ensure(t, 'month', date '2026-09-01');
  perform tst.as_admin();
  select count(*) into n from public.task_commitments where task_id = t;
  if n <> 1 then raise exception 'FAIL 7a: repeated ensure must keep one row, got %', n; end if;
  select count(*) into n from public.task_placement_events where task_id = t and kind = 'committed';
  if n <> 1 then raise exception 'FAIL 7b: repeated ensure must log one committed event, got %', n; end if;

  -- ensure on a REMOVED row reopens it (applyCommitmentOps: removed → open).
  perform tst.act_as(tst.who('alex'));
  perform tst.op_remove(t, 'month', date '2026-09-01');
  perform tst.op_ensure(t, 'month', date '2026-09-01');
  perform tst.as_admin();
  select status, ended_at into r from public.task_commitments where task_id = t;
  if r.status <> 'open' or r.ended_at is not null then raise exception 'FAIL 7c: ensure should reopen a removed row; got %', r; end if;
  select count(*) into n from public.task_commitments where task_id = t;
  if n <> 1 then raise exception 'FAIL 7d: still one row expected, got %', n; end if;
  raise notice 'PASS 7: ensure upsert on (task_id, level, period_start) is idempotent; reopens a removed row';
end $$;

-- ═══ 8. ensure on a CARRIED row: client model vs database ═════════════════
-- applyCommitmentOps (intentions.ts:84-86) says ensure leaves a non-removed
-- row alone (carried stays carried); the mirror trigger agrees (it only
-- reopens 'removed'). The client's own upsert sets status = 'open'. Reached
-- by: Keep Sep→Oct, then place it back on September (planPlacement: remove
-- Oct, ensure Sep).
do $$
declare
  t uuid := tst.id('carried_reensure');
  r record;
begin
  perform tst.act_as(tst.who('alex'));
  insert into public.tasks (id, user_id, title, bucket, month_start)
    values (t, tst.who('alex'), 'carried then re-placed', 'month', date '2026-09-01');
  perform tst.row_write(t, 'month', null, date '2026-10-01', null);
  perform tst.op_carry(t, 'month', date '2026-09-01', date '2026-10-01');
  perform tst.op_ensure(t, 'month', date '2026-10-01');
  -- planPlacement({ bucket: 'month', monthStart: Sep }): row write, then [remove Oct, ensure Sep].
  perform tst.row_write(t, 'month', null, date '2026-09-01', null);
  perform tst.op_remove(t, 'month', date '2026-10-01');
  perform tst.op_ensure(t, 'month', date '2026-09-01');
  perform tst.as_admin();
  select status, carried_to into r from public.task_commitments where task_id = t and period_start = '2026-09-01';
  -- The client model now reopens a carried period chosen again, and clears
  -- its forwarding address (intentions.ts applyCommitmentOps, 2026-09-25).
  if r.status <> 'open' then
    raise exception 'FAIL 8: re-choosing a carried period left it % (client model expects open)', r.status;
  elsif r.carried_to is not null then
    raise exception 'FAIL 8: re-choosing a carried period reopened it but left carried_to=%', r.carried_to;
  end if;
  raise notice 'PASS 8: re-choosing a carried period reopens it cleanly, as the client model does';
end $$;

-- ═══ 9. RLS — another household cannot see or modify ══════════════════════
do $$
declare
  t uuid := tst.id('keep_month');   -- alex's couple-scope task from block 1
  n int; caught text;
begin
  perform tst.act_as(tst.who('outsider'));
  select count(*) into n from public.task_commitments where task_id = t;
  if n <> 0 then raise exception 'FAIL 9a: outsider can see % commitment rows', n; end if;
  select count(*) into n from public.tasks where id = t;
  if n <> 0 then raise exception 'FAIL 9b: outsider can see the task'; end if;
  select count(*) into n from public.task_placement_events where task_id = t;
  if n <> 0 then raise exception 'FAIL 9c: outsider can see % placement events', n; end if;
  n := tst.row_write(t, 'month', null, date '2026-11-01', null);
  if n <> 0 then raise exception 'FAIL 9d: outsider row write touched % rows', n; end if;
  n := tst.op_carry(t, 'month', date '2026-10-01', date '2026-11-01');
  if n <> 0 then raise exception 'FAIL 9e: outsider carry touched % rows', n; end if;
  n := tst.op_remove(t, 'month', date '2026-10-01');
  if n <> 0 then raise exception 'FAIL 9f: outsider remove touched % rows', n; end if;
  delete from public.task_commitments where task_id = t;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 9g: outsider delete touched % rows', n; end if;
  n := tst.complete(t, true);
  if n <> 0 then raise exception 'FAIL 9h: outsider completion touched % rows', n; end if;

  caught := null;
  begin
    perform tst.op_ensure(t, 'month', date '2026-10-01');   -- conflicts with an existing row
  exception when others then caught := sqlstate;
  end;
  if caught is null then raise exception 'FAIL 9i: outsider ensure (conflicting) was accepted'; end if;
  caught := null;
  begin
    perform tst.op_ensure(t, 'month', date '2026-12-01');   -- a fresh row
  exception when others then caught := sqlstate;
  end;
  if caught is null then raise exception 'FAIL 9j: outsider ensure (new row) was accepted'; end if;
  caught := null;
  begin
    perform tst.op_focus_set(t, tst.who('outsider'), date '2026-09-25');
  exception when others then caught := sqlstate;
  end;
  if caught is null then raise exception 'FAIL 9k: outsider focus on another household''s task was accepted'; end if;

  perform tst.as_admin();
  select count(*) into n from public.task_commitments where task_id = t;
  if n <> 2 then raise exception 'FAIL 9l: outsider attempts changed the row count to %', n; end if;
  select count(*) into n from public.task_commitments where task_id = t and status = 'open' and period_start = '2026-10-01';
  if n <> 1 then raise exception 'FAIL 9m: outsider attempts changed Oct''s status'; end if;
  select count(*) into n from public.tasks where id = t and completed = false and month_start = '2026-10-01';
  if n <> 1 then raise exception 'FAIL 9n: outsider attempts changed the task row'; end if;
  raise notice 'PASS 9: RLS — another household sees nothing and changes nothing (update/delete 0 rows, insert/upsert rejected)';
end $$;

-- ═══ 10. RLS — a household member cannot reach an INDIVIDUAL task ═════════
do $$
declare
  t uuid := tst.id('private');
  n int; caught text;
begin
  perform tst.act_as(tst.who('alex'));
  insert into public.tasks (id, user_id, title, scope, bucket, month_start)
    values (t, tst.who('alex'), 'private', 'individual', 'month', date '2026-09-01');
  perform tst.act_as(tst.who('partner'));
  select count(*) into n from public.task_commitments where task_id = t;
  if n <> 0 then raise exception 'FAIL 10a: partner can see % commitments on alex''s individual task', n; end if;
  n := tst.op_carry(t, 'month', date '2026-09-01', date '2026-10-01');
  if n <> 0 then raise exception 'FAIL 10b: partner carried alex''s individual commitment'; end if;
  caught := null;
  begin perform tst.op_ensure(t, 'month', date '2026-10-01');
  exception when others then caught := sqlstate; end;
  if caught is null then raise exception 'FAIL 10c: partner ensured on alex''s individual task'; end if;
  perform tst.as_admin();
  raise notice 'PASS 10: RLS — household sharing is by scope; an individual task stays private';
end $$;

-- ═══ 11. Focus 'set' retry (upsert on task_focus) ═════════════════════════
-- task_focus has INSERT / SELECT / DELETE policies but no UPDATE policy. The
-- client's focus 'set' is an upsert (ON CONFLICT DO UPDATE); a retry that
-- hits the existing row takes the UPDATE path.
do $$
declare
  t uuid := tst.id('focus');
  n int; err text;
begin
  perform tst.act_as(tst.who('alex'));
  insert into public.tasks (id, user_id, title) values (t, tst.who('alex'), 'focus');
  perform tst.op_focus_set(t, tst.who('alex'), date '2026-09-25');
  err := null;
  begin
    perform tst.op_focus_set(t, tst.who('alex'), date '2026-09-25');
  exception when others then err := sqlstate || ' ' || sqlerrm;
  end;
  perform tst.as_admin();
  select count(*) into n from public.task_focus where task_id = t;
  if err is not null then raise exception 'FAIL 11: re-sending focus set (upsert) errors: %', err; end if;
  if n <> 1 then raise exception 'FAIL 11: expected 1 focus row, got %', n; end if;
  raise notice 'PASS 11: focus set upsert is idempotent';
end $$;
