-- 099_keep_update_order.investigation.sql
-- INVESTIGATION, not a regression suite. Run by
-- scripts/investigate-keep-update-order.sh against a throwaway local Postgres
-- 17 loaded with supabase/tests/fixtures/planning_commitments_schema.sql (the
-- live tasks / task_commitments / task_focus schema, triggers and RLS,
-- 2026-09-25). It commits rows and creates test-only functions in schema
-- `inv`; never point it at a shared database.
--
-- Question: Drop was reordered to "commitment ops first, row write last, skip
-- the row when an op failed" (097, option a). Is the same order safe for
-- keepForward (keepOne) and for updateTask's placement path, whose plans also
-- move the DAY (scheduled_for / is_all_day), the weekend and focus?
--
-- Each scenario's requests are transcribed from the plans the app computes.
-- They were printed by running src/lib/placement/intentions.ts (planKeep /
-- planPlacement) under TZ=America/New_York with now = 2026-09-25 (see the
-- write-up), then mapped to the columns useSupabaseTasks.ts sends:
--   keepOne:        PATCH tasks {weekend_start?, bucket, week/month/season_start}
--                   then writePlacementOps (carry, ensure; focus none)
--   updateTask:     PATCH tasks {every plan.row key} then writePlacementOps
--                   (commitment ops, let-go re-assert, focus ops)
--
-- Two client policies are driven over the SAME request list:
--   current    row first; a failed row write stops everything; every
--              commitment op is attempted even after one fails; the let-go
--              re-assert only when all ops succeeded; focus ops attempted.
--   candidate  commitment ops (all attempted), then focus ops, then the row
--              ONLY if every op succeeded (dropCommitment's shape today).
--              Two op orders: A = the order the planner emits; B = every
--              `ensure` moved before the `carry` / `remove` ops.
--   candidate-C  B's order, but the client sends NOTHING after the first
--              failed request (writeCommitmentOps today attempts every op).
--
-- Every boundary: request i FAILS (rolled back — a 500 / never arrived), is
-- LOST (committed, but the client sees an error and takes the failure path),
-- or the network goes DOWN at i (request i and every later one fail).
-- After each, the DB state and anomaly flags are recorded; then the client's
-- retry (the same request list resent — see the write-up for why that equals
-- a re-plan from the re-read) runs and is compared to the no-failure result.
--
-- Output: 'TRACE' (state after each request of a no-failure run: what other
-- readers see between requests), 'RESULT' (one boundary), 'OBSERVE', and
-- 'PASS n: …' per block; a failed assertion raises 'FAIL …'.
-- Actor: partner (same household) on alex's couple-scope task, as role
-- authenticated under the live RLS. Focus rows are the partner's.
-- Dates: W0 2026-09-13, W1 2026-09-20, W2 2026-09-27 (Sundays); Sep/Oct
-- month starts; Fall 2026-09-01, Winter 2026-12-01 (default seasons);
-- day = midnight America/New_York.

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

-- ── One client request, in its own subtransaction ──────────────────────────
-- mode ''     → runs; returns the row count
-- mode 'fail' → runs, then raises: rolled back entirely (500 / never arrived) → -1
-- mode 'lost' → runs and commits, but the client is told it failed → -2
create function inv.step(p_call text, p_mode text default '') returns int language plpgsql as $$
declare n int;
begin
  begin
    execute 'select ' || p_call into n;
    if p_mode = 'fail' then raise exception 'injected 500'; end if;
  exception when others then
    if sqlerrm <> 'injected 500' then raise notice 'OBSERVE   request error: % → %', p_call, sqlerrm; end if;
    return -1;
  end;
  if p_mode = 'lost' then return -2; end if;
  return n;
end $$;

-- ── Client writes, transcribed ─────────────────────────────────────────────
-- PATCH tasks with exactly the keys the client names (PostgREST sends only
-- those columns; UPDATE OF triggers fire on the named columns).
create function inv.row_set(p_task uuid, p_row jsonb) returns int language plpgsql as $$
declare sets text; n int;
begin
  select string_agg(format('%I = ($1->>%L)::%s', k, k,
           case k when 'bucket' then 'text' when 'scheduled_for' then 'timestamptz'
                  when 'is_all_day' then 'boolean' when 'defer_count' then 'int' else 'date' end), ', ')
    into sets from jsonb_object_keys(p_row) k;
  execute format('update public.tasks set %s where id = $2', sets) using p_row, p_task;
  get diagnostics n = row_count;
  return n;
end $$;

-- writeCommitmentOps (useSupabaseTasks.ts writeCommitmentOps)
create function inv.op_ensure(p_task uuid, p_level text, p_start date) returns int language plpgsql as $$
begin
  insert into public.task_commitments (task_id, level, period_start, status, ended_at, carried_to, created_by)
  values (p_task, p_level, p_start, 'open', null, null, auth.uid())
  on conflict (task_id, level, period_start) do update set
    status = excluded.status, ended_at = excluded.ended_at, carried_to = excluded.carried_to, created_by = excluded.created_by;
  return 1;
end $$;
create function inv.op_remove(p_task uuid, p_level text, p_start date) returns int language plpgsql as $$
declare n int;
begin
  update public.task_commitments set status = 'removed', ended_at = now()
   where task_id = p_task and level = p_level and period_start = p_start and status = 'open';
  get diagnostics n = row_count; return n;
end $$;
create function inv.op_carry(p_task uuid, p_level text, p_start date, p_to date) returns int language plpgsql as $$
declare n int;
begin
  update public.task_commitments set status = 'carried', carried_to = p_to, ended_at = now()
   where task_id = p_task and level = p_level and period_start = p_start and status = 'open';
  get diagnostics n = row_count; return n;
end $$;
-- focus 'set': upsert with ignoreDuplicates → INSERT … ON CONFLICT DO NOTHING
create function inv.focus_set(p_task uuid, p_date date) returns int language plpgsql as $$
declare n int;
begin
  insert into public.task_focus (task_id, user_id, date) values (p_task, auth.uid(), p_date)
  on conflict (task_id, user_id, date) do nothing;
  get diagnostics n = row_count; return n;
end $$;
-- the same upsert WITHOUT ignoreDuplicates (merge-duplicates → DO UPDATE)
create function inv.focus_merge(p_task uuid, p_date date) returns int language plpgsql as $$
declare n int;
begin
  insert into public.task_focus (task_id, user_id, date) values (p_task, auth.uid(), p_date)
  on conflict (task_id, user_id, date) do update set date = excluded.date;
  get diagnostics n = row_count; return n;
end $$;
-- focus 'clear': delete my rows (one date, or all when p_date is null)
create function inv.focus_clear(p_task uuid, p_date date, p_user uuid default null) returns int language plpgsql as $$
declare n int;
begin
  delete from public.task_focus where task_id = p_task and user_id = coalesce(p_user, auth.uid())
     and (p_date is null or date = p_date);
  get diagnostics n = row_count; return n;
end $$;

-- ── Inspection ─────────────────────────────────────────────────────────────
create function inv.fmt(b text, w date, m date, s date) returns text language sql immutable as $$
  select concat_ws('/', b, coalesce(w::text, '-'), coalesce(m::text, '-'), coalesce(s::text, '-')) $$;
create function inv.day(t uuid) returns date language sql stable as $$
  select (scheduled_for at time zone 'America/New_York')::date from public.tasks where id = t $$;
create function inv.row_cache(t uuid) returns text language sql stable as $$
  select inv.fmt(bucket, week_start, month_start, season_start) from public.tasks where id = t $$;
-- tasks_sync_from_commitments' rule (= deriveCache), with the row's own bucket as base.
create function inv.derive(t uuid) returns text language plpgsql stable as $$
declare w date; m date; s date; sch timestamptz; b0 text;
begin
  select scheduled_for, bucket into sch, b0 from public.tasks where id = t;
  select max(period_start) filter (where level = 'week'), max(period_start) filter (where level = 'month'),
         max(period_start) filter (where level = 'season')
    into w, m, s from public.task_commitments where task_id = t and status = 'open';
  if sch is not null then return inv.fmt('timed', public.week_start_of((sch at time zone 'America/New_York')::date), m, s); end if;
  return inv.fmt(case when w is not null then 'week' when m is not null then 'month' when s is not null then 'quarter'
                      when b0 in ('inbox', 'someday') then b0 else 'inbox' end, w, m, s);
end $$;
create function inv.consistent(t uuid) returns boolean language sql stable as $$ select inv.row_cache(t) = inv.derive(t) $$;

create function inv.records(t uuid) returns text language sql stable as $$
  select coalesce(string_agg(level || ' ' || period_start || ' ' || status
                             || coalesce('→' || carried_to, ''), ', ' order by level, period_start), '(none)')
    from public.task_commitments where task_id = t $$;
create function inv.focus(t uuid) returns text language sql stable as $$
  select coalesce(string_agg(p.name || ' ' || f.date, ', ' order by p.name, f.date), '(none)')
    from public.task_focus f join inv.people p on p.id = f.user_id where f.task_id = t $$;
create function inv.state(t uuid) returns text language sql stable as $$
  select format('row=%s day=%s allday=%s wkend=%s | records=[%s] | focus=[%s]',
                inv.row_cache(t), coalesce(inv.day(t)::text, '-'), coalesce(is_all_day::text, '-'),
                coalesce(weekend_start::text, '-'), inv.records(t), inv.focus(t))
    from public.tasks where id = t $$;
create function inv.events(t uuid) returns text language sql stable as $$
  select coalesce(string_agg(kind || ':' || n, ' ' order by kind), '(none)')
    from (select kind, count(*) n from public.task_placement_events where task_id = t group by kind) e $$;

-- Anomalies a reader can see.
--   SPLIT          the row is not what the open records imply (097's bug class)
--   two-open-L     two open commitments at one level: on two lists at once
--   day∉open-week  dated, but the open week commitment is a different week
--   weekend∉week   weekend_start outside the row's week
--   carried→none   a carried commitment whose destination is not open/done
create function inv.flags(t uuid) returns text language plpgsql stable as $$
declare f text[] := '{}'; r record; ow date; d date;
begin
  if not inv.consistent(t) then f := f || ('SPLIT(derive=' || inv.derive(t) || ')'); end if;
  for r in select level from public.task_commitments where task_id = t and status = 'open' group by level having count(*) > 1 loop
    f := f || ('two-open-' || r.level);
  end loop;
  d := inv.day(t);
  select max(period_start) into ow from public.task_commitments where task_id = t and status = 'open' and level = 'week';
  if d is not null and ow is not null and public.week_start_of(d) <> ow then f := f || ('day∉open-week(' || ow || ')'); end if;
  if exists (select 1 from public.tasks where id = t and weekend_start is not null
               and (week_start is null or weekend_start - week_start not between 0 and 6)) then f := f || 'weekend∉week'::text; end if;
  if exists (select 1 from public.task_commitments c where c.task_id = t and c.status = 'carried'
               and not exists (select 1 from public.task_commitments x where x.task_id = t and x.level = c.level
                                 and x.period_start = c.carried_to and x.status in ('open', 'done'))) then
    f := f || 'carried→none'::text;
  end if;
  return case when cardinality(f) = 0 then 'ok' else array_to_string(f, ' ') end;
end $$;

-- ── Seeding: a couple-scope task owned by alex ─────────────────────────────
-- spec: {"commits":[[level,start],…], "day":"YYYY-MM-DD", "weekend":"YYYY-MM-DD", "focus":["YYYY-MM-DD",…]}
create function inv.seed(p_title text, p_spec jsonb) returns uuid language plpgsql as $$
declare t uuid := gen_random_uuid(); c jsonb; f jsonb;
begin
  perform inv.act_as(inv.who('alex'));
  insert into public.tasks (id, user_id, title, scope, bucket) values (t, inv.who('alex'), p_title, 'couple', 'inbox');
  for c in select * from jsonb_array_elements(coalesce(p_spec->'commits', '[]')) loop
    perform inv.op_ensure(t, c->>0, (c->>1)::date);
  end loop;
  if p_spec ? 'day' then
    update public.tasks set bucket = 'timed', is_all_day = true,
      scheduled_for = ((p_spec->>'day') || ' 00:00')::timestamp at time zone 'America/New_York' where id = t;
  end if;
  if p_spec ? 'weekend' then update public.tasks set weekend_start = (p_spec->>'weekend')::date where id = t; end if;
  perform inv.act_as(inv.who('partner'));
  for f in select * from jsonb_array_elements(coalesce(p_spec->'focus', '[]')) loop
    perform inv.focus_set(t, (f#>>'{}')::date);
  end loop;
  perform inv.as_admin();
  perform inv.check(inv.consistent(t), 'seed ' || p_title || ' inconsistent: ' || inv.state(t));
  return t;
end $$;

-- ── The client, as a policy over a request list ────────────────────────────
-- A request: {"k": "row"|"op"|"reassert"|"focus", "c": "<call with $T for the task id>"}
-- Returns how many requests were SENT. p_fail_at = index (1-based, list order)
-- of the request that fails/is lost; 0 = none. p_trace emits TRACE lines.
create function inv.run(t uuid, p_policy text, p_reqs jsonb, p_fail_at int, p_mode text, p_trace boolean default false)
returns int language plpgsql as $$
declare r jsonb; i int := 0; n int; all_ok boolean := true; sent int := 0; call text;
begin
  for r in select * from jsonb_array_elements(p_reqs) loop
    i := i + 1;
    call := replace(r->>'c', '$T', quote_literal(t) || '::uuid');
    if p_policy = 'current' then
      if r->>'k' = 'reassert' and not all_ok then continue; end if;
    else  -- candidate: the row is last and only when everything before it wrote
      if r->>'k' = 'row' and not all_ok then continue; end if;
    end if;
    perform inv.act_as(inv.who('partner'));
    n := inv.step(call, case when i = p_fail_at then (case when p_mode = 'down' then 'fail' else p_mode end)
                             when p_mode = 'down' and p_fail_at > 0 and i > p_fail_at then 'fail'
                             else '' end);
    perform inv.as_admin();
    sent := sent + 1;
    if p_trace then raise notice 'TRACE     after #% %: % | %', i, r->>'k', inv.state(t), inv.flags(t); end if;
    if n < 0 then
      all_ok := false;
      if p_policy = 'current' and r->>'k' = 'row' then exit; end if;   -- keepOne / updateTask stop on a row error
      if p_policy = 'candidate-C' then exit; end if;                     -- C: nothing after a failed request
    end if;
  end loop;
  return sent;
end $$;

create table inv.results (
  scenario text, policy text, boundary int, kind text, mode text,
  after_state text, after_flags text, retry_state text, retry_flags text, converged boolean, events_equal boolean);

-- One scenario × one policy: baseline (traced), then every boundary × {fail, lost, down}, each followed by a retry.
create function inv.scenario(p_name text, p_seed jsonb, p_policy text, p_reqs jsonb) returns void language plpgsql as $$
declare t uuid; base_state text; base_events text; i int; m text; a_state text; a_flags text; n int := jsonb_array_length(p_reqs);
begin
  t := inv.seed(p_name, p_seed);
  raise notice 'OBSERVE ── % [%] seed: %', p_name, p_policy, inv.state(t);
  perform inv.run(t, p_policy, p_reqs, 0, '', true);
  base_state := inv.state(t); base_events := inv.events(t);
  perform inv.check(inv.flags(t) = 'ok' or p_name like 'U3a%' or p_name like 'K5%',
                    p_name || ' ' || p_policy || ' baseline flags: ' || inv.flags(t));
  raise notice 'OBSERVE   baseline end: % | flags=% | events %', base_state, inv.flags(t), base_events;
  for i in 1..n loop
    foreach m in array array['fail', 'lost', 'down'] loop
      t := inv.seed(p_name, p_seed);
      perform inv.run(t, p_policy, p_reqs, i, m);
      a_state := inv.state(t); a_flags := inv.flags(t);
      perform inv.run(t, p_policy, p_reqs, 0, '');   -- retry
      insert into inv.results values (p_name, p_policy, i, p_reqs->(i-1)->>'k', m, a_state, a_flags,
                                      inv.state(t), inv.flags(t), inv.state(t) = base_state, inv.events(t) = base_events);
      raise notice 'RESULT    % [%] #%(%) %: % | flags=% | retry=%',
        p_name, p_policy, i, p_reqs->(i-1)->>'k', m, a_state, a_flags,
        (case when inv.state(t) = base_state then 'converged' else 'DIVERGED: ' || inv.state(t) end)
        || (case when inv.events(t) = base_events then '' else ' (events ' || inv.events(t) || ' vs ' || base_events || ')' end);
    end loop;
  end loop;
end $$;

-- Request builders ($T is replaced by the task id).
create function inv.r_row(k text, j jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('k', k, 'c', format('inv.row_set($T,%L::jsonb)', j)) $$;
create function inv.r_ensure(l text, d text) returns jsonb language sql immutable as $$
  select jsonb_build_object('k', 'op', 'c', format('inv.op_ensure($T,%L,%L::date)', l, d)) $$;
create function inv.r_remove(l text, d text) returns jsonb language sql immutable as $$
  select jsonb_build_object('k', 'op', 'c', format('inv.op_remove($T,%L,%L::date)', l, d)) $$;
create function inv.r_carry(l text, d text, t2 text) returns jsonb language sql immutable as $$
  select jsonb_build_object('k', 'op', 'c', format('inv.op_carry($T,%L,%L::date,%L::date)', l, d, t2)) $$;
create function inv.r_fset(d text) returns jsonb language sql immutable as $$
  select jsonb_build_object('k', 'focus', 'c', format('inv.focus_set($T,%L::date)', d)) $$;
create function inv.r_fclear(d text) returns jsonb language sql immutable as $$
  select jsonb_build_object('k', 'focus', 'c', format('inv.focus_clear($T,%L::date)', d)) $$;

-- Run one scenario under current, candidate A (planner's op order) and, when
-- it differs, candidate B (ensures first).
--   p_row      the placement row (current: first; candidate: last)
--   p_ops      commitment ops in the planner's order
--   p_reassert the let-go re-assert row (current only; null when not sent)
--   p_focus    focus ops
create function inv.all_orders(p_name text, p_seed jsonb, p_row jsonb, p_ops jsonb, p_reassert jsonb, p_focus jsonb) returns void
language plpgsql as $$
declare ops_b jsonb;
begin
  perform inv.scenario(p_name, p_seed, 'current',
    jsonb_build_array(inv.r_row('row', p_row)) || p_ops
    || case when p_reassert is null then '[]'::jsonb else jsonb_build_array(inv.r_row('reassert', p_reassert)) end || p_focus);
  if jsonb_array_length(p_ops) + jsonb_array_length(p_focus) = 0 then return; end if;
  perform inv.scenario(p_name, p_seed, 'candidate-A', p_ops || p_focus || jsonb_build_array(inv.r_row('row', p_row)));
  select coalesce(jsonb_agg(o order by (o->>'c' like 'inv.op_ensure%') desc, ord), '[]') into ops_b
    from jsonb_array_elements(p_ops) with ordinality x(o, ord);
  if ops_b <> p_ops then
    perform inv.scenario(p_name, p_seed, 'candidate-B', ops_b || p_focus || jsonb_build_array(inv.r_row('row', p_row)));
  end if;
  if jsonb_array_length(p_ops) > 1 then
    perform inv.scenario(p_name, p_seed, 'candidate-C', ops_b || p_focus || jsonb_build_array(inv.r_row('row', p_row)));
  end if;
end $$;

grant execute on all functions in schema inv to authenticated;

-- Common seeds
create function inv.s(j text) returns jsonb language sql immutable as $$ select j::jsonb $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART K — keepForward (keepOne). Row = planKeep's derived cache (+ weekend
-- reset on a week Keep of a weekend task); ops = [carry source, ensure dest].
-- ═══════════════════════════════════════════════════════════════════════════

-- K1 month Sep → Oct, the task is only on September.
do $$ begin
  perform inv.all_orders('K1 keep month Sep→Oct',
    inv.s('{"commits":[["month","2026-09-01"]]}'),
    '{"bucket":"month","week_start":null,"month_start":"2026-10-01","season_start":null}',
    jsonb_build_array(inv.r_carry('month', '2026-09-01', '2026-10-01'), inv.r_ensure('month', '2026-10-01')),
    null, '[]');
  raise notice 'PASS K1: ran';
end $$;

-- K2 week W1 → W2, the task is also on September.
do $$ begin
  perform inv.all_orders('K2 keep week W1→W2 (+Sep)',
    inv.s('{"commits":[["month","2026-09-01"],["week","2026-09-20"]]}'),
    '{"bucket":"week","week_start":"2026-09-27","month_start":"2026-09-01","season_start":null}',
    jsonb_build_array(inv.r_carry('week', '2026-09-20', '2026-09-27'), inv.r_ensure('week', '2026-09-27')),
    null, '[]');
  raise notice 'PASS K2: ran';
end $$;

-- K2w the same Keep of a weekend task: the row also clears weekend_start.
do $$ begin
  perform inv.all_orders('K2w keep week W1→W2, weekend task',
    inv.s('{"commits":[["month","2026-09-01"],["week","2026-09-20"]],"weekend":"2026-09-26"}'),
    '{"weekend_start":null,"bucket":"week","week_start":"2026-09-27","month_start":"2026-09-01","season_start":null}',
    jsonb_build_array(inv.r_carry('week', '2026-09-20', '2026-09-27'), inv.r_ensure('week', '2026-09-27')),
    null, '[]');
  raise notice 'PASS K2w: ran';
end $$;

-- K3 month Keep Sep → Oct of a task that is ALSO on week W1 (bucket week):
-- the kept level is not the row's bucket, so the mirror does not ensure Oct.
do $$ begin
  perform inv.all_orders('K3 keep month Sep→Oct, on week W1',
    inv.s('{"commits":[["month","2026-09-01"],["week","2026-09-20"]]}'),
    '{"bucket":"week","week_start":"2026-09-20","month_start":"2026-10-01","season_start":null}',
    jsonb_build_array(inv.r_carry('month', '2026-09-01', '2026-10-01'), inv.r_ensure('month', '2026-10-01')),
    null, '[]');
  raise notice 'PASS K3: ran';
end $$;

-- K4 season Keep Fall → Winter of a task also on September (bucket month).
do $$ begin
  perform inv.all_orders('K4 keep season Fall→Winter, on Sep',
    inv.s('{"commits":[["season","2026-09-01"],["month","2026-09-01"]]}'),
    '{"bucket":"month","week_start":null,"month_start":"2026-09-01","season_start":"2026-12-01"}',
    jsonb_build_array(inv.r_carry('season', '2026-09-01', '2026-12-01'), inv.r_ensure('season', '2026-12-01')),
    null, '[]');
  raise notice 'PASS K4: ran';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART U — updateTask placements. Row = every plan.row key (dbUpdates).
-- ═══════════════════════════════════════════════════════════════════════════

-- U1 a week task given TODAY from Today (chooseTaskDay, focus): no commitment
-- op — the day is only scheduled_for; focus set.
do $$ begin
  perform inv.all_orders('U1 week task given today (+focus)',
    inv.s('{"commits":[["month","2026-09-01"],["week","2026-09-20"]]}'),
    '{"is_all_day":true,"scheduled_for":"2026-09-25T04:00:00Z","bucket":"timed","week_start":"2026-09-20","month_start":"2026-09-01","season_start":null}',
    '[]', null, jsonb_build_array(inv.r_fset('2026-09-25')));
  raise notice 'PASS U1: ran';
end $$;

-- U2 the day moved within the same week (pushTask to a date): row only.
do $$ begin
  perform inv.all_orders('U2 day Thu→Sat same week',
    inv.s('{"commits":[["month","2026-09-01"],["week","2026-09-20"]],"day":"2026-09-24","focus":["2026-09-24"]}'),
    '{"defer_count":1,"is_all_day":true,"scheduled_for":"2026-09-26T04:00:00Z","bucket":"timed","week_start":"2026-09-20","month_start":"2026-09-01","season_start":null}',
    '[]', null, '[]');
  raise notice 'PASS U2: ran';
end $$;

-- U3a the day moved into ANOTHER week by date (pushTask / drag to a date):
-- the planner emits NO week op (schedule touches only the day, D1c.1).
do $$
declare t uuid;
begin
  perform inv.all_orders('U3a day Thu W1→Wed W2 by date',
    inv.s('{"commits":[["month","2026-09-01"],["week","2026-09-20"]],"day":"2026-09-24"}'),
    '{"defer_count":1,"is_all_day":true,"scheduled_for":"2026-09-30T04:00:00Z","bucket":"timed","week_start":"2026-09-27","month_start":"2026-09-01","season_start":null}',
    '[]', null, '[]');
  -- The mirror never ensures for a 'timed' row, and the row write names no week op:
  t := inv.seed('U3a check', '{"commits":[["month","2026-09-01"],["week","2026-09-20"]],"day":"2026-09-24"}');
  perform inv.act_as(inv.who('partner'));
  perform inv.row_set(t, '{"is_all_day":true,"scheduled_for":"2026-09-30T04:00:00Z","bucket":"timed","week_start":"2026-09-27","month_start":"2026-09-01","season_start":null}');
  perform inv.as_admin();
  perform inv.check(inv.records(t) = 'month 2026-09-01 open, week 2026-09-20 open', 'U3a no W2 commitment, W1 still open');
  perform inv.check(inv.consistent(t) and inv.flags(t) = 'day∉open-week(2026-09-20)', 'U3a consistent by the DB rule, W1 still the open week');
  raise notice 'PASS U3a: a date move across weeks leaves W1 open and opens nothing for W2 (order-independent; no op to reorder)';
end $$;

-- U3b a DATED task sent to next week from the timing menu (onPickWeek):
-- day cleared, remove W1, ensure W2.
do $$ begin
  perform inv.all_orders('U3b dated W1 → week W2 (onPickWeek)',
    inv.s('{"commits":[["month","2026-09-01"],["week","2026-09-20"]],"day":"2026-09-24"}'),
    '{"scheduled_for":null,"is_all_day":false,"bucket":"week","week_start":"2026-09-27","month_start":"2026-09-01","season_start":null}',
    jsonb_build_array(inv.r_remove('week', '2026-09-20'), inv.r_ensure('week', '2026-09-27')),
    null, '[]');
  raise notice 'PASS U3b: ran';
end $$;

-- U3c an undated week task moved BACK a week (W2 → W1).
do $$ begin
  perform inv.all_orders('U3c week W2 → W1 (back)',
    inv.s('{"commits":[["month","2026-09-01"],["week","2026-09-27"]]}'),
    '{"scheduled_for":null,"is_all_day":false,"bucket":"week","week_start":"2026-09-20","month_start":"2026-09-01","season_start":null}',
    jsonb_build_array(inv.r_remove('week', '2026-09-27'), inv.r_ensure('week', '2026-09-20')),
    null, '[]');
  raise notice 'PASS U3c: ran';
end $$;

-- U4a remove the day, keep the week (timingRemoval 'day'): focus clear only.
do $$ begin
  perform inv.all_orders('U4a remove day, keep week',
    inv.s('{"commits":[["month","2026-09-01"],["week","2026-09-20"]],"day":"2026-09-24","focus":["2026-09-24"]}'),
    '{"scheduled_for":null,"is_all_day":null,"bucket":"week","week_start":"2026-09-20","month_start":"2026-09-01","season_start":null}',
    '[]', null, jsonb_build_array(inv.r_fclear('2026-09-24')));
  raise notice 'PASS U4a: ran';
end $$;

-- U4b remove the day AND the week (timingRemoval 'all'): stated commitments.
do $$ begin
  perform inv.all_orders('U4b remove day and week',
    inv.s('{"commits":[["month","2026-09-01"],["week","2026-09-20"]],"day":"2026-09-24","focus":["2026-09-24"]}'),
    '{"scheduled_for":null,"is_all_day":null,"bucket":"month","week_start":null,"month_start":"2026-09-01","season_start":null}',
    jsonb_build_array(inv.r_remove('week', '2026-09-20'), inv.r_ensure('month', '2026-09-01')),
    null, jsonb_build_array(inv.r_fclear('2026-09-24')));
  raise notice 'PASS U4b: ran';
end $$;

-- U5 a DATED task with week + month let go to Someday (setBucket('someday')).
do $$ begin
  perform inv.all_orders('U5 dated, week+month → Someday',
    inv.s('{"commits":[["month","2026-09-01"],["week","2026-09-20"]],"day":"2026-09-24"}'),
    '{"scheduled_for":null,"is_all_day":false,"bucket":"someday","week_start":null,"month_start":null,"season_start":null}',
    jsonb_build_array(inv.r_remove('week', '2026-09-20'), inv.r_remove('month', '2026-09-01')),
    '{"bucket":"someday","week_start":null,"month_start":null,"season_start":null}', '[]');
  raise notice 'PASS U5: ran';
end $$;

-- U6a weekend SET on an Inbox task that was chosen for today (weekendPlacement:
-- plannedOn undefined → focus clear-all).
do $$ begin
  perform inv.all_orders('U6a weekend set (inbox task)',
    inv.s('{"focus":["2026-09-25"]}'),
    '{"is_all_day":false,"weekend_start":"2026-09-26","scheduled_for":null,"bucket":"week","week_start":"2026-09-20","month_start":null,"season_start":null}',
    jsonb_build_array(inv.r_ensure('week', '2026-09-20')),
    null, jsonb_build_array(jsonb_build_object('k', 'focus', 'c', 'inv.focus_clear($T,null)')));
  raise notice 'PASS U6a: ran';
end $$;

-- U6c a weekend task moved to next week (onPickWeek): weekend CLEARED.
do $$ begin
  perform inv.all_orders('U6c weekend task → week W2 (weekend cleared)',
    inv.s('{"commits":[["month","2026-09-01"],["week","2026-09-20"]],"weekend":"2026-09-26"}'),
    '{"weekend_start":null,"scheduled_for":null,"is_all_day":false,"bucket":"week","week_start":"2026-09-27","month_start":"2026-09-01","season_start":null}',
    jsonb_build_array(inv.r_remove('week', '2026-09-20'), inv.r_ensure('week', '2026-09-27')),
    null, '[]');
  raise notice 'PASS U6c: ran';
end $$;

-- U7 a week task pushed UP to the month (pushTask('month')): ensure Sep, remove W1.
do $$ begin
  perform inv.all_orders('U7 week → month (up)',
    inv.s('{"commits":[["month","2026-09-01"],["week","2026-09-20"]]}'),
    '{"defer_count":1,"scheduled_for":null,"is_all_day":false,"bucket":"month","week_start":null,"month_start":"2026-09-01","season_start":null}',
    jsonb_build_array(inv.r_ensure('month', '2026-09-01'), inv.r_remove('week', '2026-09-20')),
    null, '[]');
  raise notice 'PASS U7: ran';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART F — focus writes (task_focus: INSERT / SELECT / DELETE policies, no UPDATE)
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare t uuid; n int;
begin
  t := inv.seed('F focus', '{"commits":[["week","2026-09-20"]]}');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(format('inv.focus_set(%L::uuid,%L::date)', t, '2026-09-25'));   perform inv.check(n = 1, 'F1 first set inserts');
  n := inv.step(format('inv.focus_set(%L::uuid,%L::date)', t, '2026-09-25'));   perform inv.check(n = 0, 'F1 repeat set (ignoreDuplicates) is a silent no-op');
  -- F2 without ignoreDuplicates the conflict path needs an UPDATE policy there is none of.
  n := inv.step(format('inv.focus_merge(%L::uuid,%L::date)', t, '2026-09-25'));
  perform inv.check(n = -1, 'F2 merge-duplicates upsert on an existing focus row is refused');
  n := inv.step(format('inv.focus_merge(%L::uuid,%L::date)', t, '2026-09-26'));
  perform inv.check(n = 1, 'F2b merge upsert with no conflict inserts');
  -- F3 a clear only ever deletes the caller's rows; someone else's are invisible to DELETE.
  perform inv.act_as(inv.who('alex'));
  n := inv.step(format('inv.focus_set(%L::uuid,%L::date)', t, '2026-09-25'));   perform inv.check(n = 1, 'F3 alex chooses it too');
  perform inv.act_as(inv.who('partner'));
  n := inv.step(format('inv.focus_clear(%L::uuid,null,%L::uuid)', t, inv.who('alex')));
  perform inv.check(n = 0, 'F3 partner cannot clear alex''s focus (0 rows, no error)');
  n := inv.step(format('inv.focus_clear(%L::uuid,null)', t));                    perform inv.check(n = 2, 'F3 partner clear-all removes only partner''s 2');
  n := inv.step(format('inv.focus_clear(%L::uuid,null)', t));                    perform inv.check(n = 0, 'F3 repeat clear is a no-op');
  perform inv.as_admin();
  perform inv.check(inv.focus(t) = 'alex 2026-09-25', 'F3 alex''s row survives');
  -- F4 no trigger reads or writes task_focus: a focus write never moves the row or the records.
  perform inv.check(inv.row_cache(t) = 'week/2026-09-20/-/-' and inv.records(t) = 'week 2026-09-20 open', 'F4 row and records untouched');
  perform inv.check(not exists (select 1 from pg_trigger where tgrelid = 'public.task_focus'::regclass and not tgisinternal),
                    'F4 no trigger on task_focus');
  raise notice 'PASS F: focus set is insert-or-ignore (idempotent on retry); a merge upsert would fail; clear is own-rows-only and idempotent; no trigger couples focus to the row';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SUMMARY + assertions over every boundary
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare r record;
begin
  for r in
    select scenario, policy,
           count(*) filter (where after_flags like '%SPLIT%') as splits,
           count(*) filter (where after_flags <> 'ok') as flagged,
           count(*) filter (where not converged) as diverged,
           count(*) filter (where not events_equal) as ev_diff,
           count(*) as n,
           string_agg(distinct after_flags, ' ; ') filter (where after_flags <> 'ok') as kinds
      from inv.results group by scenario, policy order by scenario, policy
  loop
    raise notice 'SUMMARY   % [%]: % boundaries, SPLIT %, any flag %, retry diverged %, events differ % | %',
      r.scenario, r.policy, r.n, r.splits, r.flagged, r.diverged, r.ev_diff, coalesce(r.kinds, '-');
  end loop;

  perform inv.check(not exists (select 1 from inv.results where not converged),
                    'every retry converges: ' || coalesce((select string_agg(scenario || ' ' || policy || ' #' || boundary || ' ' || mode, ', ')
                                                            from inv.results where not converged), ''));
  perform inv.check(not exists (select 1 from inv.results where policy like 'candidate%' and after_flags like '%SPLIT%'),
                    'candidate order never leaves a SPLIT');
  perform inv.check(not exists (select 1 from inv.results where not events_equal),
                    'every retry ends with the same placement events as a clean run');
  raise notice 'PASS S: every retry converged with the clean run''s events (both orders); the candidate order never left a SPLIT';
end $$;

-- The claims the write-up rests on, over every boundary recorded above.
do $$
declare got text;
begin
  -- S1 which paths split under the CURRENT order, and at which boundaries
  select string_agg(distinct split_part(scenario, ' ', 1), ',' order by split_part(scenario, ' ', 1)) into got
    from inv.results where policy = 'current' and after_flags like '%SPLIT%';
  perform inv.check(got = 'K3,K4,U3c,U4b,U5,U7', 'S1 current-order SPLIT paths: ' || coalesce(got, '-'));
  perform inv.check(not exists (select 1 from inv.results where policy = 'current' and after_flags like '%SPLIT%'
                                  and not ((boundary = 1 and mode = 'lost') or (boundary = 2 and mode = 'down'))),
                    'S1 current splits only when the row landed and no op after it did');
  raise notice 'PASS S1: current order splits on K3 K4 U3c U4b U5 U7 — row written (or its response lost), ops not';

  -- S2 carried→none: planner order (A) and ensure-first-but-continue (B) leave it; stop-at-first-failure (C) never
  perform inv.check(exists (select 1 from inv.results where policy = 'candidate-A' and after_flags like '%carried→none%'), 'S2 A has carried→none');
  perform inv.check(exists (select 1 from inv.results where policy = 'candidate-B' and after_flags like '%carried→none%'), 'S2 B has carried→none');
  perform inv.check(not exists (select 1 from inv.results where policy = 'candidate-C' and after_flags like '%carried→none%'), 'S2 C never');
  select string_agg(distinct split_part(scenario, ' ', 1), ',' order by split_part(scenario, ' ', 1)) into got
    from inv.results where policy = 'current' and after_flags like '%carried→none%';
  perform inv.check(got = 'K3,K4', 'S2 current carried→none paths: ' || coalesce(got, '-'));
  raise notice 'PASS S2: carried→none — current on K3/K4, candidates A and B on every Keep, C never';

  -- S3 weekend∉week only when the row (which alone clears weekend_start) comes last
  perform inv.check(not exists (select 1 from inv.results where policy = 'current' and after_flags like '%weekend∉week%'), 'S3 current never');
  select string_agg(distinct split_part(scenario, ' ', 1), ',' order by split_part(scenario, ' ', 1)) into got
    from inv.results where policy like 'candidate%' and after_flags like '%weekend∉week%';
  perform inv.check(got = 'K2w,U6c', 'S3 candidate weekend∉week paths: ' || coalesce(got, '-'));
  raise notice 'PASS S3: weekend∉week appears only under ops-first (K2w, U6c): sync never clears weekend_start';

  -- S4 a dated task sent to another week, ops first, final row fails: the old day stays, its week record moved
  perform inv.check((select after_flags from inv.results where scenario like 'U3b%' and policy = 'candidate-C' and boundary = 3 and mode = 'fail')
                    = 'day∉open-week(2026-09-27)', 'S4 U3b candidate row failure leaves day in W1, open week W2');
  perform inv.check((select after_state from inv.results where scenario like 'U3b%' and policy = 'candidate-C' and boundary = 3 and mode = 'fail')
                    like 'row=timed/2026-09-20/2026-09-01/- day=2026-09-24 %', 'S4 row stays timed on the old day''s week');
  raise notice 'PASS S4: ops-first on a dated task keeps the row timed on its OLD day until the row write; a failed row write leaves day ∉ open week (no SPLIT)';

  -- S5 an ensure that fails AFTER a remove demotes the task unless the client stops (C) or ensures first
  perform inv.check((select after_state from inv.results where scenario like 'U3c%' and policy = 'candidate-A' and boundary = 2 and mode = 'fail')
                    like 'row=month/-/2026-09-01/- %', 'S5 U3c A: remove ok, ensure fails → on no week');
  perform inv.check((select after_state from inv.results where scenario like 'U3c%' and policy = 'candidate-B' and boundary = 1 and mode = 'fail')
                    like 'row=month/-/2026-09-01/- %', 'S5 U3c B: ensure fails, remove still sent → on no week');
  perform inv.check(not exists (select 1 from inv.results where scenario like 'U3c%' and policy = 'candidate-C' and after_state like 'row=month/%'),
                    'S5 U3c C never demotes');
  raise notice 'PASS S5: a remove landing without its ensure drops the task off every week (A, B); C never does';
end $$;
