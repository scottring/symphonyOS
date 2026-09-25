-- 097_drop_partial_failure.investigation.sql
-- INVESTIGATION, not a regression suite. Run by
-- scripts/investigate-drop-partial-failure.sh against a throwaway local
-- Postgres 17 loaded with supabase/tests/fixtures/planning_commitments_schema.sql
-- (the live tasks / task_commitments schema, triggers and RLS, 2026-09-25).
-- It commits rows and creates test-only triggers and an RPC in schema `inv`;
-- never point it at a shared database.
--
-- Question: a review Drop (dropCommitment, src/hooks/useSupabaseTasks.ts) sends
--   1. PATCH tasks  (the plan's derived cache: bucket / week / month / season)
--   2. writePlacementOps: each commitment op (Drop: exactly one `remove`)
--   3. let-go re-assert: PATCH tasks again when plan.row.bucket is
--      inbox/someday, every op succeeded, and some op was a `remove`
-- What does the database hold when any one request fails, what does a retry
-- converge to, and which ordering / mechanism avoids the split state?
--
-- How a failure is modelled: every client request runs in its own
-- subtransaction (inv.step), the way PostgREST runs each request in its own
-- transaction. A failure is injected by a BEFORE UPDATE trigger (inv.fault)
-- that raises when the GUC inv.fail names that request, so the failing
-- statement is rolled back and nothing else is — the same end state as a 500
-- or a request that never arrived. Faults only fire at trigger depth 1, i.e.
-- on the client's own statement, never on the writes the live triggers make.
--
-- Output: 'OBSERVE …' notices record states; 'PASS n: …' closes a block;
-- 'FAIL …' is raised when an assertion about the live triggers does not hold.
-- Acting users: alex owns the tasks (scope couple); partner (same household)
-- performs every client sequence, as role authenticated under RLS; outsider
-- is another household.
--
-- Dates: week Sun 2026-09-20, month 2026-09-01, season 2026-09-01; weekend
-- Sat 2026-09-26.

\set ON_ERROR_STOP 0

drop schema if exists inv cascade;
create schema inv;
grant usage on schema inv to authenticated;

create table inv.people (name text primary key, id uuid not null);
insert into inv.people values
  ('alex',     'f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7'),
  ('partner',  '3431facd-dc33-41a1-b42d-f1a375eec505'),
  ('outsider', '4b8f6412-d067-449e-9c5e-2d31c22f8822');
grant select on inv.people to authenticated;
create function inv.who(p text) returns uuid language sql stable as $$ select id from inv.people where name = p $$;

create function inv.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function inv.as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function inv.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAIL %', p_msg; end if;
end $$;

-- ── Fault injection (test-only triggers) ───────────────────────────────────
-- inv.fail = 'row'           → the client's UPDATE of tasks fails
--          = 'remove:<level>' → the client's remove of that level fails
--          = 'remove:any'     → any remove fails
create function inv.fault() returns trigger language plpgsql as $$
declare f text := coalesce(current_setting('inv.fail', true), '');
begin
  if f = '' or pg_trigger_depth() > 1 then return new; end if;
  if tg_table_name = 'tasks' and f = 'row' then
    raise exception 'injected 500: tasks row write';
  end if;
  if tg_table_name = 'task_commitments' and new.status = 'removed' and old.status = 'open'
     and (f = 'remove:any' or f = 'remove:' || old.level) then
    raise exception 'injected 500: remove %', old.level;
  end if;
  return new;
end $$;
create trigger aaa_inv_fault before update on public.tasks for each row execute function inv.fault();
create trigger aaa_inv_fault before update on public.task_commitments for each row execute function inv.fault();

-- One client request, in its own subtransaction. Returns the row count the
-- call reports, or -1 when the request failed (and was rolled back).
create function inv.step(p_call text, p_fail text default '') returns int language plpgsql as $$
declare n int;
begin
  perform set_config('inv.fail', coalesce(p_fail, ''), true);
  begin
    execute 'select ' || p_call into n;
  exception when others then
    perform set_config('inv.fail', '', true);
    raise notice 'OBSERVE   request failed: % → %', p_call, sqlerrm;
    return -1;
  end;
  perform set_config('inv.fail', '', true);
  return n;
end $$;

-- ── Client writes, transcribed (as in 096) ─────────────────────────────────
-- dropCommitment row write (useSupabaseTasks.ts:1599-1605) and the let-go
-- re-assert (:1452-1458): the same four cache columns, plus weekend_start
-- only when the plan names it (Drop of a week on a weekend task).
create function inv.row_write(p_task uuid, p_bucket text, p_week date, p_month date, p_season date,
                              p_clear_weekend boolean default false) returns int
language plpgsql as $$
declare n int;
begin
  if p_clear_weekend then
    update public.tasks set weekend_start = null, bucket = p_bucket, week_start = p_week, month_start = p_month, season_start = p_season where id = p_task;
  else
    update public.tasks set bucket = p_bucket, week_start = p_week, month_start = p_month, season_start = p_season where id = p_task;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- writePlacementOps 'remove' (:1424-1427)
create function inv.op_remove(p_task uuid, p_level text, p_start date) returns int
language plpgsql as $$
declare n int;
begin
  update public.task_commitments set status = 'removed', ended_at = now()
   where task_id = p_task and level = p_level and period_start = p_start and status = 'open';
  get diagnostics n = row_count;
  return n;
end $$;

-- writePlacementOps 'ensure' (:1419-1422), PostgREST merge-duplicates upsert
create function inv.op_ensure(p_task uuid, p_level text, p_start date) returns int
language plpgsql as $$
begin
  insert into public.task_commitments (task_id, level, period_start, status, ended_at, carried_to, created_by)
  values (p_task, p_level, p_start, 'open', null, null, auth.uid())
  on conflict (task_id, level, period_start) do update set
    status = excluded.status, ended_at = excluded.ended_at, carried_to = excluded.carried_to, created_by = excluded.created_by;
  return 1;
end $$;

-- Option (c): ONE transactional RPC — investigation only, never a migration.
-- SECURITY INVOKER: it runs under the caller's RLS exactly as the separate
-- PostgREST requests do. Ops first (the sync trigger re-derives the row after
-- each), then the plan's row as the final word (someday, weekend reset).
create function inv.apply_placement(p_task uuid, p_ops jsonb, p_row jsonb) returns int
language plpgsql security invoker set search_path = public as $$
declare op jsonb; n int;
begin
  perform 1 from public.tasks where id = p_task for update;   -- visible to the caller? (RLS) and serialise writers
  if not found then raise exception 'task % not found' , p_task using errcode = '42501'; end if;
  for op in select * from jsonb_array_elements(coalesce(p_ops, '[]'::jsonb)) loop
    if op->>'op' = 'remove' then
      update public.task_commitments set status = 'removed', ended_at = now()
       where task_id = p_task and level = op->>'level' and period_start = (op->>'period_start')::date and status = 'open';
    elsif op->>'op' = 'carry' then
      update public.task_commitments set status = 'carried', carried_to = (op->>'to')::date, ended_at = now()
       where task_id = p_task and level = op->>'level' and period_start = (op->>'period_start')::date and status = 'open';
    elsif op->>'op' = 'ensure' then
      insert into public.task_commitments (task_id, level, period_start, status, ended_at, carried_to, created_by)
      values (p_task, op->>'level', (op->>'period_start')::date, 'open', null, null, auth.uid())
      on conflict (task_id, level, period_start) do update set
        status = excluded.status, ended_at = excluded.ended_at, carried_to = excluded.carried_to, created_by = excluded.created_by;
    else
      raise exception 'unknown op %', op;
    end if;
  end loop;
  if p_row is not null then
    update public.tasks set
      bucket = p_row->>'bucket',
      week_start = (p_row->>'week_start')::date,
      month_start = (p_row->>'month_start')::date,
      season_start = (p_row->>'season_start')::date,
      weekend_start = case when p_row ? 'weekend_start' then (p_row->>'weekend_start')::date else weekend_start end
    where id = p_task;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'row write touched % rows', n; end if;
  end if;
  return 1;
end $$;

-- ── Inspection ─────────────────────────────────────────────────────────────
create function inv.fmt(b text, w date, m date, s date) returns text language sql immutable as $$
  select concat_ws('/', b, coalesce(w::text, '-'), coalesce(m::text, '-'), coalesce(s::text, '-')) $$;

-- The tasks row's cache columns.
create function inv.row_cache(t uuid) returns text language sql stable as $$
  select inv.fmt(bucket, week_start, month_start, season_start) from public.tasks where id = t $$;

-- deriveCache (src/lib/placement/model.ts:67) over the commitments the CURRENT
-- role can read, with `p_base` as the task's bucket (the client passes its
-- local bucket; the DB invariant passes the row's). Identical rule to
-- tasks_sync_from_commitments for these undated tasks.
create function inv.derive(t uuid, p_base text) returns text language plpgsql stable as $$
declare w date; m date; s date; sch timestamptz; b text;
begin
  select scheduled_for into sch from public.tasks where id = t;
  select max(period_start) filter (where level = 'week'), max(period_start) filter (where level = 'month'),
         max(period_start) filter (where level = 'season')
    into w, m, s from public.task_commitments where task_id = t and status = 'open';
  if sch is not null then return inv.fmt('timed', public.week_start_of((sch at time zone 'America/New_York')::date), m, s); end if;
  b := case when w is not null then 'week' when m is not null then 'month' when s is not null then 'quarter'
            when p_base in ('inbox', 'someday') then p_base else 'inbox' end;
  return inv.fmt(b, w, m, s);
end $$;

-- DB invariant: the row carries what its open commitments imply.
create function inv.consistent(t uuid) returns boolean language sql stable as $$
  select inv.row_cache(t) = inv.derive(t, (select bucket from public.tasks where id = t)) $$;

create function inv.records(t uuid) returns text language sql stable as $$
  select coalesce(string_agg(level || ' ' || period_start || ' ' || status, ', ' order by level, period_start), '(none)')
    from public.task_commitments where task_id = t $$;

-- What a FRESH load shows (loadTasks: bucket from the row; list membership
-- from committedTo = any non-removed commitment).
create function inv.fresh_view(t uuid) returns text language sql stable as $$
  select 'in Inbox list=' || (bucket = 'inbox' and not completed)
      || '; on period lists=' || coalesce((select string_agg(level || ' ' || period_start, ', ' order by level)
                                           from public.task_commitments where task_id = t and status <> 'removed'), '(none)')
    from public.tasks where id = t $$;

create function inv.events(t uuid, k text) returns int language sql stable as $$
  select count(*)::int from public.task_placement_events where task_id = t and kind = k $$;

create function inv.show(p_label text, t uuid) returns void language plpgsql as $$
begin
  raise notice 'OBSERVE % | row=% | records=[%] | consistent=% | fresh load: %',
    p_label, inv.row_cache(t), inv.records(t), inv.consistent(t), inv.fresh_view(t);
end $$;

-- Seed a couple-scope task owned by alex. Shapes:
--   'week'         week 09-20 open                         (bucket week)
--   'week+month'   week 09-20 and month Sep open           (bucket week)
--   'week+weekend' week 09-20 open, weekend_start 09-26    (bucket week)
create function inv.seed(p_title text, p_shape text) returns uuid language plpgsql as $$
declare t uuid := gen_random_uuid();
begin
  perform inv.act_as(inv.who('alex'));
  insert into public.tasks (id, user_id, title, scope, bucket, week_start, weekend_start)
    values (t, inv.who('alex'), p_title, 'couple', 'week', date '2026-09-20',
            case when p_shape = 'week+weekend' then date '2026-09-26' end);
  if p_shape = 'week+month' then perform inv.op_ensure(t, 'month', date '2026-09-01'); end if;
  perform inv.as_admin();
  perform inv.check(inv.consistent(t), 'seed ' || p_title || ' inconsistent: ' || inv.row_cache(t));
  return t;
end $$;

-- Call strings for inv.step.
create function inv.c_row(t uuid, b text, w date, m date, s date, clear_weekend boolean default false) returns text
language sql immutable as $$ select format('inv.row_write(%L::uuid,%L,%L::date,%L::date,%L::date,%L)', t, b, w, m, s, clear_weekend) $$;
create function inv.c_remove(t uuid, l text, d date) returns text
language sql immutable as $$ select format('inv.op_remove(%L::uuid,%L,%L::date)', t, l, d) $$;
create function inv.c_rpc(t uuid, ops jsonb, r jsonb) returns text
language sql immutable as $$ select format('inv.apply_placement(%L::uuid,%L::jsonb,%L::jsonb)', t, ops, r) $$;

grant execute on all functions in schema inv to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — the live order (row → remove → let-go re-assert): boundaries
-- ═══════════════════════════════════════════════════════════════════════════

-- 1.0 Baseline, nothing fails. Drop the only week → Inbox.
do $$
declare t uuid := inv.seed('1.0 baseline', 'week'); n int;
begin
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'inbox', null, null, null));                    perform inv.check(n = 1, '1.0 row');
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'));                     perform inv.check(n = 1, '1.0 remove');
  n := inv.step(inv.c_row(t, 'inbox', null, null, null));                    perform inv.check(n = 1, '1.0 re-assert');
  perform inv.as_admin();
  perform inv.show('1.0 after', t);
  perform inv.check(inv.row_cache(t) = 'inbox/-/-/-' and inv.consistent(t), '1.0 end state');
  perform inv.check(inv.events(t, 'removed') = 1, '1.0 one removed event');
  raise notice 'PASS 1.0: live order with no failure ends inbox, week removed, consistent';
end $$;

-- 1.1 Boundary: the ROW WRITE fails. dropCommitment returns before any op.
do $$
declare t uuid := inv.seed('1.1 row fails', 'week'); n int;
begin
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'inbox', null, null, null), 'row');
  perform inv.check(n = -1, '1.1 row write should fail');
  perform inv.as_admin();
  perform inv.show('1.1 after', t);
  perform inv.check(inv.row_cache(t) = 'week/2026-09-20/-/-' and inv.consistent(t), '1.1 DB must be untouched');
  raise notice 'PASS 1.1: row write fails → nothing written, DB consistent (client restores `before`)';
end $$;

-- 1.2 Boundary: row OK, REMOVE fails (the live 2026-09-25 case).
do $$
declare t uuid := inv.seed('1.2 remove fails', 'week'); n int; ev int;
begin
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'inbox', null, null, null));                    perform inv.check(n = 1, '1.2 row');
  -- Trigger fact: the tasks UPDATE to inbox ran tasks_mirror_to_commitments
  -- (bucket is in its column list) but it only ENSURES for week/month/quarter;
  -- it never closes a commitment. The week is still open right now.
  perform inv.as_admin();
  perform inv.check((select status from public.task_commitments where task_id = t and level = 'week') = 'open',
                    '1.2 a tasks UPDATE to inbox must not touch commitments');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'), 'remove:any');        perform inv.check(n = -1, '1.2 remove should fail');
  -- allOk = false → the let-go re-assert is skipped; reconcileCommitments re-reads.
  perform inv.check(inv.derive(t, 'inbox') = 'week/2026-09-20/-/-',
                    '1.2 partner''s re-read (RLS) derives week from records');
  perform inv.as_admin();
  perform inv.show('1.2 after failure', t);
  perform inv.check(inv.row_cache(t) = 'inbox/-/-/-', '1.2 row says inbox');
  perform inv.check(not inv.consistent(t), '1.2 split state expected');
  perform inv.check(inv.fresh_view(t) = 'in Inbox list=true; on period lists=week 2026-09-20',
                    '1.2 a fresh load shows it in the Inbox AND on the week');

  -- Nothing in the DB repairs it: an unrelated edit (title) fires no sync.
  perform inv.act_as(inv.who('partner'));
  update public.tasks set title = '1.2 renamed' where id = t;
  perform inv.as_admin();
  perform inv.check(not inv.consistent(t), '1.2 a title edit must not heal (no trigger re-derives)');

  -- Retry of the same client sequence, planned from the re-read (week open):
  -- planDropCommitment → ops [remove week], row inbox.
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'inbox', null, null, null));                    perform inv.check(n = 1, '1.2 retry row');
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'));                     perform inv.check(n = 1, '1.2 retry remove');
  n := inv.step(inv.c_row(t, 'inbox', null, null, null));                    perform inv.check(n = 1, '1.2 retry re-assert');
  -- A second (stale) retry is a no-op.
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'));                     perform inv.check(n = 0, '1.2 second remove is a no-op');
  perform inv.as_admin();
  perform inv.show('1.2 after retry', t);
  perform inv.check(inv.row_cache(t) = 'inbox/-/-/-' and inv.consistent(t), '1.2 retry converges');
  perform inv.check(inv.events(t, 'removed') = 1, '1.2 exactly one removed event across attempts');
  raise notice 'PASS 1.2: row ok + remove fails → row inbox while week open (split, persists until retry); retry converges';
end $$;

-- 1.2b Same boundary when another commitment remains (Drop the week, keep Sep).
do $$
declare t uuid := inv.seed('1.2b remove fails, month stays', 'week+month'); n int;
begin
  perform inv.act_as(inv.who('partner'));
  -- plan.row = deriveCache(month open) = month/-/Sep; not a let-go, no re-assert.
  n := inv.step(inv.c_row(t, 'month', null, '2026-09-01', null));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'), 'remove:any');        perform inv.check(n = -1, '1.2b remove should fail');
  perform inv.as_admin();
  perform inv.show('1.2b after failure', t);
  perform inv.check(inv.row_cache(t) = 'month/-/2026-09-01/-' and not inv.consistent(t), '1.2b split: row month, week open');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'month', null, '2026-09-01', null));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'));                     perform inv.check(n = 1, '1.2b retry remove');
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'month/-/2026-09-01/-' and inv.consistent(t), '1.2b retry converges');
  raise notice 'PASS 1.2b: with another commitment left the split is row month/week_start null vs week open; retry converges';
end $$;

-- 1.3 Boundary: remove OK, LET-GO RE-ASSERT fails (single commitment, Drop → Inbox).
do $$
declare t uuid := inv.seed('1.3 re-assert fails', 'week'); n int;
begin
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'inbox', null, null, null));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'));                     perform inv.check(n = 1, '1.3 remove');
  -- Trigger fact: the remove ran task_commitments_after_change (depth 1) →
  -- tasks_sync_from_commitments: no open commitment and bucket 'inbox' is a
  -- state it keeps → row stays inbox.
  n := inv.step(inv.c_row(t, 'inbox', null, null, null), 'row');             perform inv.check(n = -1, '1.3 re-assert should fail');
  perform inv.as_admin();
  perform inv.show('1.3 after', t);
  perform inv.check(inv.row_cache(t) = 'inbox/-/-/-' and inv.consistent(t), '1.3 harmless for a Drop');
  raise notice 'PASS 1.3: for a Drop the re-assert failing is harmless (sync already left the row inbox)';
end $$;

-- 1.3b Same boundary on a multi-commitment LET-GO to Someday (updateTask /
-- setBucket('someday'), same row-then-ops shape; ops = remove every open one).
do $$
declare t uuid := inv.seed('1.3b someday re-assert fails', 'week+month'); n int;
begin
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'someday', null, null, null));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'));
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'month/-/2026-09-01/-', '1.3b after 1st remove sync re-derives month');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_remove(t, 'month', '2026-09-01'));
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'inbox/-/-/-', '1.3b after 2nd remove sync falls back to inbox (someday lost)');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'someday', null, null, null), 'row');           perform inv.check(n = -1, '1.3b re-assert should fail');
  -- Client re-read keeps its LOCAL bucket as the base (reconcileCommitments
  -- merges records into tasksRef, whose bucket is plan.local's 'someday').
  perform inv.check(inv.derive(t, 'someday') = 'someday/-/-/-', '1.3b client shows someday');
  perform inv.as_admin();
  perform inv.show('1.3b after failure', t);
  perform inv.check(inv.row_cache(t) = 'inbox/-/-/-' and inv.consistent(t), '1.3b DB consistent but intent lost');
  -- Retry (Someday again): no open commitments → no ops, row someday.
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'someday', null, null, null));
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'someday/-/-/-' and inv.consistent(t), '1.3b retry converges to someday');
  raise notice 'PASS 1.3b: let-go re-assert failing leaves inbox instead of someday (client shows someday); retry converges';
end $$;

-- 1.4 Boundary: several removes, the SECOND fails (let-go to Someday).
do $$
declare t uuid := inv.seed('1.4 2nd remove fails', 'week+month'); n int;
begin
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'someday', null, null, null));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'));                     perform inv.check(n = 1, '1.4 first remove');
  n := inv.step(inv.c_remove(t, 'month', '2026-09-01'), 'remove:month');    perform inv.check(n = -1, '1.4 second remove should fail');
  -- re-assert skipped (allOk false)
  perform inv.check(inv.derive(t, 'someday') = 'month/-/2026-09-01/-', '1.4 client re-read derives month');
  perform inv.as_admin();
  perform inv.show('1.4 after failure', t);
  perform inv.check(inv.row_cache(t) = 'month/-/2026-09-01/-' and inv.consistent(t),
                    '1.4 the first remove''s sync already healed the row to month');
  -- Retry: ops [remove month], row someday, re-assert.
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'someday', null, null, null));
  n := inv.step(inv.c_remove(t, 'month', '2026-09-01'));                    perform inv.check(n = 1, '1.4 retry remove');
  n := inv.step(inv.c_row(t, 'someday', null, null, null));
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'someday/-/-/-' and inv.consistent(t), '1.4 retry converges');
  perform inv.check(inv.events(t, 'removed') = 2, '1.4 two removed events');
  raise notice 'PASS 1.4: a later remove failing is self-healed by the earlier remove''s sync (row = what is still open); retry converges';
end $$;

-- 1.5 A commitment write — even one that changes nothing — re-derives the row.
do $$
declare t uuid := inv.seed('1.5 touch heals', 'week'); n int;
begin
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'inbox', null, null, null));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'), 'remove:any');
  perform inv.as_admin();
  perform inv.check(not inv.consistent(t), '1.5 setup split');
  perform inv.act_as(inv.who('partner'));
  update public.task_commitments set status = status where task_id = t;   -- no-op UPDATE, trigger still fires
  get diagnostics n = row_count;
  perform inv.as_admin();
  perform inv.show('1.5 after touch', t);
  perform inv.check(n = 1 and inv.row_cache(t) = 'week/2026-09-20/-/-' and inv.consistent(t), '1.5 touch re-syncs the row');
  raise notice 'PASS 1.5: any commitment UPDATE runs tasks_sync_from_commitments — the row follows the records';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — candidate fixes
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) OPS FIRST, row write last (the row write doubles as the let-go re-assert).
do $$
declare t uuid; n int;
begin
  -- a1: remove fails → client stops before the row write.
  t := inv.seed('a1', 'week');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'), 'remove:any');        perform inv.check(n = -1, 'a1 remove fails');
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'week/2026-09-20/-/-' and inv.consistent(t), 'a1 nothing changed');

  -- a2: remove ok, row write fails → sync already wrote exactly plan.row.
  t := inv.seed('a2', 'week');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'));                     perform inv.check(n = 1, 'a2 remove');
  n := inv.step(inv.c_row(t, 'inbox', null, null, null), 'row');             perform inv.check(n = -1, 'a2 row fails');
  perform inv.as_admin();
  perform inv.show('a2 after', t);
  perform inv.check(inv.row_cache(t) = 'inbox/-/-/-' and inv.consistent(t), 'a2 sync produced the plan row');

  -- a3: Drop week keeping the month; row write fails → sync produced month/-/Sep = plan.row.
  t := inv.seed('a3', 'week+month');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'));
  n := inv.step(inv.c_row(t, 'month', null, '2026-09-01', null), 'row');
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'month/-/2026-09-01/-' and inv.consistent(t), 'a3 sync produced the plan row');

  -- a4: weekend task: sync never touches weekend_start → the row write IS needed for it.
  t := inv.seed('a4', 'week+weekend');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'));
  n := inv.step(inv.c_row(t, 'inbox', null, null, null, true), 'row');
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'inbox/-/-/-' and inv.consistent(t), 'a4 cache right');
  perform inv.check((select weekend_start from public.tasks where id = t) = date '2026-09-26', 'a4 weekend_start left behind');
  raise notice 'OBSERVE a4 | weekend_start still 2026-09-26 after the row write failed (sync ignores weekend_start)';
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'inbox', null, null, null, true));             -- retry of the row write alone
  perform inv.as_admin();
  perform inv.check((select weekend_start from public.tasks where id = t) is null, 'a4 retry clears weekend');

  -- a5: let-go Someday, 2nd remove fails → row month (consistent); no row write sent.
  t := inv.seed('a5', 'week+month');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'));
  n := inv.step(inv.c_remove(t, 'month', '2026-09-01'), 'remove:month');     perform inv.check(n = -1, 'a5 2nd remove fails');
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'month/-/2026-09-01/-' and inv.consistent(t), 'a5 consistent');
  -- retry: [remove month] then row someday
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_remove(t, 'month', '2026-09-01'));
  n := inv.step(inv.c_row(t, 'someday', null, null, null));
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'someday/-/-/-' and inv.consistent(t), 'a5 retry converges');

  -- a6: let-go Someday, both removes ok, final row write fails → inbox (someday lost), consistent.
  t := inv.seed('a6', 'week+month');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'));
  n := inv.step(inv.c_remove(t, 'month', '2026-09-01'));
  n := inv.step(inv.c_row(t, 'someday', null, null, null), 'row');
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'inbox/-/-/-' and inv.consistent(t), 'a6 inbox, consistent');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'someday', null, null, null));
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'someday/-/-/-' and inv.events(t, 'removed') = 2, 'a6 retry converges, 2 removed events');

  -- a7: full success, the explicit row write after the ops changes nothing and logs nothing.
  t := inv.seed('a7', 'week');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'));
  n := inv.step(inv.c_row(t, 'inbox', null, null, null));                    perform inv.check(n = 1, 'a7 row write ok');
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'inbox/-/-/-' and inv.events(t, 'removed') = 1
                    and (select count(*) from public.task_placement_events where task_id = t) = 2, 'a7 committed + removed only');
  raise notice 'PASS a: ops-first never leaves row and records disagreeing; only weekend_start / someday depend on the final row write';
end $$;

-- (b) Row first, COMPENSATE by writing `before` back when an op fails.
do $$
declare t uuid; n int;
begin
  -- b1: single remove fails, compensation succeeds → back to before, consistent.
  t := inv.seed('b1', 'week');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'inbox', null, null, null));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'), 'remove:any');
  n := inv.step(inv.c_row(t, 'week', '2026-09-20', null, null));            perform inv.check(n = 1, 'b1 compensation');
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'week/2026-09-20/-/-' and inv.consistent(t), 'b1 restored');

  -- b2: compensation fails too (same outage) → the split stays, exactly as today.
  t := inv.seed('b2', 'week');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'inbox', null, null, null));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'), 'remove:any');
  n := inv.step(inv.c_row(t, 'week', '2026-09-20', null, null), 'row');
  perform inv.as_admin();
  perform inv.check(not inv.consistent(t), 'b2 still split');

  -- b3: let-go, ops [remove week, remove month], month fails; compensate before (week/09-20/Sep).
  t := inv.seed('b3', 'week+month');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'someday', null, null, null));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'));
  n := inv.step(inv.c_remove(t, 'month', '2026-09-01'), 'remove:month');
  n := inv.step(inv.c_row(t, 'week', '2026-09-20', '2026-09-01', null));
  perform inv.as_admin();
  perform inv.show('b3 after compensation', t);
  -- tasks_mirror_to_commitments ensures the week (bucket week, stamps changed):
  -- ON CONFLICT reopens the removed week — silently (xmax<>0 → no 'committed' event).
  perform inv.check(inv.consistent(t) and inv.records(t) = 'month 2026-09-01 open, week 2026-09-20 open', 'b3 restored via the mirror');
  perform inv.check(inv.events(t, 'removed') = 1, 'b3 history says removed');
  perform inv.check(inv.events(t, 'committed') = 2, 'b3 the reopen logged no committed event (seed logged 2)');
  raise notice 'OBSERVE b3 | state restored, but the event log keeps a ''removed'' for a week that is open again (no matching event)';

  -- b4: same, ops in the other order [remove month, remove week], week fails.
  t := inv.seed('b4', 'week+month');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_row(t, 'someday', null, null, null));
  n := inv.step(inv.c_remove(t, 'month', '2026-09-01'));
  n := inv.step(inv.c_remove(t, 'week', '2026-09-20'), 'remove:week');
  n := inv.step(inv.c_row(t, 'week', '2026-09-20', '2026-09-01', null));
  perform inv.as_admin();
  perform inv.show('b4 after compensation', t);
  -- The mirror only ensures the BUCKET's level (week); the removed month is not reopened.
  perform inv.check(not inv.consistent(t), 'b4 compensation leaves month_start Sep with the month removed');
  raise notice 'PASS b: compensation fixes the single-op case only when it itself succeeds; with several ops it is order-dependent (b4 leaves a new split) and rewrites history (b3)';
end $$;

-- (c) ONE transactional RPC (ops, then row) — atomic.
do $$
declare t uuid; n int; before text; ops jsonb; r jsonb;
begin
  ops := '[{"op":"remove","level":"week","period_start":"2026-09-20"}]';
  r   := '{"bucket":"inbox","week_start":null,"month_start":null,"season_start":null}';

  -- c1: success as the household partner.
  t := inv.seed('c1', 'week');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_rpc(t, ops, r));                                       perform inv.check(n = 1, 'c1 rpc ok');
  -- c1b: a retry after a lost response is a no-op.
  n := inv.step(inv.c_rpc(t, ops, r));                                       perform inv.check(n = 1, 'c1 retry ok');
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'inbox/-/-/-' and inv.consistent(t) and inv.events(t, 'removed') = 1, 'c1 end state + idempotent');

  -- c2: the remove fails inside → nothing written.
  t := inv.seed('c2', 'week');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_rpc(t, ops, r), 'remove:any');                         perform inv.check(n = -1, 'c2 fails');
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'week/2026-09-20/-/-' and inv.records(t) = 'week 2026-09-20 open', 'c2 all rolled back');

  -- c3: the row write fails AFTER the remove ran → the remove is rolled back too.
  t := inv.seed('c3', 'week');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_rpc(t, ops, r), 'row');                                perform inv.check(n = -1, 'c3 fails');
  perform inv.as_admin();
  perform inv.check(inv.records(t) = 'week 2026-09-20 open' and inv.events(t, 'removed') = 0, 'c3 remove rolled back, no event');

  -- c4: let-go to Someday in one call — no re-assert needed.
  t := inv.seed('c4', 'week+month');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_rpc(t, '[{"op":"remove","level":"week","period_start":"2026-09-20"},{"op":"remove","level":"month","period_start":"2026-09-01"}]',
                          '{"bucket":"someday","week_start":null,"month_start":null,"season_start":null}'));
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) = 'someday/-/-/-' and inv.consistent(t) and inv.events(t, 'removed') = 2, 'c4 someday');

  -- c5: 2nd remove fails → the 1st is rolled back as well.
  t := inv.seed('c5', 'week+month');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_rpc(t, '[{"op":"remove","level":"week","period_start":"2026-09-20"},{"op":"remove","level":"month","period_start":"2026-09-01"}]',
                          '{"bucket":"someday","week_start":null,"month_start":null,"season_start":null}'), 'remove:month');
  perform inv.as_admin();
  perform inv.check(inv.records(t) = 'month 2026-09-01 open, week 2026-09-20 open' and inv.row_cache(t) = 'week/2026-09-20/2026-09-01/-', 'c5 untouched');

  -- c6: weekend reset in the same transaction.
  t := inv.seed('c6', 'week+weekend');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_rpc(t, ops, '{"bucket":"inbox","week_start":null,"month_start":null,"season_start":null,"weekend_start":null}'));
  perform inv.as_admin();
  perform inv.check((select weekend_start from public.tasks where id = t) is null and inv.consistent(t), 'c6 weekend cleared');

  -- c7: RLS — outsider (other household) is refused, nothing changes.
  t := inv.seed('c7', 'week');
  before := inv.row_cache(t) || inv.records(t);
  perform inv.act_as(inv.who('outsider'));
  n := inv.step(inv.c_rpc(t, ops, r));                                       perform inv.check(n = -1, 'c7 outsider refused');
  perform inv.as_admin();
  perform inv.check(inv.row_cache(t) || inv.records(t) = before, 'c7 unchanged');

  -- c8: RLS — partner on alex's INDIVIDUAL task is refused (scope decides).
  t := inv.seed('c8', 'week');
  update public.tasks set scope = 'individual' where id = t;
  perform inv.act_as(inv.who('partner'));
  n := inv.step(inv.c_rpc(t, ops, r));                                       perform inv.check(n = -1, 'c8 partner refused on individual');
  perform inv.as_admin();
  perform inv.check(inv.records(t) = 'week 2026-09-20 open', 'c8 unchanged');
  raise notice 'PASS c: the RPC is all-or-nothing at every boundary, idempotent on retry, and runs under the caller''s RLS';
end $$;

-- (d) Leave the order; rely on reconcile + retry. Evidence is Part 1:
-- 1.2 / 1.2b persist in the DB until a retry or another commitment write
-- (1.5); 1.3b diverges between client (someday) and DB (inbox) without the
-- client knowing; 1.4 is self-healed by the sync. Retries converge (1.2,
-- 1.2b, 1.3b, 1.4) with no duplicate rows or events. Nothing more to run.
do $$ begin raise notice 'PASS d: see 1.2–1.5 (split persists until retry; retries converge)'; end $$;
