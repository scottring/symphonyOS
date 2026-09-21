-- Follow-up to 2026-09-21_one_enduring_action.sql, found in the first browser
-- walkthrough: a commitment created through the tasks-side mirror (a row write
-- that names a period bucket — which is how every app placement lands, since
-- the row write carries the cache) was inserted at trigger depth 1, so the
-- commitments trigger at depth 2 skipped it and NO 'committed' event was
-- written; the app's own upsert then hit the conflict and inserted nothing.
-- History had a hole exactly where the model promises it. The mirror now logs
-- the event itself when it inserts or reopens a commitment.

create or replace function public.tasks_mirror_to_commitments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level text; v_start date;
  v_old_day date; v_new_day date;
  v_inserted boolean;
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
            ended_at = case when public.task_commitments.status = 'removed' then null else public.task_commitments.ended_at end
      returning (xmax = 0) into v_inserted;
      -- The commitments trigger fires at depth 2 for this write and stays
      -- quiet, so the record is written here.
      if v_inserted then
        perform public.log_placement_event(new.id, 'committed', null,
          jsonb_build_object('level', v_level, 'period_start', v_start));
      end if;
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
