-- Fold the legacy copy-down chains into enduring actions (D1b).
--
-- Source of truth: the read-only report Scott confirmed on 2026-09-20
-- (vault: briefs/2026-09-20-d1b-chain-report.md — "yes to all six proposals,
-- use your defaults"). Every call below is one line of that report; nothing
-- else is touched. 33 linked rows: 17 folded (12 placements, 2 duplicates,
-- 3 renamed copies), 15 left as steps (their source_id link stays; lineage.ts,
-- which read it as a copy, is gone), 1 left as-is by decision (chain 3, the
-- outdoor table). Month commitments for the folded roots are inferred (July
-- 2026, August for chain 11) and each inference is logged as such.
--
-- Requires 2026-09-21_one_enduring_action.sql (task_commitments, task_focus,
-- task_placement_events, task_aliases, and the sync triggers).
--
-- Safe to retry: a child that already has an alias is skipped; the whole file
-- is one transaction and the assertions at the end abort it if the result is
-- not exactly what the report promised. Old ids survive as aliases; every
-- table that held a child id is re-pointed. Title similarity decides nothing
-- here — each pair is named explicitly.

begin;

create or replace function public.fold_task_into(p_child uuid, p_into uuid, p_opts jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.tasks%rowtype;
  p public.tasks%rowtype;
  v_infer_month date := nullif(p_opts->>'infer_month', '')::date;
  v_infer_status text := coalesce(p_opts->>'infer_month_status', '');
  v_keep_target_day boolean := coalesce((p_opts->>'keep_target_day')::boolean, false);
  v_title_from_child boolean := coalesce((p_opts->>'title_from_child')::boolean, false);
  v_bucket_from_child boolean := coalesce((p_opts->>'bucket_from_child')::boolean, false);
  v_reopen_target boolean := coalesce((p_opts->>'reopen_target')::boolean, false);
  v_status text;
begin
  if exists (select 1 from public.task_aliases where old_id = p_child) then
    raise notice 'fold: % already folded, skipped', p_child;
    return;
  end if;
  select * into c from public.tasks where id = p_child;
  if not found then
    raise exception 'fold: child % not found and not aliased', p_child;
  end if;
  select * into p from public.tasks where id = p_into;
  if not found then
    raise exception 'fold: target % not found', p_into;
  end if;

  -- 1. Period commitments. The target's own month, where the row predates the
  --    stamps, is inferred from the report (July 2026 plan) and marked so.
  v_status := case when p.completed or c.completed then 'done' else 'open' end;
  if v_infer_month is not null then
    insert into public.task_commitments (task_id, level, period_start, status, ended_at)
    values (p_into, 'month', v_infer_month,
            case when v_infer_status <> '' then v_infer_status else v_status end,
            case when v_infer_status <> '' or v_status = 'done' then coalesce(c.completed_at, c.scheduled_for, now()) end)
    on conflict (task_id, level, period_start) do nothing;
    perform public.log_placement_event(p_into, 'folded', null,
      jsonb_build_object('inferred', 'month', 'period_start', v_infer_month, 'evidence', 'July 2026 plan (picked_at 7/24–7/30, placements 7/25); confirmed by Scott 2026-09-20'));
  end if;
  if c.season_start is not null then
    insert into public.task_commitments (task_id, level, period_start, status)
    values (p_into, 'season', c.season_start, v_status) on conflict do nothing;
  end if;
  if c.month_start is not null then
    insert into public.task_commitments (task_id, level, period_start, status)
    values (p_into, 'month', c.month_start, v_status) on conflict do nothing;
  end if;
  if c.week_start is not null then
    insert into public.task_commitments (task_id, level, period_start, status)
    values (p_into, 'week', c.week_start, v_status) on conflict do nothing;
  end if;

  -- 2. The day. Normally the child's day becomes the action's day (the tasks
  --    triggers log scheduled/rescheduled and align the week). With
  --    keep_target_day the target's own day stands and the child's is history.
  if c.scheduled_for is not null then
    if v_keep_target_day and p.scheduled_for is not null then
      perform public.log_placement_event(p_into, 'folded',
        jsonb_build_object('child_day', (c.scheduled_for at time zone 'America/New_York')::date, 'child', p_child),
        jsonb_build_object('kept_day', (p.scheduled_for at time zone 'America/New_York')::date));
    else
      update public.tasks
         set scheduled_for = c.scheduled_for, is_all_day = coalesce(c.is_all_day, true)
       where id = p_into;
    end if;
  end if;

  -- 3. Focus: whoever owned the copy chose that day.
  if c.planned_on is not null then
    insert into public.task_focus (task_id, user_id, date)
    values (p_into, c.user_id, c.planned_on) on conflict do nothing;
  end if;

  -- 4. Completion. Copy done + target open → target done; the only date on
  --    record is the copy's scheduled day, and the event says it is inferred.
  if c.completed and not p.completed then
    update public.tasks
       set completed = true, completed_at = coalesce(c.completed_at, c.scheduled_for)
     where id = p_into;
    perform public.log_placement_event(p_into, 'folded', null,
      jsonb_build_object('completed_from_child', p_child, 'completed_at_inferred', c.completed_at is null));
  elsif v_reopen_target and p.completed and not c.completed then
    update public.tasks set completed = false, completed_at = null where id = p_into;
    perform public.log_placement_event(p_into, 'folded', jsonb_build_object('was_completed', true),
      jsonb_build_object('reopened_from_child', p_child, 'reason', 'tidy-up tick, not completion (chain 11)'));
  end if;

  -- 5. Title, notes, assignee, links — never narrow, never drop text.
  if v_title_from_child and c.title is distinct from p.title then
    update public.tasks set title = c.title where id = p_into;
    perform public.log_placement_event(p_into, 'folded', jsonb_build_object('title', p.title), jsonb_build_object('title', c.title));
  end if;
  if c.notes is not null and length(c.notes) > 0 then
    if p.notes is null or length(p.notes) = 0 or p.notes = c.notes then
      update public.tasks set notes = c.notes where id = p_into;
    else
      update public.tasks set notes = p.notes || E'\n\n---\n' || c.notes where id = p_into;
      perform public.log_placement_event(p_into, 'folded', null, jsonb_build_object('notes_appended_from', p_child, 'chars', length(c.notes)));
    end if;
  end if;
  if p.assigned_to is null and c.assigned_to is not null then
    update public.tasks set assigned_to = c.assigned_to where id = p_into;
  end if;
  if p.goal_task_id is null and c.goal_task_id is not null then
    update public.tasks set goal_task_id = c.goal_task_id where id = p_into;
  end if;
  if p.goal_id is null and c.goal_id is not null then
    update public.tasks set goal_id = c.goal_id where id = p_into;
  end if;
  if v_bucket_from_child then
    update public.tasks set bucket = c.bucket where id = p_into;
  end if;

  -- 6. Everything that held the child's id now holds the action's.
  update public.tasks set source_id = p_into where source_id = p_child;
  update public.tasks set parent_task_id = p_into where parent_task_id = p_child;
  update public.tasks set goal_task_id = p_into where goal_task_id = p_child;
  update public.attachments set entity_id = p_into::text where entity_id = p_child::text;
  delete from public.actionable_instances a
   where a.entity_id = p_child::text
     and exists (select 1 from public.actionable_instances b
                  where b.entity_type = a.entity_type and b.entity_id = p_into::text and b.date = a.date);
  update public.actionable_instances set entity_id = p_into::text where entity_id = p_child::text;
  update public.action_history set entity_id = p_into::text where entity_id = p_child::text;
  update public.note_entity_links set entity_id = p_into::text where entity_id = p_child::text;
  update public.pinned_items set entity_id = p_into::text where entity_id = p_child::text;
  update public.chat_sessions set entity_id = p_into::text where entity_id = p_child::text;
  update public.proactive_suggestions set entity_id = p_into::text where entity_id = p_child::text;
  update public.coaching_conversations set item_id = p_into::text where item_id = p_child::text;
  update public.coaching_observations set source_id = p_into::text where source_id = p_child::text;
  update public.call_log set task_id = p_into::text where task_id = p_child::text;
  update public.email_action_items set task_id = p_into where task_id = p_child;
  update public.gmail_processed_emails set task_id = p_into where task_id = p_child;
  update public.resolution_log set task_id = p_into where task_id = p_child;

  -- 7. Alias, record, retire.
  insert into public.task_aliases (old_id, task_id, reason)
  values (p_child, p_into, coalesce(p_opts->>'reason', 'D1b fold 2026-09-21'));
  perform public.log_placement_event(p_into, 'folded',
    (to_jsonb(c) - 'notes' - 'links' - 'directions'), jsonb_build_object('child', p_child, 'opts', p_opts));
  delete from public.tasks where id = p_child;

  -- The cache follows the commitments and the day.
  perform public.tasks_sync_from_commitments(p_into);
end;
$$;

revoke execute on function public.fold_task_into(uuid, uuid, jsonb) from public, anon, authenticated;

-- ── The confirmed list ───────────────────────────────────────────────────────
-- (child → target). Chain numbers are the report's.

-- Chain 1 — Brainstorm vacation ideas (5 subtasks ride along)
select public.fold_task_into('338d24a4-f1a3-420b-8553-dfd081aa1691', '008abfed-0f1f-47f8-a484-6c3414a66fa2', '{"infer_month":"2026-07-01"}');
-- Chain 2 — Get plants for the entryway
select public.fold_task_into('4f757bfe-7f2e-4679-85ee-dcdd348fd359', '327babc1-3c0d-453d-a419-597710ebe359', '{"infer_month":"2026-07-01"}');
-- Chain 3 — Porch and backyard (steps stay; three placements fold into their step)
select public.fold_task_into('020067d6-20a5-4367-b91d-1a7587900c41', '76cbbb8c-8582-4ea0-b030-5e19e38bd8de', '{"title_from_child":true,"keep_target_day":true}');
select public.fold_task_into('28f46872-b3b6-4f47-af25-3a84edf16e71', '314dcbf1-ca99-4e93-a4a5-e583012fe449', '{"infer_month":"2026-07-01"}');
select public.fold_task_into('7cd5656e-fd71-437c-bb53-d4b1acf690a0', '9b3999aa-6f47-4f67-90f2-c445d0e0cdf2', '{"infer_month":"2026-07-01","title_from_child":true}');
--   cbdbb8f2 (outdoor table → Someday, parent done): left as is, by decision.
-- Chain 4 — Host 2 get togethers
select public.fold_task_into('b0818655-7f87-4aad-8ae0-0977682c7307', '9c29bfba-54e4-4f74-8274-cdccfa6bc269', '{"infer_month":"2026-07-01"}');
-- Chain 5 — Chore system (Jul 19 becomes history under the Jul 25 step; the two
--   common-areas placements collapse, Jul 26 final)
select public.fold_task_into('dc160347-8c58-469e-944a-87c085396d7c', '679bee25-dea8-43ee-b815-edd7785fc172', '{"keep_target_day":true}');
select public.fold_task_into('64266352-be66-4405-ba72-61b0f65dd7c1', '5da65492-a1f3-4bf3-a0cb-a6d7651afe46', '{"infer_month":"2026-07-01"}');
select public.fold_task_into('5b30b8ab-0dbd-41a5-ba5b-4ee8cb10020d', '5da65492-a1f3-4bf3-a0cb-a6d7651afe46', '{"reason":"D1b fold 2026-09-21 (duplicate placement)"}');
-- Chain 6 — Tried 3 things (the "July" copy folds under the "August" step; parent title kept)
select public.fold_task_into('b4b8542e-7e35-466e-8721-2e273570ef9c', 'df2bb849-ad0b-499a-a3c2-1c5592346cac', '{"infer_month":"2026-07-01"}');
-- Chain 7 — Monthly budget
select public.fold_task_into('eb85259b-063a-4d6d-a159-1047f6875a89', '25feee95-57b0-47fb-ace0-a84f3d73085f', '{"infer_month":"2026-07-01"}');
-- Chain 8 — Start using the garage
select public.fold_task_into('0d20d321-0f85-4c2e-ab34-45d7206a451d', 'a4bb334e-1539-4589-b881-9b9634964ed1', '{"infer_month":"2026-07-01"}');
-- Chain 10 — Iris talks to Laura (demo account; the two-commitments case)
select public.fold_task_into('9fb275b0-8df3-4503-a8aa-05395ff57829', 'd249c057-fe9e-4310-ae0e-124961eee6be', '{}');
select public.fold_task_into('556adc35-de3e-4323-9dca-0d596f418d13', 'd249c057-fe9e-4310-ae0e-124961eee6be', '{}');
-- Chain 11 — Block potluck: one open action on Someday. Its month is August
--   (root created 8/6 — the report's "July" line was written before the dates
--   were checked); the August commitment is recorded as let go, not done.
select public.fold_task_into('50484643-6caf-41d2-acf5-46b762371183', 'e7e4ba38-dd97-43b4-9eaa-f4fce6cba7ee', '{"reopen_target":true,"bucket_from_child":true,"infer_month":"2026-08-01","infer_month_status":"removed"}');
-- Chain 12 — Car / EV (two Aug 15 placements; the 509-char notes are appended)
select public.fold_task_into('424173e1-4436-41a5-915d-ce68d2651de5', 'f9516a17-f4ce-4ccb-a714-90229ac3f056', '{"infer_month":"2026-07-01"}');
select public.fold_task_into('665605d9-ed27-4f20-9441-41ba3ef54255', 'f9516a17-f4ce-4ccb-a714-90229ac3f056', '{"reason":"D1b fold 2026-09-21 (duplicate placement)"}');

-- ── Assertions: exactly what the report promised, or nothing ────────────────
do $$
declare v int;
begin
  select count(*) into v from public.task_aliases where reason like 'D1b fold 2026-09-21%';
  if v <> 17 then raise exception 'fold: expected 17 aliases, found %', v; end if;

  select count(*) into v from public.tasks where id in (
    '338d24a4-f1a3-420b-8553-dfd081aa1691','4f757bfe-7f2e-4679-85ee-dcdd348fd359','020067d6-20a5-4367-b91d-1a7587900c41',
    '28f46872-b3b6-4f47-af25-3a84edf16e71','7cd5656e-fd71-437c-bb53-d4b1acf690a0','b0818655-7f87-4aad-8ae0-0977682c7307',
    'dc160347-8c58-469e-944a-87c085396d7c','64266352-be66-4405-ba72-61b0f65dd7c1','5b30b8ab-0dbd-41a5-ba5b-4ee8cb10020d',
    'b4b8542e-7e35-466e-8721-2e273570ef9c','eb85259b-063a-4d6d-a159-1047f6875a89','0d20d321-0f85-4c2e-ab34-45d7206a451d',
    '9fb275b0-8df3-4503-a8aa-05395ff57829','556adc35-de3e-4323-9dca-0d596f418d13','50484643-6caf-41d2-acf5-46b762371183',
    '424173e1-4436-41a5-915d-ce68d2651de5','665605d9-ed27-4f20-9441-41ba3ef54255');
  if v <> 0 then raise exception 'fold: % folded rows still present', v; end if;

  -- The 14 step links and the one by-decision row survive untouched.
  select count(*) into v from public.tasks where source_id is not null;
  if v <> 16 then raise exception 'fold: expected 16 remaining source_id links (15 steps + chain 3 outdoor table), found %', v; end if;

  -- Chain 1's five subtasks now hang off the enduring action.
  select count(*) into v from public.tasks where parent_task_id = '008abfed-0f1f-47f8-a484-6c3414a66fa2';
  if v <> 5 then raise exception 'fold: chain 1 expected 5 subtasks on the root, found %', v; end if;

  -- Chain 10: Fall + September + the week of Sep 20 on one row, dated Sep 25, one focus row.
  select count(*) into v from public.task_commitments where task_id = 'd249c057-fe9e-4310-ae0e-124961eee6be' and status = 'open';
  if v <> 3 then raise exception 'fold: chain 10 expected 3 open commitments, found %', v; end if;
  select count(*) into v from public.task_focus where task_id = 'd249c057-fe9e-4310-ae0e-124961eee6be' and date = '2026-09-25';
  if v <> 1 then raise exception 'fold: chain 10 expected 1 focus row, found %', v; end if;

  -- Chain 11: reopened, on Someday, notes kept once.
  if exists (select 1 from public.tasks where id = 'e7e4ba38-dd97-43b4-9eaa-f4fce6cba7ee' and (completed or bucket <> 'someday' or length(notes) <> 134)) then
    raise exception 'fold: chain 11 root not (open, someday, 134-char notes)';
  end if;

  -- Chain 12: the 509-char notes were appended, not dropped.
  if not exists (select 1 from public.tasks where id = 'f9516a17-f4ce-4ccb-a714-90229ac3f056' and length(notes) > 509) then
    raise exception 'fold: chain 12 notes were not merged';
  end if;

  -- No task references a retired id anywhere.
  if exists (select 1 from public.tasks t join public.task_aliases a on a.old_id in (t.source_id, t.parent_task_id, t.goal_task_id)) then
    raise exception 'fold: a task still points at a retired id';
  end if;
end $$;

commit;
