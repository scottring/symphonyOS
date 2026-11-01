-- 104_guided_planning_privacy.test.sql
-- Proof for 20261101130000_guided_planning.sql. Two household members (A, B)
-- act as `authenticated` with RLS on; setup runs as postgres. Ends in ROLLBACK.
begin;

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); hh uuid := gen_random_uuid();
  ar_personal uuid := gen_random_uuid(); ar_family uuid := gen_random_uuid(); ar_legacy uuid := gen_random_uuid();
  t uuid := gen_random_uuid(); ps uuid := gen_random_uuid();
  g_a uuid := gen_random_uuid(); g_b uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role) values
    (a, '104-a@example.invalid', 'authenticated', 'authenticated'),
    (b, '104-b@example.invalid', 'authenticated', 'authenticated');
  insert into public.households (id, name, owner_id) values (hh, '104 household', a);
  insert into public.household_members (household_id, user_id, status, role) values
    (hh, a, 'active', 'owner'), (hh, b, 'active', 'member');
  insert into public.planning_sessions (id, author_id, horizon, period_token, notes) values (ps, a, 'weekly', '2026-11-01', '{}');
  insert into public.goal_areas (id, user_id, name, context) values (ar_personal, a, '104 personal', 'personal'), (ar_family, a, '104 family', 'family'), (ar_legacy, a, '104 legacy', null);
  insert into public.tasks (id, user_id, title) values (t, a, '104 task');
  -- A's year goal and B's (the partner's) both filed under A's Family area.
  insert into public.goals (id, user_id, area_id, name) values (g_a, a, ar_family, '104 goal a'), (g_b, b, ar_family, '104 goal b');
  insert into ids values ('a', a), ('b', b), ('ps', ps), ('personal', ar_personal), ('family', ar_family), ('legacy', ar_legacy), ('t', t), ('g_a', g_a), ('g_b', g_b);
end $$;

-- B cannot see or change A's session.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'b'), 'role', 'authenticated')::text, true);
do $$ declare n int; begin
  assert (select count(*) from public.planning_sessions) = 0, '1: B sees A''s session';
  update public.planning_sessions set notes = '{"x":1}' where author_id = (select v from ids where k = 'a');
  get diagnostics n = row_count;
  assert n = 0, '2: B updated A''s session';
end $$;

-- B sees A's family area only; personal and legacy (null) stay private.
do $$ declare n int; begin
  assert (select count(*) from public.goal_areas where id = (select v from ids where k = 'personal')) = 0, '3: B sees personal area';
  assert (select count(*) from public.goal_areas where id = (select v from ids where k = 'family')) = 1, '4: B cannot see family area';
  assert (select count(*) from public.goal_areas where id = (select v from ids where k = 'legacy')) = 0, '5: B sees legacy area';
  update public.goal_areas set name = 'hijack' where id = (select v from ids where k = 'family');
  get diagnostics n = row_count;
  assert n = 0, '6: B updated A''s family area';
  delete from public.goal_areas where id = (select v from ids where k = 'family');
  get diagnostics n = row_count;
  assert n = 0, '7: B deleted A''s family area';
end $$;

-- A keeps everything and can file a task under an area.
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'a'), 'role', 'authenticated')::text, true);
do $$ declare n int; begin
  assert (select count(*) from public.planning_sessions) = 1, '8: A lost own session';
  assert (select count(*) from public.goal_areas) = 3, '9: A lost own areas';
  update public.tasks set area_id = (select v from ids where k = 'family') where id = (select v from ids where k = 't');
  get diagnostics n = row_count;
  assert n = 1 and (select area_id from public.tasks where id = (select v from ids where k = 't')) = (select v from ids where k = 'family'), '10: task area_id not accepted';
  begin
    update public.goal_areas set context = 'bogus' where id = (select v from ids where k = 'legacy');
    assert false, '11: bad context accepted';
  exception when check_violation then null; end;
end $$;

reset role;
do $$ begin
  assert (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'scratchpad_notes' and column_name = 'expires_at') = 'YES', '12: expires_at missing or not nullable';
  delete from public.goal_areas where id = (select v from ids where k = 'family');
  assert (select area_id from public.tasks where id = (select v from ids where k = 't')) is null, '13: area delete did not null task area_id';
  -- Removing an area keeps every goal filed under it, a partner's included, with no area.
  assert (select count(*) from public.goals where id in (select v from ids where k in ('g_a', 'g_b'))) = 2, '14: area delete deleted its goals';
  assert (select count(*) from public.goals where id in (select v from ids where k in ('g_a', 'g_b')) and area_id is null) = 2, '15: area delete did not null goals area_id';
end $$;

rollback;
