-- 100_apply_task_placement.test.sql
-- Database-level proof for public.apply_task_placement
-- (supabase/migrations/2026-09-25_apply_task_placement.sql, PREPARED FOR
-- REVIEW, not applied anywhere shared).
--
-- LOCAL ONLY. Run by scripts/test-apply-task-placement-locally.sh against a
-- throwaway cluster loaded with supabase/tests/fixtures/planning_commitments_schema.sql
-- and then the migration file itself (byte-identical, psql -f). It commits
-- rows and adds test-only triggers; never point it at a shared database.
--
-- Shape: each contract is its own DO block (its own transaction). A pass ends
-- in NOTICE 'PASS <category> …'; a failure raises 'FAIL …'. 'OBSERVE …' lines
-- record facts worth reporting that are not pass/fail.
--
-- Acting: apt.act_as() sets role authenticated + request.jwt.claims (what a
-- PostgREST request carries); apt.as_admin() returns to the superuser for
-- setup and inspection. A failing RPC call is caught in a subtransaction
-- (apt.try); the runner separately proves top-level rollback, lost-response
-- retry and concurrency with real, separate psql sessions.
--
-- The control: apt.control() runs the same steps as the separate statements
-- the client sends today, in PostgREST's shape (PATCH names only the columns
-- it sends, via jsonb_populate_record; upsert = merge-duplicates on the
-- conflict key; focus upsert = ignoreDuplicates; deletes filtered by eq()).
--
-- Dates: week Sun 2026-09-20 → next Sun 2026-09-27; month 2026-09-01.

\set ON_ERROR_STOP 0

drop schema if exists apt cascade;
create schema apt;
grant usage on schema apt to authenticated, anon;

create table apt.people (name text primary key, id uuid not null);
insert into apt.people values
  ('alex',     'f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7'),
  ('partner',  '3431facd-dc33-41a1-b42d-f1a375eec505'),
  ('outsider', '4b8f6412-d067-449e-9c5e-2d31c22f8822');
grant select on apt.people to authenticated, anon;
create function apt.who(p text) returns uuid language sql stable as $$ select id from apt.people where name = p $$;

create function apt.act_as(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', apt.who(p_name), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function apt.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;
create function apt.as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function apt.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAIL %', p_msg; end if;
end $$;

-- Run SQL in a subtransaction; 'ok' or '<sqlstate> <message>'.
create function apt.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

create function apt.rpc_sql(t uuid, steps jsonb) returns text language sql immutable as $$
  select format('select public.apply_task_placement(%L::uuid, %L::jsonb)', t, steps) $$;

-- ── Fault injection (test-only) ────────────────────────────────────────────
-- apt.fail_at = N: the N-th depth-1 row trigger firing (a write the caller's
-- own statement makes — never the writes the live triggers make) raises.
-- apt.hits counts firings; apt.hitlog records table:op for each.
create function apt.fault() returns trigger language plpgsql as $$
declare
  f int := nullif(coalesce(current_setting('apt.fail_at', true), ''), '')::int;
  h int;
begin
  if f is null or pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  h := coalesce(nullif(current_setting('apt.hits', true), ''), '0')::int + 1;
  perform set_config('apt.hits', h::text, true);
  perform set_config('apt.hitlog', concat_ws(',', nullif(current_setting('apt.hitlog', true), ''), tg_table_name || ':' || tg_op), true);
  if h = f then
    raise exception 'injected 500 at write % (% %)', h, tg_table_name, tg_op;
  end if;
  return coalesce(new, old);
end $$;
create trigger aaa_apt_fault before update on public.tasks for each row execute function apt.fault();
create trigger aaa_apt_fault before insert or update or delete on public.task_commitments for each row execute function apt.fault();
create trigger aaa_apt_fault before insert or delete on public.task_focus for each row execute function apt.fault();

create function apt.arm(n int) returns void language plpgsql as $$
begin
  perform set_config('apt.fail_at', coalesce(n::text, ''), true);
  perform set_config('apt.hits', '0', true);
  perform set_config('apt.hitlog', '', true);
end $$;

-- ── The control: today's separate requests, PostgREST-shaped ───────────────
create function apt.control(t uuid, steps jsonb) returns void language plpgsql as $$
declare st jsonb; cols text;
begin
  for st in select * from jsonb_array_elements(steps) loop
    if st->>'t' = 'row' then
      -- PATCH: only the columns sent, values via jsonb_populate_record.
      select string_agg(format('%I = r.%I', k, k), ', ') into cols from jsonb_object_keys(st->'set') k;
      execute format('update public.tasks set %s from jsonb_populate_record(null::public.tasks, $1) r where public.tasks.id = $2', cols)
        using st->'set', t;
    elsif st->>'t' = 'ensure' then
      insert into public.task_commitments (task_id, level, period_start, status, ended_at, carried_to, created_by)
      values (t, st->>'level', (st->>'period_start')::date, 'open', null, null, auth.uid())
      on conflict (task_id, level, period_start) do update set
        task_id = excluded.task_id, level = excluded.level, period_start = excluded.period_start,
        status = excluded.status, ended_at = excluded.ended_at, carried_to = excluded.carried_to, created_by = excluded.created_by;
    elsif st->>'t' = 'remove' then
      update public.task_commitments set status = 'removed', ended_at = now()
       where task_id = t and level = st->>'level' and period_start = (st->>'period_start')::date and status = 'open';
    elsif st->>'t' = 'carry' then
      update public.task_commitments set status = 'carried', carried_to = (st->>'to')::date, ended_at = now()
       where task_id = t and level = st->>'level' and period_start = (st->>'period_start')::date and status = 'open';
    elsif st->>'t' = 'focus_set' then
      insert into public.task_focus (task_id, user_id, date)
      values (t, (st->>'user_id')::uuid, (st->>'date')::date)
      on conflict (task_id, user_id, date) do nothing;
    elsif st->>'t' = 'focus_clear' then
      if st->>'date' is null then
        delete from public.task_focus where task_id = t and user_id = (st->>'user_id')::uuid;
      else
        delete from public.task_focus where task_id = t and user_id = (st->>'user_id')::uuid and date = (st->>'date')::date;
      end if;
    else
      raise exception 'control: unknown step %', st;
    end if;
  end loop;
end $$;

-- ── Snapshots ──────────────────────────────────────────────────────────────
-- Normalised (for comparing two different tasks): the whole row minus
-- identity/timestamps, the records by content, the events in order.
create function apt.norm(t uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'row', (select to_jsonb(x) - 'id' - 'created_at' - 'updated_at' from public.tasks x where x.id = t),
    'commitments', coalesce((select jsonb_agg(jsonb_build_object('level', level, 'period_start', period_start, 'status', status,
        'carried_to', carried_to, 'created_by', created_by, 'ended', ended_at is not null) order by level, period_start)
      from public.task_commitments where task_id = t), '[]'),
    'focus', coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'date', date) order by user_id, date)
      from public.task_focus where task_id = t), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'by', by, 'from', from_value, 'to', to_value) order by id)
      from public.task_placement_events where task_id = t), '[]')) $$;

-- Exact (for before/after on one task): every column of every row, plus the
-- global row counts so a stray write to another task would show too.
create function apt.exact(t uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'row', (select to_jsonb(x) from public.tasks x where x.id = t),
    'commitments', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.task_commitments c where c.task_id = t), '[]'),
    'focus', coalesce((select jsonb_agg(to_jsonb(f) order by f.user_id, f.date) from public.task_focus f where f.task_id = t), '[]'),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.task_placement_events e where e.task_id = t), '[]'),
    'totals', jsonb_build_array((select count(*) from public.tasks), (select count(*) from public.task_commitments),
                                (select count(*) from public.task_focus), (select count(*) from public.task_placement_events))) $$;

create function apt.events(t uuid) returns int language sql stable as $$
  select count(*)::int from public.task_placement_events where task_id = t $$;

-- Row and records agree: for an undated task the cached stamps are the latest
-- OPEN commitment per level (tasks_sync_from_commitments' rule).
create function apt.consistent(t uuid) returns boolean language sql stable as $$
  select (x.scheduled_for is not null)
      or (x.week_start is not distinct from c.w and x.month_start is not distinct from c.m and x.season_start is not distinct from c.s)
  from public.tasks x,
       lateral (select max(period_start) filter (where level = 'week') w, max(period_start) filter (where level = 'month') m,
                       max(period_start) filter (where level = 'season') s
                  from public.task_commitments where task_id = x.id and status = 'open') c
  where x.id = t $$;

-- ── Starting states (created as alex, the owner) ───────────────────────────
--   week             bucket week 2026-09-20 (the mirror trigger opens its record)
--   week+month       + an open month 2026-09-01 record
--   week+month+focus + alex's focus on 2026-09-24
create function apt.setup(p_start text, p_scope text default 'couple') returns uuid language plpgsql as $$
declare t uuid;
begin
  perform apt.act_as('alex');
  insert into public.tasks (user_id, title, scope, bucket, week_start)
  values (apt.who('alex'), 'placement', p_scope, 'week', '2026-09-20') returning id into t;
  if p_start in ('week+month', 'week+month+focus') then
    insert into public.task_commitments (task_id, level, period_start, status, created_by)
    values (t, 'month', '2026-09-01', 'open', apt.who('alex'));
  end if;
  if p_start = 'week+month+focus' then
    insert into public.task_focus (task_id, user_id, date) values (t, apt.who('alex'), '2026-09-24');
  end if;
  perform apt.as_admin();
  return t;
end $$;

-- ── Scenarios: the saves the client sends as one call ──────────────────────
create table apt.scenarios (name text primary key, start text not null, actor text not null, steps jsonb not null, ord int);
insert into apt.scenarios values
  -- Drop (dropCommitment): ops, then the row (weekend reset included)
  ('drop', 'week+month', 'partner', '[
     {"t":"remove","level":"week","period_start":"2026-09-20"},
     {"t":"row","set":{"weekend_start":null,"bucket":"month","week_start":null,"month_start":"2026-09-01","season_start":null}}]', 1),
  -- Keep (keepForward): ensure the destination, carry the source, row last
  ('keep', 'week', 'partner', '[
     {"t":"ensure","level":"week","period_start":"2026-09-27"},
     {"t":"carry","level":"week","period_start":"2026-09-20","to":"2026-09-27"},
     {"t":"row","set":{"bucket":"week","week_start":"2026-09-27","month_start":null,"season_start":null}}]', 2),
  -- updateTask: choose a day (row first), then focus that day
  ('day', 'week', 'alex', '[
     {"t":"row","set":{"scheduled_for":"2026-09-24T13:00:00Z","is_all_day":true,"bucket":"timed","planned_on":"2026-09-24"}},
     {"t":"focus_set","user_id":"f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7","date":"2026-09-24"}]', 3),
  -- updateTask let-go to Someday with two open records: row, remove, remove,
  -- row re-assert, then clear the day's focus
  ('letgo', 'week+month+focus', 'alex', '[
     {"t":"row","set":{"bucket":"someday","week_start":null,"month_start":null,"season_start":null}},
     {"t":"remove","level":"week","period_start":"2026-09-20"},
     {"t":"remove","level":"month","period_start":"2026-09-01"},
     {"t":"row","set":{"bucket":"someday","week_start":null,"month_start":null,"season_start":null}},
     {"t":"focus_clear","user_id":"f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7","date":null}]', 4),
  -- updateTask push with deferral bookkeeping (defer_count / deferred_until /
  -- week_deferred_at), row first, then carry
  ('push', 'week', 'partner', '[
     {"t":"row","set":{"bucket":"week","week_start":"2026-09-27","defer_count":3,"deferred_until":"2026-09-27T04:00:00Z","week_deferred_at":"2026-09-25T15:00:00Z"}},
     {"t":"carry","level":"week","period_start":"2026-09-20","to":"2026-09-27"}]', 5),
  -- updateTask clearing the bookkeeping + a weekend stamp, then partner focus
  ('clear', 'week', 'partner', '[
     {"t":"row","set":{"defer_count":0,"deferred_until":null,"week_deferred_at":null,"planned_on":null,"weekend_start":"2026-09-26"}},
     {"t":"focus_set","user_id":"3431facd-dc33-41a1-b42d-f1a375eec505","date":"2026-09-25"}]', 6);

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Success parity: RPC task vs control task driven step by step
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare sc record; t1 uuid; t2 uuid; a jsonb; b jsonb; i int := 0;
begin
  for sc in select * from apt.scenarios order by ord loop
    i := i + 1;
    t1 := apt.setup(sc.start);
    t2 := apt.setup(sc.start);
    perform apt.act_as(sc.actor);
    perform public.apply_task_placement(t1, sc.steps);
    perform apt.control(t2, sc.steps);
    perform apt.as_admin();
    a := apt.norm(t1); b := apt.norm(t2);
    perform apt.check(a = b, format('parity %s: rpc %s <> control %s', sc.name, a, b));
    perform apt.check(apt.consistent(t1), format('parity %s: row and records disagree %s', sc.name, a));
    raise notice 'PASS parity %: % (%) — rpc = separate statements (row, % records, % focus, % events)',
      i, sc.name, sc.actor, jsonb_array_length(a->'commitments'), jsonb_array_length(a->'focus'), jsonb_array_length(a->'events');
  end loop;
end $$;

-- The RPC's return value is the row's placement cache.
do $$
declare t uuid; r jsonb; st jsonb := (select steps from apt.scenarios where name = 'keep');
begin
  t := apt.setup('week');
  perform apt.act_as('partner');
  r := public.apply_task_placement(t, st);
  perform apt.as_admin();
  perform apt.check(r->>'bucket' = 'week' and r->>'week_start' = '2026-09-27', 'return value ' || r::text);
  raise notice 'PASS parity 7: return value carries the saved cache (%); planned_on / defer_* are not in it', r;
end $$;

-- Fidelity probe A: the RPC's UPDATE names ALL eleven columns, so every
-- "BEFORE/AFTER UPDATE OF <col>" trigger fires on each row step even when
-- the step did not name that column. A PATCH names only what it sends.
-- tasks_fill_period_stamps (UPDATE OF bucket) is the only one that acts on
-- that difference: a period-bucket row with NO stamp, patched with an
-- unrelated placement column (planned_on).
do $$
declare t1 uuid; t2 uuid; a jsonb; b jsonb; steps jsonb := '[{"t":"row","set":{"planned_on":"2026-09-24"}}]';
begin
  t1 := apt.setup('week'); t2 := apt.setup('week');
  -- Probe state: bucket 'month', NO month_start, no open record (a legacy
  -- row, or a PATCH that nulled the stamp without naming bucket). Reached as
  -- admin with the stamp-filling trigger briefly off.
  update public.task_commitments set status = 'removed' where task_id in (t1, t2);
  alter table public.tasks disable trigger tasks_fill_period_stamps;
  update public.tasks set bucket = 'month', week_start = null, month_start = null, season_start = null where id in (t1, t2);
  alter table public.tasks enable trigger tasks_fill_period_stamps;
  perform apt.check((select bool_and(bucket = 'month' and month_start is null) from public.tasks where id in (t1, t2)), 'probe state');
  perform apt.act_as('alex');
  perform public.apply_task_placement(t1, steps);
  perform apt.control(t2, steps);
  perform apt.as_admin();
  a := apt.norm(t1); b := apt.norm(t2);
  if a = b then
    raise notice 'PASS parity 8: UPDATE-OF probe — no divergence';
  else
    raise notice 'OBSERVE parity-divergence: row step {planned_on} on bucket=month/month_start=null — rpc row=% | PATCH row=% | rpc open records=% | PATCH open records=% | rpc events=% | PATCH events=%',
      (select jsonb_build_object('bucket', bucket, 'month_start', month_start) from public.tasks where id = t1),
      (select jsonb_build_object('bucket', bucket, 'month_start', month_start) from public.tasks where id = t2),
      (select count(*) from public.task_commitments where task_id = t1 and status = 'open'),
      (select count(*) from public.task_commitments where task_id = t2 and status = 'open'),
      jsonb_array_length(a->'events'), jsonb_array_length(b->'events');
    raise notice 'PASS parity 8: UPDATE-OF probe characterised (divergence reported above, not a failure)';
  end if;
end $$;

-- Fidelity probe B: defer_count null. The RPC coalesces to 0; a PATCH writes
-- NULL. The client never sends null (updateTask: deferCount ?? 0).
do $$
declare t1 uuid; t2 uuid; steps jsonb := '[{"t":"row","set":{"defer_count":null}}]'; a int; b int;
begin
  t1 := apt.setup('week'); t2 := apt.setup('week');
  perform apt.act_as('alex');
  perform public.apply_task_placement(t1, steps);
  perform apt.control(t2, steps);
  perform apt.as_admin();
  select defer_count into a from public.tasks where id = t1;
  select defer_count into b from public.tasks where id = t2;
  perform apt.check(a = 0, 'defer_count null → 0 in rpc');
  raise notice 'OBSERVE parity-divergence: {defer_count:null} → rpc % / PATCH % (by design; client sends ?? 0)', a, coalesce(b::text, 'NULL');
  raise notice 'PASS parity 9: defer_count null coalesces to 0 as the migration states';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Rollback: a fault at EVERY write position leaves nothing behind
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare sc record; t uuid; tc uuid; n int; log text; before jsonb; after jsonb; r text; k int; total int := 0; s int := 0;
begin
  for sc in select * from apt.scenarios order by ord loop
    s := s + 1;
    -- Count the write positions on a twin (a clean, armed-but-never-firing run).
    tc := apt.setup(sc.start);
    perform apt.act_as(sc.actor);
    perform apt.arm(0);
    perform public.apply_task_placement(tc, sc.steps);
    n := current_setting('apt.hits')::int; log := current_setting('apt.hitlog');
    perform apt.arm(null);
    perform apt.as_admin();
    perform apt.check(n >= jsonb_array_length(sc.steps),
      format('rollback %s: only %s write positions for %s steps', sc.name, n, jsonb_array_length(sc.steps)));

    t := apt.setup(sc.start);
    for k in 1..n loop
      before := apt.exact(t);
      perform apt.act_as(sc.actor);
      perform apt.arm(k);
      r := apt.try(apt.rpc_sql(t, sc.steps));
      perform apt.arm(null);
      perform apt.as_admin();
      after := apt.exact(t);
      perform apt.check(r like 'P0001 injected 500 at write ' || k || ' %', format('rollback %s@%s: expected injected failure, got %s', sc.name, k, r));
      perform apt.check(after = before, format('rollback %s@%s: state changed %s → %s', sc.name, k, before, after));
      total := total + 1;
    end loop;
    -- The untouched task still saves cleanly and matches the twin.
    perform apt.act_as(sc.actor);
    perform public.apply_task_placement(t, sc.steps);
    perform apt.as_admin();
    perform apt.check(apt.norm(t) - 'events' = apt.norm(tc) - 'events', format('rollback %s: clean save after faults differs from twin', sc.name));
    raise notice 'PASS rollback %: % — % steps, % write positions [%], each fault → row/records/focus/events exactly as before', s, sc.name, jsonb_array_length(sc.steps), n, log;
  end loop;
  raise notice 'OBSERVE rollback: % injected faults in total, all rolled back', total;
end $$;

-- Validation failure AFTER earlier steps wrote: the whole call rolls back.
do $$
declare t uuid; before jsonb; r text;
begin
  t := apt.setup('week+month+focus');
  before := apt.exact(t);
  perform apt.act_as('alex');
  r := apt.try(apt.rpc_sql(t, '[
    {"t":"row","set":{"bucket":"someday","week_start":null,"month_start":null,"season_start":null}},
    {"t":"remove","level":"week","period_start":"2026-09-20"},
    {"t":"focus_clear","user_id":"f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7","date":null},
    {"t":"ensure","level":"year","period_start":"2026-01-01"}]'));
  perform apt.as_admin();
  perform apt.check(r like '22023 %', 'late bad step: ' || r);
  perform apt.check(apt.exact(t) = before, 'late bad step left writes');
  raise notice 'PASS rollback 7: a bad 4th step undoes the row, remove and focus_clear already run (%)', r;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Retry / idempotency (same transaction pair; the runner repeats this
--    across real separate sessions for the lost-response case)
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare sc record; t uuid; once jsonb; twice jsonb; e1 int; e2 int; i int := 0; c1 int; c2 int; f1 int; f2 int;
begin
  for sc in select * from apt.scenarios order by ord loop
    i := i + 1;
    t := apt.setup(sc.start);
    e1 := apt.events(t);
    perform apt.act_as(sc.actor);
    perform public.apply_task_placement(t, sc.steps);
    perform apt.as_admin();
    once := apt.norm(t); e2 := apt.events(t);
    select count(*) into c1 from public.task_commitments where task_id = t;
    select count(*) into f1 from public.task_focus where task_id = t;
    perform apt.act_as(sc.actor);
    perform public.apply_task_placement(t, sc.steps);
    perform apt.as_admin();
    twice := apt.norm(t);
    select count(*) into c2 from public.task_commitments where task_id = t;
    select count(*) into f2 from public.task_focus where task_id = t;
    perform apt.check((once - 'events') = (twice - 'events'), format('retry %s: state moved %s → %s', sc.name, once, twice));
    perform apt.check(c1 = c2 and f1 = f2, format('retry %s: records %s→%s focus %s→%s', sc.name, c1, c2, f1, f2));
    perform apt.check(apt.events(t) = e2, format('retry %s: the retry logged %s more events', sc.name, apt.events(t) - e2));
    raise notice 'PASS retry %: % twice = once; % records, % focus; one call logs % events [%], the retry logs 0',
      i, sc.name, c2, f2, e2 - e1,
      (select string_agg(kind, ',' order by id) from public.task_placement_events where task_id = t and id > (select coalesce(max(id), 0) from public.task_placement_events where task_id = t) - (e2 - e1));
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Ownership, RLS and input validation
-- ════════════════════════════════════════════════════════════════════════════
-- Each case: act, call, expect a SQLSTATE, and nothing written anywhere.
create function apt.expect_reject(p_n int, p_label text, p_actor text, t uuid, p_steps jsonb, p_state text, p_sql text default null)
returns void language plpgsql as $$
declare before jsonb; r text;
begin
  before := apt.exact(t);
  if p_actor = 'anon' then perform apt.act_as_anon(); else perform apt.act_as(p_actor); end if;
  r := apt.try(coalesce(p_sql, apt.rpc_sql(t, p_steps)));
  perform apt.as_admin();
  perform apt.check(r like p_state || ' %', format('%s: expected %s, got %s', p_label, p_state, r));
  perform apt.check(apt.exact(t) = before, format('%s: something was written', p_label));
  raise notice 'PASS security %: % → % (nothing written)', p_n, p_label, r;
end $$;

do $$
declare couple uuid; private uuid; t uuid; r text; drop_steps jsonb := (select steps from apt.scenarios where name = 'drop');
  thirty_three jsonb; thirty_two jsonb;
begin
  couple := apt.setup('week+month');
  private := apt.setup('week+month', 'individual');

  perform apt.expect_reject(1, 'outsider on a couple task', 'outsider', couple, drop_steps, '42501');
  perform apt.expect_reject(2, 'partner on alex''s individual task', 'partner', private, drop_steps, '42501');
  perform apt.expect_reject(3, 'anon role', 'anon', couple, drop_steps, '42501');
  perform apt.expect_reject(4, 'nonexistent task', 'alex', gen_random_uuid(), drop_steps, '42501');

  -- partner on the couple task is allowed (and the owner on the private one)
  perform apt.act_as('partner');
  r := apt.try(apt.rpc_sql(couple, drop_steps));
  perform apt.as_admin();
  perform apt.check(r = 'ok', 'partner on couple: ' || r);
  perform apt.check((select bucket from public.tasks where id = couple) = 'month', 'partner drop did not land');
  raise notice 'PASS security 5: partner on a couple task → allowed, saved';
  perform apt.act_as('alex');
  r := apt.try(apt.rpc_sql(private, drop_steps));
  perform apt.as_admin();
  perform apt.check(r = 'ok', 'owner on private: ' || r);
  raise notice 'PASS security 6: owner on an individual task → allowed';

  -- Non-placement columns, alone and after a valid step
  t := apt.setup('week');
  perform apt.expect_reject(7,  'row sets title',   'alex', t, '[{"t":"row","set":{"title":"pwned"}}]', '22023');
  perform apt.expect_reject(8,  'row sets user_id', 'alex', t, '[{"t":"row","set":{"user_id":"4b8f6412-d067-449e-9c5e-2d31c22f8822"}}]', '22023');
  perform apt.expect_reject(9,  'row sets scope',   'partner', t, '[{"t":"row","set":{"scope":"individual"}}]', '22023');
  perform apt.expect_reject(10, 'row sets completed after a valid step', 'alex', t,
    '[{"t":"ensure","level":"week","period_start":"2026-09-27"},{"t":"row","set":{"bucket":"week","completed":true}}]', '22023');
  perform apt.expect_reject(11, 'row sets id', 'alex', t, '[{"t":"row","set":{"id":"00000000-0000-0000-0000-000000000000"}}]', '22023');
  -- The three bookkeeping columns ARE accepted
  perform apt.act_as('alex');
  r := apt.try(apt.rpc_sql(t, '[{"t":"row","set":{"defer_count":2,"deferred_until":"2026-09-30T00:00:00Z","week_deferred_at":"2026-09-25T00:00:00Z"}}]'));
  perform apt.as_admin();
  perform apt.check(r = 'ok' and (select defer_count = 2 and deferred_until = '2026-09-30T00:00:00Z' and week_deferred_at = '2026-09-25T00:00:00Z' from public.tasks where id = t),
    'defer columns: ' || r);
  raise notice 'PASS security 12: defer_count / deferred_until / week_deferred_at accepted and written';

  -- Malformed steps
  perform apt.expect_reject(13, 'bad level',            'alex', t, '[{"t":"ensure","level":"year","period_start":"2026-01-01"}]', '22023');
  perform apt.expect_reject(14, 'missing period_start', 'alex', t, '[{"t":"remove","level":"week"}]', '22023');
  perform apt.expect_reject(15, 'unknown kind',         'alex', t, '[{"t":"nuke"}]', '22023');
  perform apt.expect_reject(16, 'missing kind',         'alex', t, '[{"level":"week","period_start":"2026-09-20"}]', '22023');
  perform apt.expect_reject(17, 'steps not an array',   'alex', t, '{"t":"row","set":{"bucket":"inbox"}}', '22023');
  perform apt.expect_reject(18, 'steps null',           'alex', t, null, '22023',
    format('select public.apply_task_placement(%L::uuid, null)', t));
  perform apt.expect_reject(19, 'step not an object',   'alex', t, '["row"]', '22023');
  perform apt.expect_reject(20, 'row without set',      'alex', t, '[{"t":"row"}]', '22023');
  perform apt.expect_reject(21, 'row set not an object','alex', t, '[{"t":"row","set":["bucket"]}]', '22023');
  perform apt.expect_reject(22, 'carry without to',     'alex', t, '[{"t":"carry","level":"week","period_start":"2026-09-20"}]', '22023');
  select jsonb_agg('{"t":"ensure","level":"week","period_start":"2026-09-20"}'::jsonb) into thirty_three from generate_series(1, 33);
  select jsonb_agg('{"t":"ensure","level":"week","period_start":"2026-09-20"}'::jsonb) into thirty_two from generate_series(1, 32);
  perform apt.expect_reject(23, '33 steps',             'alex', t, thirty_three, '22023');
  perform apt.expect_reject(24, 'null task id',         'alex', t, null, '22023',
    'select public.apply_task_placement(null, ''[]''::jsonb)');
  perform apt.expect_reject(25, 'unparseable date',     'alex', t, '[{"t":"ensure","level":"week","period_start":"not-a-date"}]', '22007');
  perform apt.expect_reject(26, 'impossible date',      'alex', t, '[{"t":"ensure","level":"week","period_start":"2026-02-30"}]', '22008');
  perform apt.expect_reject(27, 'bad carry-to date',    'alex', t, '[{"t":"carry","level":"week","period_start":"2026-09-20","to":"someday"}]', '22007');
  perform apt.expect_reject(28, 'bad timestamptz',      'alex', t, '[{"t":"row","set":{"scheduled_for":"tomorrow-ish"}}]', '22007');
  perform apt.expect_reject(29, 'bad boolean',          'alex', t, '[{"t":"row","set":{"is_all_day":"maybe"}}]', '22P02');
  perform apt.expect_reject(30, 'bad focus uuid',       'alex', t, '[{"t":"focus_set","user_id":"me","date":"2026-09-25"}]', '22P02');
  perform apt.expect_reject(31, 'focus for another person (RLS)', 'partner', t,
    '[{"t":"ensure","level":"week","period_start":"2026-09-27"},{"t":"focus_set","user_id":"f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7","date":"2026-09-25"}]', '42501');
  perform apt.expect_reject(32, 'bad weekend (CHECK: Saturday)', 'alex', t, '[{"t":"row","set":{"weekend_start":"2026-09-27"}}]', '23514');
  perform apt.act_as('alex');
  r := apt.try(apt.rpc_sql(t, thirty_two));
  perform apt.as_admin();
  perform apt.check(r = 'ok', '32 steps: ' || r);
  raise notice 'PASS security 33: exactly 32 steps accepted';

  -- Injection-shaped values are data
  t := apt.setup('week');
  perform apt.expect_reject(34, 'injection in period_start', 'alex', t,
    '[{"t":"ensure","level":"week","period_start":"2026-09-20''); drop table public.task_commitments; --"}]', '22007');
  perform apt.expect_reject(35, 'injection in level', 'alex', t,
    '[{"t":"remove","level":"week'' or ''1''=''1","period_start":"2026-09-20"}]', '22023');
  perform apt.expect_reject(36, 'injection in a column key', 'alex', t,
    '[{"t":"row","set":{"bucket = ''x''; drop table public.tasks; --":"x"}}]', '22023');
  perform apt.expect_reject(37, 'injection in user_id', 'alex', t,
    '[{"t":"focus_clear","user_id":"''; delete from public.task_focus; --","date":null}]', '22P02');
  perform apt.act_as('alex');
  r := apt.try(apt.rpc_sql(t, '[{"t":"row","set":{"bucket":"someday''; drop table public.tasks; --"}}]'));
  perform apt.as_admin();
  perform apt.check(r = 'ok' and (select bucket from public.tasks where id = t) = 'someday''; drop table public.tasks; --',
    'injection bucket: ' || r);
  perform apt.check(to_regclass('public.tasks') is not null and to_regclass('public.task_commitments') is not null
    and to_regclass('public.task_focus') is not null, 'a table vanished');
  raise notice 'PASS security 38: an injection-shaped bucket is stored verbatim as data (bucket has no CHECK — same as a PATCH); every table intact';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Function pinning and grants, from the catalog
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare p record;
begin
  select prosecdef, proconfig, provolatile, proacl into p from pg_proc
   where oid = 'public.apply_task_placement(uuid, jsonb)'::regprocedure;
  perform apt.check(p.prosecdef = false, 'prosecdef');
  raise notice 'PASS pinning 1: SECURITY INVOKER (prosecdef = false)';
  perform apt.check(p.proconfig = array['search_path=public, pg_temp'], 'proconfig ' || coalesce(p.proconfig::text, 'NULL'));
  raise notice 'PASS pinning 2: search_path pinned (proconfig = %)', p.proconfig;
  perform apt.check(not has_function_privilege('anon', 'public.apply_task_placement(uuid, jsonb)', 'execute'), 'anon can execute');
  perform apt.check(has_function_privilege('authenticated', 'public.apply_task_placement(uuid, jsonb)', 'execute'), 'authenticated cannot execute');
  perform apt.check(not exists (select 1 from aclexplode(p.proacl) where grantee = 0), 'PUBLIC can execute');
  raise notice 'PASS pinning 3: EXECUTE — authenticated yes, anon no, PUBLIC no (acl %)', p.proacl;
  raise notice 'OBSERVE pinning: service_role execute = % (from Supabase default privileges, simulated by the runner)',
    has_function_privilege('service_role', 'public.apply_task_placement(uuid, jsonb)', 'execute');
end $$;
