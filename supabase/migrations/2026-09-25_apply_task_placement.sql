-- apply_task_placement: one placement save, one transaction.
--
-- PREPARED FOR REVIEW — NOT APPLIED. Do not run against the shared project
-- until the review in docs/planning/2026-09-25-transactional-placement-review.md
-- is signed off. The app does not call this unless VITE_PLACEMENT_RPC=true
-- (off by default), so shipping the client code without this migration is
-- safe, and applying this migration without turning the switch on changes
-- nothing.
--
-- WHY. A placement save (Drop, Keep, choosing a week or a day, letting go to
-- Someday) is several writes: the task row's cached bucket/stamps, its period
-- records (task_commitments), and the day's focus (task_focus). Sent as
-- separate PostgREST requests, a failure part-way leaves the row and its
-- records disagreeing until a retry (docs/planning/2026-09-25-drop-partial-
-- failure-investigation.md; 2026-09-25-keep-update-order-investigation.md).
-- Here the same writes run in ONE transaction: all of them land, or none do.
--
-- SHAPE. The caller sends the exact sequence of writes it would otherwise
-- send one request at a time (`p_steps`), in its own order — Drop and Keep
-- write the row last, updateTask writes it first and re-asserts it after a
-- let-go. Running that sequence unchanged inside the transaction means a
-- successful save ends in exactly the state it ends in today, trigger for
-- trigger; only the failure behaviour changes (rolled back, not split).
--
--   {"t":"row",    "set": {<column>: <value>, …}}          placement columns only (see `allowed`)
--   {"t":"ensure", "level": "week|month|season", "period_start": "YYYY-MM-DD"}
--   {"t":"remove", "level": …, "period_start": …}
--   {"t":"carry",  "level": …, "period_start": …, "to": "YYYY-MM-DD"}
--   {"t":"focus_set",   "user_id": uuid, "date": "YYYY-MM-DD"}
--   {"t":"focus_clear", "user_id": uuid, "date": "YYYY-MM-DD" | null}
--
-- SECURITY.
--   SECURITY INVOKER: every statement runs as the caller, under the same RLS
--   policies the separate requests meet today. The function grants nothing the
--   caller could not already do one request at a time.
--   The row is locked FOR UPDATE first: a caller who may not update it gets
--   42501 before anything is written, and two saves of the same task
--   serialise instead of interleaving.
--   `set` accepts only placement columns; any other key is rejected (22023),
--   so this cannot become a general-purpose row writer.
--   Every step is validated (kind, level, dates, uuids) before use; values are
--   bound, never concatenated into SQL.
--   EXECUTE is granted to `authenticated` only.
--
-- IDEMPOTENT. Every step is safe to repeat: ensure is an upsert, remove/carry
-- touch only an OPEN record, focus_set ignores a duplicate, the row write sets
-- absolute values. A retry after a lost response converges.

create or replace function public.apply_task_placement(p_task_id uuid, p_steps jsonb)
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

revoke all on function public.apply_task_placement(uuid, jsonb) from public;
revoke all on function public.apply_task_placement(uuid, jsonb) from anon;
grant execute on function public.apply_task_placement(uuid, jsonb) to authenticated;

comment on function public.apply_task_placement(uuid, jsonb) is
  'One placement save (row cache + task_commitments + task_focus) in one transaction, as the caller (SECURITY INVOKER). Steps run in the order sent. Only placement columns may be written. See docs/planning/2026-09-25-transactional-placement-review.md.';
