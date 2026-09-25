-- 098 — the Drop sequence AS THE CLIENT NOW SENDS IT (useSupabaseTasks.ts
-- dropCommitment, 2026-09-25): commitment removals first, the final row write
-- last and only when every removal wrote; on any failure, stop and re-read;
-- a retry plans from what it read and, with no removal left, still writes the
-- row when the row differs from the plan's.
--
-- Runs after 097, whose inv.* helpers it reuses (fault injection, one
-- subtransaction per request, household partner under live RLS). Run with
-- ./scripts/test-drop-client-sequence-locally.sh. Throwaway cluster only.

-- The client, transcribed. `plan_*` is what planDropCommitment computes for a
-- Drop of `lvl`/`start`: the row the records imply once that period is gone.
-- p_fail injects a failure; p_lost makes a request LAND but report failure
-- (a lost response). Returns true only when the client would report success.
create function inv.client_drop(t uuid, lvl text, start date,
    plan_bucket text, plan_week date, plan_month date, plan_season date, clear_weekend boolean,
    p_fail text default '', p_lost text default '') returns boolean
language plpgsql as $$
declare has_open boolean; n int; row_ok boolean;
begin
  -- The client plans from what it last read: an open commitment for this period?
  select exists (select 1 from public.task_commitments where task_id = t and level = lvl and period_start = start and status = 'open') into has_open;
  if has_open then
    n := inv.step(inv.c_remove(t, lvl, start), case when p_fail = 'remove' then 'remove:any' else '' end);
    if n = -1 or p_lost = 'remove' then return false; end if;          -- stop; nothing after it is sent
  else
    -- No removal left: done only if the row already says what the plan says.
    select bucket = plan_bucket and week_start is not distinct from plan_week and month_start is not distinct from plan_month
           and season_start is not distinct from plan_season and (not clear_weekend or weekend_start is null)
      into row_ok from public.tasks where id = t;
    if row_ok then return true; end if;
  end if;
  n := inv.step(inv.c_row(t, plan_bucket, plan_week, plan_month, plan_season, clear_weekend), case when p_fail = 'row' then 'row' else '' end);
  if n = -1 or p_lost = 'row' then return false; end if;
  return true;
end $$;
grant execute on function inv.client_drop to authenticated;

do $$
declare t uuid; ok boolean; ev int;
begin
  -- D1 sole week: success, both requests, row and records agree.
  t := inv.seed('D1', 'week');
  perform inv.act_as(inv.who('partner'));
  ok := inv.client_drop(t, 'week', '2026-09-20', 'inbox', null, null, null, false);
  perform inv.as_admin();
  perform inv.check(ok and inv.row_cache(t) = 'inbox/-/-/-' and inv.consistent(t), 'D1 sole week drops to the Inbox');
  raise notice 'PASS D1: sole week — removed, row inbox, consistent';

  -- D2 week with month: the month stays and the row says month.
  t := inv.seed('D2', 'week+month');
  perform inv.act_as(inv.who('partner'));
  ok := inv.client_drop(t, 'week', '2026-09-20', 'month', null, '2026-09-01', null, false);
  perform inv.as_admin();
  perform inv.check(ok and inv.row_cache(t) = 'month/-/2026-09-01/-' and inv.consistent(t), 'D2 month kept');
  raise notice 'PASS D2: week with month — month kept, consistent';

  -- D3 removal fails: nothing else sent, NOTHING changed, still consistent; retry converges.
  t := inv.seed('D3', 'week');
  perform inv.act_as(inv.who('partner'));
  ok := inv.client_drop(t, 'week', '2026-09-20', 'inbox', null, null, null, false, 'remove');
  perform inv.as_admin();
  perform inv.check(not ok and inv.row_cache(t) = 'week/2026-09-20/-/-' and inv.consistent(t), 'D3 failed removal leaves the task as it was');
  perform inv.act_as(inv.who('partner'));
  ok := inv.client_drop(t, 'week', '2026-09-20', 'inbox', null, null, null, false);
  perform inv.as_admin();
  perform inv.check(ok and inv.row_cache(t) = 'inbox/-/-/-' and inv.consistent(t), 'D3 retry converges');
  raise notice 'PASS D3: failed removal — no split, retry converges';

  -- D4 weekend reset, final row fails: reported FAILED; records dropped, row
  -- consistent but weekend still set; the retry has no removal left and still
  -- writes the row — weekend cleared.
  t := inv.seed('D4', 'week+weekend');
  perform inv.act_as(inv.who('partner'));
  ok := inv.client_drop(t, 'week', '2026-09-20', 'inbox', null, null, null, true, 'row');
  perform inv.as_admin();
  perform inv.check(not ok, 'D4 final row failure is a failure');
  perform inv.check(inv.consistent(t) and (select weekend_start from public.tasks where id = t) = date '2026-09-26', 'D4 consistent, weekend left');
  perform inv.act_as(inv.who('partner'));
  ok := inv.client_drop(t, 'week', '2026-09-20', 'inbox', null, null, null, true);
  perform inv.as_admin();
  perform inv.check(ok and (select weekend_start from public.tasks where id = t) is null and inv.row_cache(t) = 'inbox/-/-/-', 'D4 retry clears the weekend');
  raise notice 'PASS D4: weekend reset — final row failure stays failed; retry (row only) clears it';

  -- D5 lost response on the removal: it landed, the client reported failure;
  -- the retry sees no open week, finds the row already right, sends nothing.
  t := inv.seed('D5', 'week');
  perform inv.act_as(inv.who('partner'));
  ok := inv.client_drop(t, 'week', '2026-09-20', 'inbox', null, null, null, false, '', 'remove');
  perform inv.as_admin();
  perform inv.check(not ok and inv.consistent(t) and inv.row_cache(t) = 'inbox/-/-/-', 'D5 landed, reported failed, consistent');
  ev := inv.events(t, 'removed');
  perform inv.act_as(inv.who('partner'));
  ok := inv.client_drop(t, 'week', '2026-09-20', 'inbox', null, null, null, false);
  perform inv.as_admin();
  perform inv.check(ok and inv.events(t, 'removed') = ev, 'D5 retry: done, no second removal event');
  raise notice 'PASS D5: lost removal response — retry completes without a second removal';

  -- D6 lost response on the final row (weekend): retry finds it done.
  t := inv.seed('D6', 'week+weekend');
  perform inv.act_as(inv.who('partner'));
  ok := inv.client_drop(t, 'week', '2026-09-20', 'inbox', null, null, null, true, '', 'row');
  perform inv.as_admin();
  perform inv.check(not ok and (select weekend_start from public.tasks where id = t) is null, 'D6 row landed, reported failed');
  perform inv.act_as(inv.who('partner'));
  ok := inv.client_drop(t, 'week', '2026-09-20', 'inbox', null, null, null, true);
  perform inv.as_admin();
  perform inv.check(ok, 'D6 retry sees it done');
  raise notice 'PASS D6: lost final-row response — retry sees it done';

  -- D7 Someday kept (two commitments, let-go): final row fails → inbox (the
  -- trigger cannot know "someday"), FAILED; the retry writes someday.
  t := inv.seed('D7', 'week+month');
  perform inv.act_as(inv.who('partner'));
  perform inv.step(inv.c_remove(t, 'week', '2026-09-20'));
  ok := inv.client_drop(t, 'month', '2026-09-01', 'someday', null, null, null, false, 'row');
  perform inv.as_admin();
  perform inv.check(not ok and inv.row_cache(t) = 'inbox/-/-/-' and inv.consistent(t), 'D7 someday not yet written, consistent, failed');
  perform inv.act_as(inv.who('partner'));
  ok := inv.client_drop(t, 'month', '2026-09-01', 'someday', null, null, null, false);
  perform inv.as_admin();
  perform inv.check(ok and inv.row_cache(t) = 'someday/-/-/-' and inv.consistent(t), 'D7 retry keeps Someday');
  raise notice 'PASS D7: Someday — final row failure stays failed; retry writes someday';
end $$;
