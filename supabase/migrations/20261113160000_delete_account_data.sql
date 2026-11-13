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
--    table at a time: a table whose move hits a unique violation is left to be
--    deleted and named in not_moved.
--      scope in ('couple','compound'): tasks, notes, goals, contacts,
--        routines, projects, chat_sessions;
--      all rows: family_members, meal_plans, recipes, scratchpad_notes,
--        notices, homes, kid_math_prefs, kid_math_problems;
--      goal_areas where context = 'family'; captures where household_id is
--        not null; spaces.created_by and assets.created_by.
--    A space or asset the leaver created in someone else's home, still
--    unmoved (no heir, or a conflict), passes to that home's owner instead of
--    being deleted.
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
-- 5. Every foreign key in public that references auth.users with no delete
--    action (read from pg_constraint at run time; the live database has more
--    than the migrations show): nullable columns are set to null, otherwise
--    the rows go. Repeated while it makes progress, so one such table may
--    reference another.
-- 6. task_focus rows go (no foreign key). AI spend tables are left alone.
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

  -- 2. Hand shared things on.
  if v_heir is not null then
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
        ('spaces', 'created_by', null, null),
        ('assets', 'created_by', null, null)
      ) as m(tbl, col, cond_col, cond)
    loop
      continue when not public.delete_account_has_columns(v_move.tbl, array_remove(array[v_move.col, v_move.cond_col], null));
      begin
        execute format('update public.%I set %I = $1 where %I = $2', v_move.tbl, v_move.col, v_move.col)
          || coalesce(' and ' || v_move.cond, '')
          using v_heir, p_user;
      exception when unique_violation then
        v_not_moved := v_not_moved || v_move.tbl;
      end;
    end loop;
  end if;

  -- What the leaver created in someone else's home stays with that home's owner.
  for v_move in select unnest(array['spaces', 'assets']) as tbl loop
    if public.delete_account_has_columns(v_move.tbl, array['home_id', 'created_by'])
       and public.delete_account_has_columns('homes', array['id', 'user_id']) then
      begin
        execute format('update public.%I x set created_by = h.user_id from public.homes h
                        where x.home_id = h.id and x.created_by = $1 and h.user_id <> $1', v_move.tbl)
          using p_user;
      exception when unique_violation then
        if not v_move.tbl = any(v_not_moved) then v_not_moved := v_not_moved || v_move.tbl; end if;
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

  -- 5. Sweep what would block deleting the auth.users row.
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
