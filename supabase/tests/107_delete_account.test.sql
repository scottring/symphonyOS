-- 107_delete_account.test.sql
-- Proof for 20261113160000_delete_account_data.sql. Run by
-- scripts/test-delete-account.mjs on a throwaway cluster whose stub schema
-- mirrors the live foreign-key shapes. Setup and checks run as postgres; the
-- function is called as service_role with a service_role JWT, the way the
-- account-deletion edge function calls it; the app check acts as
-- `authenticated`. Ends in ROLLBACK.
--
-- A owns household H1, B is an active member, AD is H1's display.
-- C is alone in H2 with display CD. E owns H3, D is a member who leaves.
-- F owns H4, where G's invitation is still pending: F counts as alone.
-- Family rows have the live invitation shape: each owner's self row
-- (is_full_user, no sign-in), plus a row in the inviter's family carrying the
-- joiner's sign-in (accept_household_invitation). B joined A's household and
-- D joined E's; B and D also have their own self rows. A (the owner) leaving
-- is the mirror of D (the joiner) leaving.
begin;

create temp table ids (k text primary key, v uuid) on commit drop;
create temp table results (k text primary key, r jsonb) on commit drop;
grant all on ids, results to authenticated, service_role;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;

do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); ad uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); cd uuid := gen_random_uuid(); d uuid := gen_random_uuid(); e uuid := gen_random_uuid();
  f uuid := gen_random_uuid(); g uuid := gen_random_uuid(); h4 uuid; c_child uuid; a_child uuid;
  h1 uuid; h2 uuid; h3 uuid; t_priv uuid; t_shared uuid; r_priv uuid; home_a uuid; home_e uuid; recipe uuid; mp_b uuid; mp_a uuid;
  cap_b uuid; blk uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'symphony-107-a@gmail.com', 'authenticated', 'authenticated'),
    (b, 'symphony-107-b@gmail.com', 'authenticated', 'authenticated'),
    (c, 'symphony-107-c@gmail.com', 'authenticated', 'authenticated'),
    (d, 'symphony-107-d@gmail.com', 'authenticated', 'authenticated'),
    (e, 'symphony-107-e@gmail.com', 'authenticated', 'authenticated'),
    (f, 'symphony-107-f@gmail.com', 'authenticated', 'authenticated'),
    (g, 'symphony-107-g@gmail.com', 'authenticated', 'authenticated');
  insert into auth.users (id, aud, role) values (ad, 'authenticated', 'authenticated'), (cd, 'authenticated', 'authenticated');

  insert into public.households (owner_id, name) values (a, 'H1') returning id into h1;
  insert into public.households (owner_id, name) values (c, 'H2') returning id into h2;
  insert into public.households (owner_id, name) values (e, 'H3') returning id into h3;
  insert into public.households (owner_id, name) values (f, 'H4') returning id into h4;
  insert into public.household_members (household_id, user_id, role, status, joined_at) values
    (h1, a, 'owner', 'active', '2026-01-01'), (h1, b, 'member', 'active', '2026-02-01'), (h1, ad, 'display', 'active', '2026-01-15'),
    (h2, c, 'owner', 'active', '2026-03-01'), (h2, cd, 'display', 'active', '2026-03-02'),
    (h3, e, 'owner', 'active', '2026-04-01'), (h3, d, 'member', 'active', '2026-04-02'),
    (h4, f, 'owner', 'active', '2026-05-01');
  insert into public.household_members (household_id, user_id, role, status) values (h4, g, 'member', 'pending');
  insert into public.household_displays (household_id, user_id) values (h1, ad), (h2, cd);

  -- A's tasks: shared, private, and a shared step under the private one.
  insert into public.tasks (user_id, scope, title) values (a, 'couple', '107 A shared') returning id into t_shared;
  insert into public.tasks (user_id, scope, title) values (a, 'individual', '107 A private') returning id into t_priv;
  insert into public.tasks (user_id, scope, title, parent_task_id) values (a, 'couple', '107 A shared step', t_priv);
  -- B's own tasks hanging off A's.
  insert into public.tasks (user_id, scope, title, parent_task_id) values
    (b, 'individual', '107 B under A private', t_priv), (b, 'individual', '107 B under A shared', t_shared);

  insert into public.routines (user_id, scope, name) values (a, 'couple', '107 A shared routine');
  insert into public.routines (user_id, scope, name) values (a, 'individual', '107 A private routine') returning id into r_priv;
  insert into public.routines (user_id, scope, name, parent_routine_id) values (a, 'compound', '107 A shared step routine', r_priv);
  insert into public.notes (user_id, scope, title) values (a, 'individual', '107 A private note'), (a, 'couple', '107 A shared note');
  insert into public.goal_areas (user_id, context, name) values (a, 'family', '107 A family area'), (a, 'personal', '107 A private area');
  insert into public.goals (user_id, scope, name) values (a, 'couple', '107 A shared goal'), (a, 'individual', '107 A private goal');
  insert into public.contacts (user_id, scope, name) values (a, 'compound', '107 A shared contact');
  insert into public.projects (user_id, scope, name) values (a, 'individual', '107 A private project');
  insert into public.family_members (user_id, auth_user_id, is_full_user, name) values
    (a, null, true, '107 A self'), (a, b, true, '107 B in A'), (b, null, true, '107 B self');
  insert into public.family_members (user_id, auth_user_id, name) values (a, null, '107 A child') returning id into a_child;
  -- B's own tasks assigned to A's child and to A.
  insert into public.tasks (user_id, scope, title, assigned_to) values (b, 'individual', '107 B for A child', a_child);
  insert into public.tasks (user_id, scope, title, assigned_to) values
    (b, 'individual', '107 B for A', (select id from public.family_members where name = '107 A self'));
  -- Who did what on which day: a shared routine's, a calendar event's, a
  -- private routine's, and one that clashes with B's own row for the same day.
  insert into public.actionable_instances (user_id, entity_type, entity_id, date) values
    (a, 'routine', (select id::text from public.routines where name = '107 A shared routine'), '2026-11-10'),
    (a, 'calendar_event', 'gcal-107', '2026-11-10'),
    (a, 'routine', r_priv::text, '2026-11-10'),
    (a, 'calendar_event', 'gcal-107-clash', '2026-11-11'),
    (b, 'calendar_event', 'gcal-107-clash', '2026-11-11');
  insert into public.chat_sessions (user_id, scope, title) values (a, 'individual', '107 A private chat'), (a, 'couple', '107 A shared chat');
  insert into public.evening_reflections (user_id, body) values (a, '107 A reflection');
  insert into public.scratchpad_notes (user_id, body) values (a, '107 A scratch');
  insert into public.captures (user_id, household_id, body) values (a, h1, '107 A household capture'), (a, null, '107 A private capture');
  insert into public.captures (user_id, household_id, body) values (b, h1, '107 B capture') returning id into cap_b;
  insert into public.school_mail_reviews (capture_id, reviewed_by) values (cap_b, a);

  -- Meals: A's recipe moves to B and B's plan keeps it; A's week of 9 November clashes with B's, 16 November does not.
  insert into public.recipes (user_id, title) values (a, '107 A recipe') returning id into recipe;
  insert into public.meal_plans (user_id, week_start) values (b, '2026-11-09') returning id into mp_b;
  insert into public.meal_plans (user_id, week_start) values (a, '2026-11-09') returning id into mp_a;
  insert into public.meal_plans (user_id, week_start) values (a, '2026-11-16');
  insert into public.meal_plan_entries (meal_plan_id, recipe_id) values (mp_b, recipe), (mp_a, recipe);

  -- Home registry: A's home with a space and an asset A created.
  insert into public.homes (user_id, name) values (a, '107 A home') returning id into home_a;
  insert into public.spaces (home_id, created_by, name) values (home_a, a, '107 A space');
  insert into public.assets (home_id, space_id, created_by, name) values (home_a, (select id from public.spaces where name = '107 A space'), a, '107 A asset');
  -- C once belonged with E and created a space in E's home; C now has no heir.
  insert into public.homes (user_id, name) values (e, '107 E home') returning id into home_e;
  insert into public.spaces (home_id, created_by, name) values (home_e, c, '107 C space in E home'), (home_e, a, '107 A space in E home');

  -- Two no-action tables, one referencing the other (the sweep needs a second pass).
  insert into public.playbook_blocks (user_id) values (a) returning id into blk;
  insert into public.playbook_instances (user_id, block_id) values (a, blk);
  insert into public.task_focus (user_id, task_id) values (a, t_priv);
  insert into public.ai_spend (user_id, household_id, route, model) values (a, h1, 'chat', 'claude-sonnet-4-6');

  -- C and D.
  insert into public.tasks (user_id, scope, title) values (c, 'couple', '107 C shared'), (d, 'couple', '107 D shared'), (d, 'individual', '107 D private');
  insert into public.family_members (user_id, name) values (c, '107 C self');
  -- C's child, with things assigned to it (nullable, no delete action) and screen time (NOT NULL, no delete action).
  insert into public.family_members (user_id, name) values (c, '107 C child') returning id into c_child;
  insert into public.routines (user_id, scope, name, assigned_to) values (c, 'individual', '107 C routine for child', c_child);
  insert into public.tasks (user_id, scope, title, assigned_to) values (c, 'individual', '107 C task for child', c_child);
  insert into public.event_notes (user_id, assigned_to, body) values (c, c_child, '107 C event note');
  insert into public.actionable_instances (user_id, entity_type, entity_id, date, assigned_to_override) values (c, 'calendar_event', 'gcal-107-c', '2026-11-10', c_child);
  insert into public.screen_time_entries (user_id, family_member_id, minutes) values (c, c_child, 30);
  insert into public.tasks (user_id, scope, title) values (f, 'couple', '107 F shared');
  insert into public.chat_sessions (user_id, scope, title) values (d, 'individual', '107 D chat');
  -- D joined E's household by invitation.
  insert into public.family_members (user_id, auth_user_id, is_full_user, name) values
    (e, null, true, '107 E self'), (e, d, true, '107 D in E'), (d, null, true, '107 D self');

  insert into ids values ('a', a), ('b', b), ('ad', ad), ('c', c), ('cd', cd), ('d', d), ('e', e),
    ('f', f), ('g', g), ('h1', h1), ('h2', h2), ('h3', h3), ('h4', h4), ('a_child', a_child), ('t_priv', t_priv), ('t_shared', t_shared), ('recipe', recipe);
  insert into ids select 'n_priv', id from public.notes where title = '107 A private note';
  insert into ids select 'r_priv', r_priv;
end $$;

-- 1. The app cannot call it.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('a'), 'role', 'authenticated')::text, true);
do $$ begin
  begin
    perform public.delete_account_data(pg_temp.id('a'));
    assert false, '1: authenticated may call delete_account_data';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 2. The edge function calls it as service_role.
reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
do $$ begin
  begin
    perform public.delete_account_data(null);
    assert false, '2: a null user did not raise';
  exception when null_value_not_allowed then null;
  end;
  insert into results values ('a', public.delete_account_data(pg_temp.id('a')));
  insert into results values ('c', public.delete_account_data(pg_temp.id('c')));
  insert into results values ('d', public.delete_account_data(pg_temp.id('d')));
  insert into results values ('d2', public.delete_account_data(pg_temp.id('d')));
  insert into results values ('f', public.delete_account_data(pg_temp.id('f')));
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- 3. What the function returns.
do $$
declare ra jsonb := (select r from results where k = 'a'); rc jsonb := (select r from results where k = 'c');
  rd jsonb := (select r from results where k = 'd'); rd2 jsonb := (select r from results where k = 'd2');
begin
  assert (ra->>'heir')::uuid = pg_temp.id('b'), '3: A''s heir is not B: ' || ra::text;
  assert (ra->>'households_handed_on')::int = 1 and (ra->>'households_deleted')::int = 0, '3: A''s household counts: ' || ra::text;
  assert ra->'not_moved' = '["meal_plans", "actionable_instances"]'::jsonb, '3: A''s not_moved should name only meal_plans and actionable_instances: ' || ra::text;
  assert ra->'display_user_ids' = '[]'::jsonb, '3: a kept household''s display was listed: ' || ra::text;

  assert ra ? 'heir' and rc ? 'heir' and rc->>'heir' is null, '3: C has an heir: ' || rc::text;
  assert (rc->>'households_deleted')::int = 1 and (rc->>'households_handed_on')::int = 0, '3: C''s household counts: ' || rc::text;
  assert rc->'display_user_ids' = jsonb_build_array(pg_temp.id('cd')), '3: C''s display not listed: ' || rc::text;
  assert not exists (select 1 from public.households where id = pg_temp.id('h2')), '3: C''s household still exists';

  assert (rd->>'heir')::uuid = pg_temp.id('e'), '3: D''s heir is not E: ' || rd::text;
  assert (rd->>'households_handed_on')::int = 0 and (rd->>'households_deleted')::int = 0, '3: D''s household counts: ' || rd::text;
  assert rd->'not_moved' = '[]'::jsonb, '3: D''s family rows did not all move to E: ' || rd::text;
  assert (select owner_id from public.households where id = pg_temp.id('h3')) = pg_temp.id('e'), '3: H3 lost its owner';
  assert (select role from public.household_members where household_id = pg_temp.id('h3') and user_id = pg_temp.id('e')) = 'owner', '3: E is no longer owner';
  assert (rd2->>'households_handed_on')::int = 0 and (rd2->>'households_deleted')::int = 0 and rd2->'not_moved' = '[]'::jsonb,
    '3: a second call for D changed something: ' || rd2::text;

  assert (select r->>'heir' from results where k = 'f') is null, '3: F''s pending invitee became heir';
  assert (select (r->>'households_deleted')::int from results where k = 'f') = 1, '3: F''s household (only a pending invitee) was not deleted';
  assert not exists (select 1 from public.households where id = pg_temp.id('h4')), '3: H4 still exists';
  assert not exists (select 1 from public.households where owner_id = pg_temp.id('g')), '3: the pending invitee was given a household';
  assert (select user_id from public.tasks where title = '107 F shared') = pg_temp.id('f'), '3: F''s shared task moved to the pending invitee';
end $$;

-- 4. Deleting the auth users raises nothing. D first and alone: D's sign-in
-- is on E's row, and the auth row's ON DELETE SET NULL must not make a second
-- self row for E.
do $$ begin
  begin
    delete from auth.users where id = pg_temp.id('d');
  exception when others then
    assert false, '4: deleting D (who joined E''s household by invitation) failed: ' || sqlerrm;
  end;
  begin
    delete from auth.users where id in (pg_temp.id('a'), pg_temp.id('c'), pg_temp.id('cd'), pg_temp.id('f'));
  exception when others then
    assert false, '4: deleting the auth users was blocked: ' || sqlerrm;
  end;
end $$;

-- 5. What remains.
do $$
declare a uuid := pg_temp.id('a'); b uuid := pg_temp.id('b'); h1 uuid := pg_temp.id('h1');
begin
  assert (select user_id from public.tasks where id = pg_temp.id('t_shared')) = b, '5: A''s shared task did not pass to B';
  assert (select user_id from public.tasks where title = '107 A shared step') = b, '5: A''s shared step is gone or did not pass to B';
  assert (select parent_task_id from public.tasks where title = '107 A shared step') is null, '5: A''s shared step still points at the private task';
  assert not exists (select 1 from public.tasks where id = pg_temp.id('t_priv')), '5: A''s private task survived';
  assert (select user_id from public.routines where name = '107 A shared routine') = b, '5: A''s shared routine did not pass to B';
  assert (select user_id from public.routines where name = '107 A shared step routine') = b, '5: A''s shared step routine is gone';
  assert not exists (select 1 from public.routines where name = '107 A private routine'), '5: A''s private routine survived';
  assert not exists (select 1 from public.notes where title = '107 A private note'), '5: A''s private note survived';
  assert (select user_id from public.notes where title = '107 A shared note') = b, '5: A''s shared note did not pass to B';
  assert (select user_id from public.goals where name = '107 A shared goal') = b, '5: A''s shared goal did not pass to B';
  assert not exists (select 1 from public.goals where name = '107 A private goal'), '5: A''s private goal survived';
  assert (select user_id from public.contacts where name = '107 A shared contact') = b, '5: A''s shared contact did not pass to B';
  assert not exists (select 1 from public.projects where name = '107 A private project'), '5: A''s private project survived';
  assert (select user_id from public.goal_areas where name = '107 A family area') = b, '5: A''s family goal area did not pass to B';
  assert not exists (select 1 from public.goal_areas where name = '107 A private area'), '5: A''s private goal area survived';

  assert (select count(*) from public.family_members where name in ('107 A self', '107 A child', '107 B in A') and user_id = b) = 3, '5: A''s family members did not pass to B';
  -- The mirror of D: A stays in B's family as a person with no sign-in, not
  -- as a second self row for B; B's own self row and sign-in row are as they were.
  assert (select (auth_user_id is null and not is_full_user) from public.family_members where name = '107 A self'), '5: A''s self row is still a self row';
  assert (select (user_id = b and auth_user_id is null and is_full_user) from public.family_members where name = '107 B self'), '5: B''s own self row changed';
  assert (select (auth_user_id = b and is_full_user) from public.family_members where name = '107 B in A'), '5: B''s sign-in row changed';
  assert (select count(*) from public.family_members where user_id = b and is_full_user and auth_user_id is null) = 1, '5: B does not have exactly one self row';
  assert (select assigned_to from public.tasks where title = '107 B for A child') = pg_temp.id('a_child'), '5: B''s task lost its assignment to A''s child';
  assert (select assigned_to from public.tasks where title = '107 B for A') = (select id from public.family_members where name = '107 A self'), '5: B''s task lost its assignment to A';

  -- D, who joined E's household, stays in E's family as a person with no sign-in.
  assert (select (user_id = pg_temp.id('e') and auth_user_id is null and not is_full_user) from public.family_members where name = '107 D in E'),
    '5: D''s row in E''s family is gone, still signed in, or still a full user';
  assert (select (user_id = pg_temp.id('e') and not is_full_user) from public.family_members where name = '107 D self'), '5: D''s own row did not pass to E as a person';
  assert (select (auth_user_id is null and is_full_user) from public.family_members where name = '107 E self'), '5: E''s self row changed';

  -- Who did what on which day: shared routine and calendar rows pass to B, a private routine's go,
  -- and the clashing one is left to go while B's own row for that day stays.
  assert (select user_id from public.actionable_instances where entity_type = 'routine'
          and entity_id = (select id::text from public.routines where name = '107 A shared routine')) = b, '5: A''s shared routine instance did not pass to B';
  assert (select user_id from public.actionable_instances where entity_id = 'gcal-107') = b, '5: A''s calendar event instance did not pass to B';
  assert not exists (select 1 from public.actionable_instances where entity_id = pg_temp.id('r_priv')::text), '5: A''s private routine instance survived';
  assert (select count(*) from public.actionable_instances where entity_id = 'gcal-107-clash') = 1
     and (select user_id from public.actionable_instances where entity_id = 'gcal-107-clash') = b, '5: the clashing instance was not left to go, or B''s own was lost';

  assert not exists (select 1 from public.chat_sessions where title = '107 A private chat'), '5: A''s private chat survived';
  assert (select user_id from public.chat_sessions where title = '107 A shared chat') = b, '5: A''s shared chat did not pass to B';
  assert not exists (select 1 from public.evening_reflections where body = '107 A reflection'), '5: A''s reflection survived';
  assert exists (select 1 from public.school_mail_reviews r join public.captures c on c.id = r.capture_id where c.body = '107 B capture' and r.reviewed_by is null),
    '5: B''s mail review was lost or still names A';
  assert (select user_id from public.scratchpad_notes where body = '107 A scratch') = b, '5: A''s scratchpad note did not pass to B';
  assert (select user_id from public.captures where body = '107 A household capture') = b, '5: A''s household capture did not pass to B';
  assert not exists (select 1 from public.captures where body = '107 A private capture'), '5: A''s private capture survived';

  assert (select user_id from public.recipes where id = pg_temp.id('recipe')) = b, '5: A''s recipe did not pass to B';
  assert (select recipe_id from public.meal_plan_entries e join public.meal_plans p on p.id = e.meal_plan_id where p.user_id = b) = pg_temp.id('recipe'),
    '5: B''s meal plan lost A''s recipe';
  assert (select user_id from public.meal_plans where week_start = '2026-11-16') = b, '5: A''s non-clashing week did not pass to B';
  assert (select count(*) from public.meal_plans where week_start = '2026-11-09') = 1, '5: A''s clashing week was not left to go';

  assert (select user_id from public.homes where name = '107 A home') = b, '5: A''s home did not pass to B';
  assert (select created_by from public.spaces where name = '107 A space') = b, '5: A''s space did not pass to B';
  assert (select created_by from public.assets where name = '107 A asset') = b, '5: A''s asset did not pass to B';
  assert (select created_by from public.spaces where name = '107 C space in E home') = pg_temp.id('e'), '5: C''s space in E''s home was not kept for E';
  assert (select created_by from public.spaces where name = '107 A space in E home') = pg_temp.id('e'), '5: A''s space in E''s home did not follow E';
  assert not exists (select 1 from public.family_members where name in ('107 C self', '107 C child')), '5: C''s family rows survived';
  assert not exists (select 1 from public.screen_time_entries) and not exists (select 1 from public.event_notes)
    and not exists (select 1 from public.actionable_instances where entity_id = 'gcal-107-c'), '5: C''s child-linked rows survived';

  assert not exists (select 1 from public.playbook_blocks where user_id = a) and not exists (select 1 from public.playbook_instances where user_id = a), '5: A''s playbook rows survived';
  assert not exists (select 1 from public.task_focus where user_id = a), '5: A''s task_focus row survived';
  assert exists (select 1 from public.ai_spend where user_id = a), '5: A''s AI spend was touched';

  assert (select owner_id from public.households where id = h1) = b, '5: H1 is not owned by B';
  assert (select role from public.household_members where household_id = h1 and user_id = b) = 'owner', '5: B is not H1''s owner';
  assert not exists (select 1 from public.household_members where user_id = a), '5: A still has a membership';
  assert exists (select 1 from public.household_displays where household_id = h1 and user_id = pg_temp.id('ad')), '5: H1''s display was removed';

  assert (select parent_task_id from public.tasks where title = '107 B under A private') is null, '5: B''s task under A''s private task is gone or still linked';
  assert (select parent_task_id from public.tasks where title = '107 B under A shared') = pg_temp.id('t_shared'), '5: B''s task lost its shared parent';

  assert (select user_id from public.tasks where title = '107 D shared') = pg_temp.id('e'), '5: D''s shared task did not pass to E';
  assert not exists (select 1 from public.tasks where title in ('107 D private', '107 C shared')), '5: D''s private or C''s task survived';
  assert not exists (select 1 from public.chat_sessions where title = '107 D chat'), '5: D''s chat survived';
end $$;

-- 6. Acting as B.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('b'), 'role', 'authenticated')::text, true);
do $$ begin
  assert exists (select 1 from public.tasks where id = pg_temp.id('t_shared')), '6: B cannot see the shared task';
  assert (select count(*) from public.tasks where id = pg_temp.id('t_priv')) = 0, '6: B sees A''s private task';
  assert (select count(*) from public.notes where id = pg_temp.id('n_priv')) = 0, '6: B sees A''s private note';
  assert (select count(*) from public.routines where id = pg_temp.id('r_priv')) = 0, '6: B sees A''s private routine';
end $$;

-- 7. A second call for A, after A is gone, raises nothing and returns zeros.
reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
do $$
declare r jsonb := public.delete_account_data(pg_temp.id('a'));
begin
  assert r = jsonb_build_object('heir', null, 'households_deleted', 0, 'households_handed_on', 0, 'not_moved', '[]'::jsonb, 'display_user_ids', '[]'::jsonb),
    '7: a second call for A was not a no-op: ' || r::text;
end $$;
reset role;

select 'ok: 107_delete_account' as result;
rollback;
