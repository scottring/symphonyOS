-- Account deletion, the database half (2026-11-13). Apple requires that a
-- person can delete their account from the iPhone app. The account-deletion
-- edge function calls delete_account_data(p_user) as service_role, then
-- deletes the auth.users row; the cascade takes the rest of that person's
-- rows. This function never deletes the auth.users row itself.
--
-- What it does, in order:
-- 1. Heir. Among the leaver's households (active membership or ownership),
--    oldest membership first, the first one with another active owner, admin
--    or member (never a display); within it by role (owner, admin, member),
--    then joined_at nulls last, then user_id. None means no heir.
-- 2. With an heir, shared things pass to the heir (user_id := heir), one
--    table at a time. A table whose move hits a unique violation is moved row
--    by row instead: only the clashing rows stay behind (to be deleted), and
--    the table is named in not_moved.
--      scope in ('couple','compound'): tasks, notes, goals, contacts,
--        routines, projects, chat_sessions;
--      all rows: family_members, meal_plans, recipes, scratchpad_notes,
--        notices, homes, kid_math_prefs, kid_math_problems;
--      goal_areas where context = 'family'; captures where household_id is
--        not null;
--      actionable_instances (who did what on which day) where the household
--        can read them: calendar events, and routines whose routine is
--        couple/compound.
--    Before the move, the leaver's own seed self row in family_members
--    (is_full_user, no auth_user_id) becomes an ordinary person row, and then
--    passes on with the leaver's other family rows, so nothing that points at
--    it (assignments, meal and notice rows, held-by and author columns) is
--    deleted or blanked. An ordinary person row is is_full_user := false,
--    role_label 'parent' if it had none (the web counts a row that is neither
--    'parent' nor a full user as a child), display_order at least 1. So it is
--    never a second self row for the heir (the unique index
--    family_members_one_self_row) and never level with the heir's own row at
--    display_order 0, where the web looks for "me". A partner who also had a
--    row in the heir's family can show there twice; accepted.
--    Then spaces and assets the leaver created follow their home's owner
--    (created_by := homes.user_id where that owner is not the leaver), with
--    or without an heir.
-- 3. Detach other people's rows from the leaver's (the three statements at
--    the top of reset_test_account): subtasks and child routines come loose,
--    meal plan entries keep the recipe's name. This runs after step 2 so that
--    a shared step under the leaver's private parent, now the heir's, is also
--    detached, and a row hanging off a shared parent that moved keeps its link.
-- 4. Households the leaver owns or is an active member of: with another
--    active human member, a household the leaver owns passes to its own heir
--    (owner_id, and that member's role becomes 'owner'); one the leaver only
--    belongs to is left as it is. With no other active human member, a
--    household the leaver owns is deleted and its display user ids returned
--    for the edge function to delete. (One owned by someone else is never
--    deleted here: that owner's account still exists.)
-- 5. First, nullable no-action foreign keys between public tables that point
--    at a row of the leaver's about to go (tasks.assigned_to -> the leaver's
--    family_members, say) are set to null, so they cannot block. Then every
--    foreign key in public that references auth.users with no delete action
--    (read from pg_constraint at run time; the live database has more than
--    the migrations show): nullable columns are set to null, otherwise the
--    rows go. Repeated while it makes progress, so one such table may
--    reference another; with no progress it raises, and nothing is changed.
-- 6. task_focus rows go (no foreign key). AI spend tables are left alone.
-- 7. A row in someone else's family that carries the leaver's sign-in (an
--    invited partner, linked by accept_household_invitation) lets go of it
--    (auth_user_id := null) and becomes an ordinary person row as in step 2,
--    so the leaver stays there as an adult with no sign-in. Otherwise the
--    auth row's ON DELETE SET NULL would turn it into a second self row for
--    its owner, the unique index would refuse, and deleting the auth user
--    would fail on every retry.
--
-- The live schema and the migrations differ, so every table and column named
-- above is skipped when it does not exist. The owner-immutable trigger on the
-- scoped tables allows the user_id change only for a service_role request (or
-- no JWT at all), which is how the edge function calls this.
-- A null p_user raises. A second call for the same user changes nothing.
-- Rollback: rollback/20261113160000_delete_account_data.down.sql.

-- Does public.<p_table> exist with every one of p_columns? Read from the
-- catalog, so it does not depend on the caller's column privileges.
create function public.delete_account_has_columns(p_table text, p_columns text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select to_regclass(format('public.%I', p_table)) is not null
     and (select count(distinct a.attname)
          from pg_catalog.pg_attribute a
          where a.attrelid = to_regclass(format('public.%I', p_table))
            and a.attname = any(p_columns) and a.attnum > 0 and not a.attisdropped) = cardinality(p_columns)
$$;

create function public.delete_account_data(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_heir uuid;
  v_member uuid;
  v_deleted integer := 0;
  v_handed integer := 0;
  v_not_moved text[] := '{}';
  v_displays uuid[] := '{}';
  v_household record;
  v_move record;
  v_key record;
  v_rows integer;
  v_progress boolean;
  v_blocked text;
  v_ids uuid[];
  v_row record;
  v_left boolean;
  v_person text := '';
begin
  if p_user is null then
    raise exception 'delete_account_data needs a user id' using errcode = '22004';
  end if;

  -- 1. Heir.
  select o.user_id into v_heir
  from public.households h
  left join public.household_members mine
    on mine.household_id = h.id and mine.user_id = p_user and mine.status = 'active'
  join public.household_members o
    on o.household_id = h.id and o.user_id <> p_user and o.status = 'active' and o.role in ('owner', 'admin', 'member')
  where h.owner_id = p_user or mine.user_id is not null
  order by mine.joined_at nulls last, h.id,
    array_position(array['owner', 'admin', 'member'], o.role), o.joined_at nulls last, o.user_id
  limit 1;

  -- What turning a family row into an ordinary person row sets, beyond
  -- is_full_user := false: an adult stays an adult, and it sorts after the
  -- remaining person's own self row.
  if public.delete_account_has_columns('family_members', array['role_label']) then
    v_person := v_person || ', role_label = coalesce(role_label, ''parent'')';
  end if;
  if public.delete_account_has_columns('family_members', array['display_order']) then
    v_person := v_person || ', display_order = greatest(coalesce(display_order, 0), 1)';
  end if;

  -- 2. Hand shared things on. The leaver's seed self row first becomes an
  -- ordinary person row, then passes on with the rest.
  if v_heir is not null then
    if public.delete_account_has_columns('family_members', array['user_id', 'is_full_user', 'auth_user_id']) then
      execute 'update public.family_members set is_full_user = false' || v_person
        || ' where user_id = $1 and is_full_user and auth_user_id is null'
        using p_user;
    end if;
    for v_move in
      select * from (values
        ('tasks', 'user_id', 'scope', $c$scope in ('couple', 'compound')$c$),
        ('notes', 'user_id', 'scope', $c$scope in ('couple', 'compound')$c$),
        ('goals', 'user_id', 'scope', $c$scope in ('couple', 'compound')$c$),
        ('contacts', 'user_id', 'scope', $c$scope in ('couple', 'compound')$c$),
        ('routines', 'user_id', 'scope', $c$scope in ('couple', 'compound')$c$),
        ('projects', 'user_id', 'scope', $c$scope in ('couple', 'compound')$c$),
        ('chat_sessions', 'user_id', 'scope', $c$scope in ('couple', 'compound')$c$),
        ('family_members', 'user_id', null, null),
        ('meal_plans', 'user_id', null, null),
        ('recipes', 'user_id', null, null),
        ('scratchpad_notes', 'user_id', null, null),
        ('notices', 'user_id', null, null),
        ('homes', 'user_id', null, null),
        ('kid_math_prefs', 'user_id', null, null),
        ('kid_math_problems', 'user_id', null, null),
        ('goal_areas', 'user_id', 'context', $c$context = 'family'$c$),
        ('captures', 'user_id', 'household_id', 'household_id is not null'),
        ('actionable_instances', 'user_id', 'entity_type',
          $c$(entity_type = 'calendar_event' or (entity_type = 'routine' and exists (
              select 1 from public.routines r
              where r.id::text = actionable_instances.entity_id and r.scope in ('couple', 'compound'))))$c$)
      ) as m(tbl, col, cond_col, cond)
    loop
      continue when not public.delete_account_has_columns(v_move.tbl, array_remove(array[v_move.col, v_move.cond_col], null));
      continue when v_move.tbl = 'actionable_instances'
        and not (public.delete_account_has_columns('actionable_instances', array['entity_id'])
                 and public.delete_account_has_columns('routines', array['id', 'scope']));
      begin
        execute format('update public.%I set %I = $1 where %I = $2', v_move.tbl, v_move.col, v_move.col)
          || coalesce(' and ' || v_move.cond, '')
          using v_heir, p_user;
      exception when unique_violation then
        -- The whole-table move was undone; move row by row so only the clashing rows stay behind.
        v_left := false;
        for v_row in execute format('select ctid as rid from public.%I where %I = $1', v_move.tbl, v_move.col)
                             || coalesce(' and ' || v_move.cond, '') using p_user
        loop
          begin
            execute format('update public.%I set %I = $1 where ctid = $2 and %I = $3', v_move.tbl, v_move.col, v_move.col)
              using v_heir, v_row.rid, p_user;
          exception when unique_violation then
            v_left := true;
          end;
        end loop;
        if v_left then v_not_moved := v_not_moved || v_move.tbl; end if;
      end;
    end loop;
  end if;

  -- Spaces and assets the leaver created follow their home's owner, now that
  -- homes have moved: the leaver's own home's go to the heir with it, and
  -- those in someone else's home go to that home's owner, heir or not. Rows in
  -- a home the leaver still owns are left for the sweep.
  for v_move in select unnest(array['spaces', 'assets']) as tbl loop
    if public.delete_account_has_columns(v_move.tbl, array['home_id', 'created_by'])
       and public.delete_account_has_columns('homes', array['id', 'user_id']) then
      begin
        execute format('update public.%I x set created_by = h.user_id from public.homes h
                        where x.home_id = h.id and x.created_by = $1 and h.user_id <> $1', v_move.tbl)
          using p_user;
      exception when unique_violation then
        v_not_moved := v_not_moved || v_move.tbl;
      end;
    end if;
  end loop;

  -- 3. Detach other people's rows from the leaver's.
  if public.delete_account_has_columns('tasks', array['id', 'user_id', 'parent_task_id']) then
    update public.tasks set parent_task_id = null
      where user_id <> p_user and parent_task_id in (select id from public.tasks where user_id = p_user);
  end if;
  if public.delete_account_has_columns('routines', array['id', 'user_id', 'parent_routine_id']) then
    update public.routines set parent_routine_id = null
      where user_id <> p_user and parent_routine_id in (select id from public.routines where user_id = p_user);
  end if;
  if public.delete_account_has_columns('meal_plan_entries', array['meal_plan_id', 'recipe_id', 'ad_hoc_title'])
     and public.delete_account_has_columns('recipes', array['id', 'user_id', 'title'])
     and public.delete_account_has_columns('meal_plans', array['id', 'user_id']) then
    execute $q$
      update public.meal_plan_entries e set ad_hoc_title = coalesce(e.ad_hoc_title, r.title), recipe_id = null
        from public.recipes r
        where e.recipe_id = r.id and r.user_id = $1
          and e.meal_plan_id not in (select id from public.meal_plans where user_id = $1)
    $q$ using p_user;
  end if;

  -- 4. Households.
  for v_household in
    select h.id, h.owner_id from public.households h
    where h.owner_id = p_user
       or exists (select 1 from public.household_members m
                  where m.household_id = h.id and m.user_id = p_user and m.status = 'active')
    order by h.id
  loop
    select o.user_id into v_member
    from public.household_members o
    where o.household_id = v_household.id and o.user_id <> p_user and o.status = 'active'
      and o.role in ('owner', 'admin', 'member')
    order by array_position(array['owner', 'admin', 'member'], o.role), o.joined_at nulls last, o.user_id
    limit 1;

    if v_member is not null then
      if v_household.owner_id = p_user then
        update public.households set owner_id = v_member where id = v_household.id;
        update public.household_members set role = 'owner' where household_id = v_household.id and user_id = v_member;
        v_handed := v_handed + 1;
      end if;
    elsif v_household.owner_id = p_user then
      if public.delete_account_has_columns('household_displays', array['household_id', 'user_id']) then
        execute 'select coalesce(array_agg(user_id order by user_id), ''{}'') from public.household_displays where household_id = $1'
          into v_ids using v_household.id;
        v_displays := v_displays || v_ids;
      end if;
      delete from public.households where id = v_household.id;
      v_deleted := v_deleted + 1;
    end if;
  end loop;

  -- 5a. Let go of rows that are about to go. A nullable foreign key with no
  -- delete action between public tables (tasks.assigned_to -> family_members,
  -- say) is set to null where it points at a row the leaver still owns and
  -- that will be deleted: its table's user_id references auth.users with
  -- CASCADE, or with no action and NOT NULL (the sweep below deletes those).
  -- Rows that stay (ai_spend has no foreign key, a nullable owner is only
  -- nulled) keep their references. NOT NULL references are left to the
  -- multi-pass sweep and the cascade.
  for v_key in
    select c.relname, a.attname, rc.relname as ref_table, ra.attname as ref_col
    from pg_catalog.pg_constraint k
    join pg_catalog.pg_class c on c.oid = k.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    join pg_catalog.pg_class rc on rc.oid = k.confrelid
    join pg_catalog.pg_namespace rn on rn.oid = rc.relnamespace
    join pg_catalog.pg_attribute ra on ra.attrelid = k.confrelid and ra.attnum = k.confkey[1]
    where k.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
      and k.confdeltype in ('a', 'r') and cardinality(k.conkey) = 1 and not a.attnotnull
      and exists (
        select 1
        from pg_catalog.pg_constraint u
        join pg_catalog.pg_attribute ua on ua.attrelid = u.conrelid and ua.attnum = u.conkey[1]
        where u.contype = 'f' and u.conrelid = k.confrelid and u.confrelid = 'auth.users'::regclass
          and cardinality(u.conkey) = 1 and ua.attname = 'user_id'
          and (u.confdeltype = 'c' or (u.confdeltype in ('a', 'r') and ua.attnotnull)))
    order by c.relname, a.attname
  loop
    execute format('update public.%I set %I = null where %I in (select %I from public.%I where user_id = $1)',
      v_key.relname, v_key.attname, v_key.attname, v_key.ref_col, v_key.ref_table) using p_user;
  end loop;

  -- 5b. Sweep what would block deleting the auth.users row. This removes the
  -- rows of ANY NOT NULL no-action foreign key to auth.users, not only owner
  -- columns: a future column that names someone other than the owner (an
  -- approved_by, say) must be nullable or have a delete action, or this
  -- deletes another person's row.
  loop
    v_progress := false;
    v_blocked := null;
    for v_key in
      select c.relname, a.attname, a.attnotnull
      from pg_catalog.pg_constraint k
      join pg_catalog.pg_class c on c.oid = k.conrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and n.nspname = 'public'
        and k.confdeltype in ('a', 'r') and cardinality(k.conkey) = 1
      order by c.relname, a.attname
    loop
      begin
        if v_key.attnotnull then
          execute format('delete from public.%I where %I = $1', v_key.relname, v_key.attname) using p_user;
        else
          execute format('update public.%I set %I = null where %I = $1', v_key.relname, v_key.attname, v_key.attname) using p_user;
        end if;
        get diagnostics v_rows = row_count;
        v_progress := v_progress or v_rows > 0;
      exception when foreign_key_violation then
        v_blocked := v_key.relname || '.' || v_key.attname || ': ' || sqlerrm;
      end;
    end loop;
    exit when v_blocked is null;
    if not v_progress then
      raise exception 'delete_account_data could not clear %', v_blocked using errcode = '23503';
    end if;
  end loop;

  -- 6. task_focus has no foreign key.
  if public.delete_account_has_columns('task_focus', array['user_id']) then
    execute 'delete from public.task_focus where user_id = $1' using p_user;
  end if;

  -- 7. Let go of the leaver's sign-in on rows in other people's families.
  if public.delete_account_has_columns('family_members', array['auth_user_id', 'is_full_user']) then
    execute 'update public.family_members set auth_user_id = null, is_full_user = false' || v_person || ' where auth_user_id = $1' using p_user;
  elsif public.delete_account_has_columns('family_members', array['auth_user_id']) then
    execute 'update public.family_members set auth_user_id = null where auth_user_id = $1' using p_user;
  end if;

  return jsonb_build_object(
    'heir', v_heir,
    'households_deleted', v_deleted,
    'households_handed_on', v_handed,
    'not_moved', to_jsonb(v_not_moved),
    'display_user_ids', to_jsonb(v_displays));
end;
$$;

revoke all on function public.delete_account_has_columns(text, text[]) from public, anon, authenticated, service_role;
revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
