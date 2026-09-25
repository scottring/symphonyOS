-- planning_commitments_schema.sql
--
-- SCHEMA ONLY. Reconstructed on 2026-09-25 from the LIVE catalog of the shared
-- Supabase project (read-only introspection: information_schema.columns,
-- pg_get_functiondef, pg_get_triggerdef, pg_policies, pg_constraint,
-- pg_indexes, pg_class.relrowsecurity, role_table_grants, pg_proc.proacl).
-- No user data was read. Never apply this to a shared database: it is the
-- fixture for scripts/test-planning-commitments-locally.sh, which loads it
-- into a throwaway local cluster.
--
-- Verbatim from the catalog: every trigger definition on tasks,
-- task_commitments and task_focus; every function those triggers call, and
-- every function the RLS policies call; the RLS policies themselves; the
-- CHECK / UNIQUE / PK constraints and indexes on the three tables; auth.uid(),
-- auth.role(), auth.jwt().
--
-- Fidelity gaps (deliberate — see the runner's header for the full list):
--   * tasks FKs to tables outside this fixture (family_members, goals,
--     projects, contacts, captures) are omitted; auth.users is a stub (id only).
--   * households / household_members carry only the columns the helpers read,
--     and no RLS (their live policies were not reconstructed). Only
--     season_start_for reads them un-privileged, and the tests always supply
--     explicit stamps, so it is never reached through a caller's RLS.
--   * Supabase's role setup is reduced to the three roles and the grants the
--     catalog shows on these tables; no PostgREST, no realtime publication.

create extension if not exists pgcrypto;

-- ── Roles (Supabase's) ──────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

-- ── auth (verbatim functions; users is a stub) ─────────────────────────────
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (id uuid primary key);

CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$;

CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$;

grant usage on schema public to anon, authenticated, service_role;

-- ── households / household_members (columns the helpers read) ──────────────
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Household',
  owner_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  timezone text not null default 'America/New_York',
  seasons jsonb
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id uuid not null,
  role text not null default 'member',
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- ── public.tasks (every live column, live defaults) ────────────────────────
create table public.tasks (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  completed boolean not null default false,
  scheduled_for timestamptz,
  notes text,
  phone_number text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  contact_id uuid,
  links jsonb,
  project_id uuid,
  is_all_day boolean default false,
  deferred_until timestamptz,
  defer_count integer default 0,
  assigned_to uuid,
  parent_task_id uuid,
  linked_event_id text,
  context text,
  estimated_duration integer,
  location text,
  location_place_id text,
  link_type text,
  linked_activity_type text,
  linked_activity_id text,
  category text default 'task'::text,
  google_event_id text,
  assigned_to_all uuid[] default '{}'::uuid[],
  is_waiting boolean not null default false,
  waiting_since timestamptz,
  bucket text not null default 'inbox'::text,
  needs_discussion boolean not null default false,
  discussion_note text,
  week_deferred_at timestamptz,
  group_members jsonb not null default '[]'::jsonb,
  scope text not null default 'individual'::text,
  directions jsonb,
  capture_meta jsonb,
  source_id uuid,
  goal_id uuid,
  is_fun boolean not null default false,
  picked_at timestamptz,
  week_start date,
  sort_order integer,
  waiting_for text,
  email text,
  needed_on date,
  capture_id uuid,
  month_start date,
  season_start date,
  is_goal boolean not null default false,
  goal_task_id uuid,
  planned_on date,
  completed_at timestamptz,
  weekend_start date,
  supports_goal_task_id uuid,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_category_check CHECK ((category = ANY (ARRAY['task'::text, 'chore'::text, 'errand'::text, 'event'::text, 'activity'::text, 'homework'::text]))),
  CONSTRAINT tasks_context_check CHECK ((context = ANY (ARRAY['work'::text, 'family'::text, 'personal'::text]))),
  CONSTRAINT tasks_goal_task_id_fkey FOREIGN KEY (goal_task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  CONSTRAINT tasks_link_type_check CHECK ((link_type = ANY (ARRAY['prep'::text, 'followup'::text]))),
  CONSTRAINT tasks_linked_activity_type_check CHECK ((linked_activity_type = ANY (ARRAY['task'::text, 'routine_instance'::text, 'calendar_event'::text, 'list_item'::text]))),
  CONSTRAINT tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT tasks_scope_check CHECK ((scope = ANY (ARRAY['individual'::text, 'couple'::text, 'compound'::text]))),
  CONSTRAINT tasks_source_id_fkey FOREIGN KEY (source_id) REFERENCES tasks(id) ON DELETE SET NULL,
  CONSTRAINT tasks_supports_goal_task_id_fkey FOREIGN KEY (supports_goal_task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT tasks_weekend_start_saturday CHECK (((weekend_start IS NULL) OR (EXTRACT(dow FROM weekend_start) = (6)::numeric)))
);

CREATE INDEX idx_tasks_bucket ON public.tasks USING btree (user_id, bucket);
CREATE INDEX idx_tasks_parent_task_id ON public.tasks USING btree (parent_task_id);
CREATE INDEX idx_tasks_scope ON public.tasks USING btree (user_id, scope) WHERE (scope <> 'individual'::text);
CREATE INDEX tasks_goal_task_id_idx ON public.tasks USING btree (goal_task_id) WHERE (goal_task_id IS NOT NULL);
CREATE INDEX tasks_month_start_idx ON public.tasks USING btree (month_start) WHERE (month_start IS NOT NULL);
CREATE INDEX tasks_season_start_idx ON public.tasks USING btree (season_start) WHERE (season_start IS NOT NULL);
CREATE INDEX tasks_supports_goal_task_id_idx ON public.tasks USING btree (supports_goal_task_id) WHERE (supports_goal_task_id IS NOT NULL);
CREATE INDEX tasks_user_id_idx ON public.tasks USING btree (user_id);
CREATE INDEX tasks_week_start_idx ON public.tasks USING btree (week_start) WHERE (week_start IS NOT NULL);

-- ── public.task_commitments ─────────────────────────────────────────────────
create table public.task_commitments (
  id uuid not null default gen_random_uuid(),
  task_id uuid not null,
  level text not null,
  period_start date not null,
  status text not null default 'open'::text,
  carried_to date,
  created_at timestamptz not null default now(),
  created_by uuid,
  ended_at timestamptz,
  CONSTRAINT task_commitments_pkey PRIMARY KEY (id),
  CONSTRAINT task_commitments_level_check CHECK ((level = ANY (ARRAY['season'::text, 'month'::text, 'week'::text]))),
  CONSTRAINT task_commitments_status_check CHECK ((status = ANY (ARRAY['open'::text, 'done'::text, 'carried'::text, 'removed'::text]))),
  CONSTRAINT task_commitments_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_commitments_task_id_level_period_start_key UNIQUE (task_id, level, period_start)
);
CREATE INDEX task_commitments_open_period_idx ON public.task_commitments USING btree (level, period_start) WHERE (status = 'open'::text);
CREATE INDEX task_commitments_task_idx ON public.task_commitments USING btree (task_id);

-- ── public.task_focus ───────────────────────────────────────────────────────
create table public.task_focus (
  task_id uuid not null,
  user_id uuid not null,
  date date not null,
  created_at timestamptz not null default now(),
  CONSTRAINT task_focus_pkey PRIMARY KEY (task_id, user_id, date),
  CONSTRAINT task_focus_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX task_focus_user_date_idx ON public.task_focus USING btree (user_id, date);

-- ── public.task_placement_events (written by log_placement_event) ──────────
create table public.task_placement_events (
  id bigint generated always as identity,
  task_id uuid not null,
  at timestamptz not null default now(),
  by uuid,
  kind text not null,
  from_value jsonb,
  to_value jsonb,
  CONSTRAINT task_placement_events_pkey PRIMARY KEY (id),
  CONSTRAINT task_placement_events_kind_check CHECK ((kind = ANY (ARRAY['committed'::text, 'removed'::text, 'carried'::text, 'done'::text, 'scheduled'::text, 'rescheduled'::text, 'unscheduled'::text, 'completed'::text, 'reopened'::text, 'folded'::text]))),
  CONSTRAINT task_placement_events_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- ── Helper functions (verbatim) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.users_share_household(user_a uuid, user_b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    user_a = user_b
    or exists (
      select 1
      from household_members hm_a
      join household_members hm_b on hm_a.household_id = hm_b.household_id
      where hm_a.user_id = user_a
        and hm_b.user_id = user_b
        and hm_a.status = 'active'
        and hm_b.status = 'active'
    );
$function$;

CREATE OR REPLACE FUNCTION public.task_reachable(p_task uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task
      and (
        t.user_id = (select auth.uid())
        or (t.scope in ('couple', 'compound') and public.users_share_household((select auth.uid()), t.user_id))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.week_start_of(p_day date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select p_day - extract(dow from p_day)::int;
$function$;

CREATE OR REPLACE FUNCTION public.season_start_for(p_user uuid, p_date date)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_seasons jsonb;
  v_year int := extract(year from p_date)::int;
  v_best date := null;
  v_candidate date;
  v_b jsonb;
begin
  select h.seasons into v_seasons
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = p_user
  limit 1;

  if v_seasons is null or jsonb_typeof(v_seasons) <> 'array' or jsonb_array_length(v_seasons) <> 4 then
    v_seasons := '[{"name":"Spring","month":3,"day":1},{"name":"Summer","month":6,"day":1},{"name":"Fall","month":9,"day":1},{"name":"Winter","month":12,"day":1}]'::jsonb;
  end if;

  -- The latest boundary on or before the date, looking at this year and last
  -- (a January date belongs to the season that began in December).
  for v_b in select * from jsonb_array_elements(v_seasons) loop
    foreach v_candidate in array array[
      make_date(v_year, (v_b->>'month')::int, least((v_b->>'day')::int, extract(day from (date_trunc('month', make_date(v_year, (v_b->>'month')::int, 1)) + interval '1 month - 1 day'))::int)),
      make_date(v_year - 1, (v_b->>'month')::int, least((v_b->>'day')::int, extract(day from (date_trunc('month', make_date(v_year - 1, (v_b->>'month')::int, 1)) + interval '1 month - 1 day'))::int))
    ] loop
      if v_candidate <= p_date and (v_best is null or v_candidate > v_best) then
        v_best := v_candidate;
      end if;
    end loop;
  end loop;

  return v_best;
end;
$function$;

CREATE OR REPLACE FUNCTION public.log_placement_event(p_task uuid, p_kind text, p_from jsonb, p_to jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.task_placement_events (task_id, by, kind, from_value, to_value)
  values (p_task, auth.uid(), p_kind, p_from, p_to);
$function$;

CREATE OR REPLACE FUNCTION public.tasks_sync_from_commitments(p_task uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- ── Trigger functions (verbatim) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.task_commitments_after_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  r := coalesce(new, old);
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
$function$;

CREATE OR REPLACE FUNCTION public.tasks_align_week_to_day()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.scheduled_for is not null
     and (tg_op = 'INSERT' or new.scheduled_for is distinct from old.scheduled_for) then
    new.week_start := public.week_start_of((new.scheduled_for at time zone 'America/New_York')::date);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tasks_fill_period_stamps()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  if new.bucket = 'week' and new.week_start is null then
    new.week_start := v_today - extract(dow from v_today)::int;
  elsif new.bucket = 'month' and new.month_start is null then
    new.month_start := date_trunc('month', v_today)::date;
  elsif new.bucket = 'quarter' and new.season_start is null then
    new.season_start := public.season_start_for(new.user_id, v_today);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_goal_support()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  parent public.tasks%rowtype;
begin
  if new.supports_goal_task_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.supports_goal_task_id is not distinct from old.supports_goal_task_id then
    return new;
  end if;

  if new.supports_goal_task_id = new.id then
    raise exception 'a goal cannot support itself'
      using errcode = '23514';
  end if;

  if not coalesce(new.is_goal, false) or new.bucket <> 'month' then
    raise exception 'only a month goal may support a season goal'
      using errcode = '23514',
            hint = 'A step belongs under goal_task_id; a season goal records its year goal on goal_id.';
  end if;

  select * into parent from public.tasks where id = new.supports_goal_task_id;
  if not found then
    raise exception 'the supported goal does not exist'
      using errcode = '23503';
  end if;

  if not coalesce(parent.is_goal, false) or parent.bucket <> 'quarter' then
    raise exception 'a month goal may only support a SEASON goal'
      using errcode = '23514',
            hint = 'The supported row must be an is_goal task on a season list.';
  end if;

  -- Same household, judged exactly as every sharing predicate on tasks judges
  -- it. Assignment does not widen this: a goal you can see because it was
  -- assigned to you still belongs to its owner's household.
  if not public.users_share_household(new.user_id, parent.user_id) then
    raise exception 'a goal may only support a goal in the same household'
      using errcode = '42501';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.guard_owner_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- auth.role() is the request JWT's role: 'anon', 'authenticated',
  -- 'service_role', or NULL when there is no request JWT (a direct session).
  if new.user_id is distinct from old.user_id
     and coalesce(auth.role(), 'service_role') <> 'service_role' then
    raise exception 'user_id is immutable'
      using errcode = '42501',
            hint = 'Assign the item instead of changing its owner.';
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.tasks_mirror_to_commitments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- ── Triggers (verbatim pg_get_triggerdef) ───────────────────────────────────
CREATE TRIGGER task_commitments_after_change AFTER INSERT OR DELETE OR UPDATE ON public.task_commitments FOR EACH ROW EXECUTE FUNCTION task_commitments_after_change();
CREATE TRIGGER tasks_align_week_to_day BEFORE INSERT OR UPDATE OF scheduled_for ON public.tasks FOR EACH ROW EXECUTE FUNCTION tasks_align_week_to_day();
CREATE TRIGGER tasks_fill_period_stamps BEFORE INSERT OR UPDATE OF bucket ON public.tasks FOR EACH ROW EXECUTE FUNCTION tasks_fill_period_stamps();
CREATE TRIGGER tasks_guard_goal_support BEFORE INSERT OR UPDATE OF supports_goal_task_id, is_goal, bucket ON public.tasks FOR EACH ROW EXECUTE FUNCTION guard_goal_support();
CREATE TRIGGER tasks_guard_owner BEFORE UPDATE OF user_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION guard_owner_immutable();
CREATE TRIGGER tasks_mirror_to_commitments AFTER INSERT OR UPDATE OF bucket, week_start, month_start, season_start, scheduled_for, is_all_day, completed, completed_at ON public.tasks FOR EACH ROW EXECUTE FUNCTION tasks_mirror_to_commitments();

-- ── Function EXECUTE grants (live proacl) ───────────────────────────────────
revoke execute on function public.log_placement_event(uuid, text, jsonb, jsonb) from public;
revoke execute on function public.task_commitments_after_change() from public;
revoke execute on function public.tasks_mirror_to_commitments() from public;
revoke execute on function public.tasks_sync_from_commitments(uuid) from public;
grant execute on function public.log_placement_event(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.task_commitments_after_change() to service_role;
grant execute on function public.tasks_mirror_to_commitments() to service_role;
grant execute on function public.tasks_sync_from_commitments(uuid) to service_role;

-- ── Table grants (live role_table_grants: anon + authenticated have all) ───
grant select, insert, update, delete, truncate, references, trigger
  on public.tasks, public.task_commitments, public.task_focus, public.task_placement_events,
     public.households, public.household_members
  to anon, authenticated, service_role;

-- ── RLS (enabled, not forced — as live) and policies (verbatim) ────────────
alter table public.tasks enable row level security;
alter table public.task_commitments enable row level security;
alter table public.task_focus enable row level security;
alter table public.task_placement_events enable row level security;

create policy "Users can create own tasks" on public.tasks as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "Users can delete tasks" on public.tasks as permissive for delete to public
  using (((auth.uid() = user_id) OR ((scope = ANY (ARRAY['couple'::text, 'compound'::text])) AND users_share_household(auth.uid(), user_id))));
create policy "Users can update tasks" on public.tasks as permissive for update to public
  using (((auth.uid() = user_id) OR ((scope = ANY (ARRAY['couple'::text, 'compound'::text])) AND users_share_household(auth.uid(), user_id))))
  with check (((auth.uid() = user_id) OR ((scope = ANY (ARRAY['couple'::text, 'compound'::text])) AND users_share_household(auth.uid(), user_id))));
create policy "Users can view tasks" on public.tasks as permissive for select to public
  using (((auth.uid() = user_id) OR ((scope = ANY (ARRAY['couple'::text, 'compound'::text])) AND users_share_household(auth.uid(), user_id))));

create policy "commitments follow the task" on public.task_commitments as permissive for all to authenticated
  using (task_reachable(task_id)) with check (task_reachable(task_id));

create policy "focus is your own" on public.task_focus as permissive for insert to authenticated
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND task_reachable(task_id)));
create policy "focus readable with the task" on public.task_focus as permissive for select to authenticated
  using (task_reachable(task_id));
create policy "unfocus is your own" on public.task_focus as permissive for delete to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "events follow the task" on public.task_placement_events as permissive for select to authenticated
  using (task_reachable(task_id));
