-- apply_task_placement: the stale-plan refusal answers 409, not 40001.
--
-- FOLLOW-UP to 2026-09-25_apply_task_placement.sql (applied 2026-09-25 08:30
-- UTC). Prepared for review; apply only with Scott's approval.
--
-- WHY. The first version refused a stale plan with SQLSTATE 40001. Postgres
-- rolled the call back correctly — but PostgREST treats 40001 as a
-- serialization failure and RETRIES the request, immediately and repeatedly,
-- for as long as the plan stays stale. A single stale call from the demo
-- account (live verification, 2026-09-25 08:32–08:37 UTC) was retried 23,899
-- times, ~100 a second, and outlived the browser tab that sent it; it stopped
-- only when the state was made to match. Nothing was written by any retry.
-- The local proof could not see this: it calls the function directly, not
-- through PostgREST.
--
-- FIX. Refuse with 'PT409': PostgREST maps a PT-prefixed code to that HTTP
-- status and does not retry it. The client already treats a stale refusal as
-- "re-read, and let the person choose again"; it now recognises PT409.
-- Nothing else in the function changes (the body below is the applied one
-- with that one errcode and its comment).

create or replace function public.apply_task_placement(p_task_id uuid, p_steps jsonb, p_expected_open jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  step jsonb;
  kind text;
  lvl text;
  n int;
  k text;
  -- Placement columns and their bookkeeping (a push counts its deferral) —
  -- nothing else. A save that also changes title, notes, domain or anything
  -- else stays on the ordinary request path.
  allowed constant text[] := array['bucket', 'week_start', 'month_start', 'season_start',
                                   'weekend_start', 'scheduled_for', 'is_all_day', 'planned_on',
                                   'defer_count', 'deferred_until', 'week_deferred_at'];
  s jsonb;
  setlist text;
  have jsonb;
  want jsonb;
begin
  if p_task_id is null then
    raise exception 'p_task_id is required' using errcode = '22023';
  end if;
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'p_steps must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_steps) > 32 then
    raise exception 'too many steps (%)', jsonb_array_length(p_steps) using errcode = '22023';
  end if;

  -- Visible AND updatable by the caller (FOR UPDATE applies the UPDATE policy
  -- too), or nothing is written. Also serialises concurrent saves of this task.
  perform 1 from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'task not found or not writable' using errcode = '42501';
  end if;

  -- STALE PLAN CHECK, under the lock. The steps were planned from the open
  -- period records the client last read (`p_expected_open`). If another save
  -- landed in between, those steps are no longer the right ones: two clients
  -- both planning from "week of Sep 20" and choosing different weeks left
  -- Sep 27 AND Oct 4 open (Codex, reproduced in isolated PG). The lock alone
  -- only serialises; this refuses a plan made from a state that is gone.
  -- PT409 (HTTP 409 Conflict) tells the client to re-read and let the person
  -- choose again. NOT 40001: PostgREST retries 40001 as a serialization
  -- failure, immediately and repeatedly — see the header of this file.
  if p_expected_open is null or jsonb_typeof(p_expected_open) <> 'array' then
    raise exception 'p_expected_open must be a JSON array' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(x order by x), '[]'::jsonb) into want
    from (select distinct (e->>'level') || '|' || ((e->>'period_start')::date)::text as x
            from jsonb_array_elements(p_expected_open) e) w;
  select coalesce(jsonb_agg(x order by x), '[]'::jsonb) into have
    from (select distinct level || '|' || period_start::text as x
            from public.task_commitments where task_id = p_task_id and status = 'open') h;
  if have <> want then
    raise exception 'placement changed since it was read' using errcode = 'PT409',
      detail = format('expected open %s, found %s', want, have);
  end if;

  for step in select * from jsonb_array_elements(p_steps) loop
    if jsonb_typeof(step) <> 'object' then
      raise exception 'each step must be an object' using errcode = '22023';
    end if;
    kind := step->>'t';

    if kind in ('ensure', 'remove', 'carry') then
      lvl := step->>'level';
      if lvl is null or lvl not in ('week', 'month', 'season') then
        raise exception 'bad level %', lvl using errcode = '22023';
      end if;
      if (step->>'period_start') is null then
        raise exception 'period_start is required' using errcode = '22023';
      end if;
    end if;

    if kind = 'row' then
      s := step->'set';
      if s is null or jsonb_typeof(s) <> 'object' then
        raise exception 'row step needs a set object' using errcode = '22023';
      end if;
      for k in select jsonb_object_keys(s) loop
        if not (k = any(allowed)) then
          raise exception 'column % may not be written here', k using errcode = '22023';
        end if;
      end loop;
      -- Only the columns SENT, exactly as a PATCH names only what it sends:
      -- naming all of them fired column-specific triggers (UPDATE OF bucket
      -- …) on saves that never touched them (100_apply_task_placement, parity
      -- probe). Keys are validated against `allowed` above, so %I is quoting
      -- a known column name; values are typed by jsonb_populate_record and
      -- bound, never interpolated. A null defer_count is stored as 0, as the
      -- app always sends.
      if s ? 'defer_count' and jsonb_typeof(s->'defer_count') = 'null' then
        s := jsonb_set(s, '{defer_count}', '0'::jsonb);
      end if;
      select string_agg(format('%I = r.%I', key, key), ', ') into setlist from jsonb_object_keys(s) as key;
      if setlist is null then
        raise exception 'row step sets no column' using errcode = '22023';
      end if;
      execute format(
        'update public.tasks t set %s from jsonb_populate_record(null::public.tasks, $1) r where t.id = $2',
        setlist) using s, p_task_id;
      get diagnostics n = row_count;
      if n <> 1 then
        raise exception 'row write touched % rows', n using errcode = '42501';
      end if;

    elsif kind = 'ensure' then
      insert into public.task_commitments (task_id, level, period_start, status, ended_at, carried_to, created_by)
      values (p_task_id, lvl, (step->>'period_start')::date, 'open', null, null, auth.uid())
      on conflict (task_id, level, period_start) do update set
        status = 'open', ended_at = null, carried_to = null, created_by = excluded.created_by;

    elsif kind = 'remove' then
      update public.task_commitments set status = 'removed', ended_at = now()
       where task_id = p_task_id and level = lvl and period_start = (step->>'period_start')::date and status = 'open';

    elsif kind = 'carry' then
      if (step->>'to') is null then
        raise exception 'carry needs to' using errcode = '22023';
      end if;
      update public.task_commitments set status = 'carried', carried_to = (step->>'to')::date, ended_at = now()
       where task_id = p_task_id and level = lvl and period_start = (step->>'period_start')::date and status = 'open';

    elsif kind = 'focus_set' then
      insert into public.task_focus (task_id, user_id, date)
      values (p_task_id, (step->>'user_id')::uuid, (step->>'date')::date)
      on conflict (task_id, user_id, date) do nothing;

    elsif kind = 'focus_clear' then
      delete from public.task_focus
       where task_id = p_task_id and user_id = (step->>'user_id')::uuid
         and ((step->>'date') is null or date = (step->>'date')::date);

    else
      raise exception 'unknown step %', kind using errcode = '22023';
    end if;
  end loop;

  return (
    select jsonb_build_object(
      'bucket', bucket, 'week_start', week_start, 'month_start', month_start, 'season_start', season_start,
      'weekend_start', weekend_start, 'scheduled_for', scheduled_for, 'is_all_day', is_all_day,
      'planned_on', planned_on, 'defer_count', defer_count, 'deferred_until', deferred_until,
      'week_deferred_at', week_deferred_at)
    from public.tasks where id = p_task_id
  );
end;
$$;

revoke all on function public.apply_task_placement(uuid, jsonb, jsonb) from public;
revoke all on function public.apply_task_placement(uuid, jsonb, jsonb) from anon;
grant execute on function public.apply_task_placement(uuid, jsonb, jsonb) to authenticated;

comment on function public.apply_task_placement(uuid, jsonb, jsonb) is
  'One placement save (row cache + task_commitments + task_focus) in one transaction, as the caller (SECURITY INVOKER). Steps run in the order sent. Only placement columns may be written. See docs/planning/2026-09-25-transactional-placement-review.md.';
