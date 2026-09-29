-- 103_household_week_start.test.sql
-- Proof for supabase/migrations/2026-09-29_household_week_start.sql. Two
-- household members (owner A, member B) act as `authenticated` with RLS on;
-- setup runs as postgres. Ends in ROLLBACK — the database keeps nothing.
begin;

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); hh uuid := gen_random_uuid();
  t_week uuid := gen_random_uuid(); t_dated uuid := gen_random_uuid(); t_sat uuid := gen_random_uuid();
  t_carried uuid := gen_random_uuid(); t_b uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role) values
    (a, '103-owner@example.invalid', 'authenticated', 'authenticated'),
    (b, '103-member@example.invalid', 'authenticated', 'authenticated');
  insert into public.households (id, name, owner_id) values (hh, '103 household', a);
  insert into public.household_members (household_id, user_id, status, role) values
    (hh, a, 'active', 'owner'), (hh, b, 'active', 'member');
  -- Week 40 (Sun Sep 27 – Sat Oct 3), as Sunday weeks stamp it today.
  insert into public.tasks (id, user_id, title, bucket, week_start) values
    (t_week, a, '103 on the week', 'week', date '2026-09-27'),
    (t_b,    b, '103 member week', 'week', date '2026-09-27');
  insert into public.tasks (id, user_id, title, bucket, scheduled_for, is_all_day) values
    (t_dated, a, '103 dated Wednesday', 'timed', timestamptz '2026-09-30 12:00-04', true),
    (t_sat,   a, '103 dated Saturday',  'timed', timestamptz '2026-10-03 12:00-04', true);
  insert into public.task_commitments (task_id, level, period_start, status) values (t_sat, 'week', date '2026-09-27', 'open');
  insert into public.tasks (id, user_id, title, bucket, week_start) values (t_carried, a, '103 carried', 'week', date '2026-09-27');
  update public.task_commitments set period_start = date '2026-09-20', status = 'carried', carried_to = date '2026-09-27'
   where task_id = t_carried and level = 'week';
  insert into public.task_commitments (task_id, level, period_start, status) values (t_carried, 'week', date '2026-09-27', 'open');
  insert into public.planning_sessions (author_id, horizon, period_token, notes) values (a, 'weekly', '2026-9-27', '{}');
  insert into ids values ('a', a), ('b', b), ('hh', hh), ('week', t_week), ('dated', t_dated), ('sat', t_sat), ('carried', t_carried), ('tb', t_b);

  assert (select week_start from public.tasks where id = t_dated) = date '2026-09-27', 'setup: Sunday weeks stamp Sunday';
end $$;

-- The member cannot change the household's week.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'b'), 'role', 'authenticated')::text, true);
do $$ declare caught bool := false; begin
  begin perform public.set_household_week_start(6); exception when insufficient_privilege then caught := true; end;
  assert caught, '1: a member changed the household week';
end $$;

-- The owner: 3 is not a week start; 6 (Saturday) moves every week record.
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'a'), 'role', 'authenticated')::text, true);
do $$ declare caught bool := false; moved int; begin
  begin perform public.set_household_week_start(3); exception when invalid_parameter_value then caught := true; end;
  assert caught, '2: Wednesday accepted as a week start';
  moved := public.set_household_week_start(6);
  assert moved > 0, '3: nothing moved';
  assert public.set_household_week_start(6) = 0, '4: a second switch to the same day moved rows';
end $$;

reset role;
do $$
declare
  wk uuid := (select v from ids where k = 'week'); dated uuid := (select v from ids where k = 'dated');
  sat uuid := (select v from ids where k = 'sat'); carried uuid := (select v from ids where k = 'carried');
  tb uuid := (select v from ids where k = 'tb'); a uuid := (select v from ids where k = 'a');
begin
  assert (select week_starts_on from public.households where id = (select v from ids where k = 'hh')) = 6, '5: the household day';
  -- Week 40 (Sun 27 – Sat 3) mostly overlaps Sat 26 – Fri 2.
  assert (select period_start from public.task_commitments where task_id = wk and level = 'week' and status = 'open') = date '2026-09-26', '6: the week record moved to Sat 26';
  assert (select week_start from public.tasks where id = wk) = date '2026-09-26', '7: its cached week';
  assert (select period_start from public.task_commitments where task_id = tb and level = 'week') = date '2026-09-26', '8: the member''s week moved too';
  assert (select week_start from public.tasks where id = dated) = date '2026-09-26', '9: a Wednesday is in Sat 26''s week';
  -- A Saturday that ended the old week starts the new one.
  assert (select period_start from public.task_commitments where task_id = sat and level = 'week' and status = 'open') = date '2026-10-03', '10: the dated Saturday''s week follows its day';
  assert (select week_start from public.tasks where id = sat) = date '2026-10-03', '11: and its cached week';
  -- History moves with it and still reads as a carry into the next week.
  assert (select period_start || '>' || carried_to from public.task_commitments where task_id = carried and status = 'carried')
       = '2026-09-19>2026-09-26', '12: the carried record and its target';
  assert (select period_start from public.task_commitments where task_id = carried and status = 'open') = date '2026-09-26', '13: the carried-into week';
  assert (select period_token from public.planning_sessions where author_id = a and horizon = 'weekly') = '2026-9-26', '14: the agreed week plan follows its week';
  assert (select count(*) from public.task_commitments where level = 'week' and task_id in (select v from ids) and extract(dow from period_start) <> 6) = 0, '15: every week record starts on a Saturday';
end $$;

-- New writes use the household's day.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'a'), 'role', 'authenticated')::text, true);
do $$ declare n uuid; d uuid; begin
  insert into public.tasks (user_id, title, bucket) values ((select v from ids where k = 'a'), '103 new week item', 'week') returning id into n;
  insert into public.tasks (user_id, title, bucket, scheduled_for, is_all_day) values ((select v from ids where k = 'a'), '103 new dated', 'timed', timestamptz '2026-10-07 12:00-04', true) returning id into d;
  assert extract(dow from (select week_start from public.tasks where id = n)) = 6, '16: a new week item is stamped Saturday-first';
  assert (select week_start from public.tasks where id = d) = date '2026-10-03', '17: a new dated item''s week is Sat Oct 3';
  -- And back to Sunday round-trips exactly.
  perform public.set_household_week_start(0);
end $$;
reset role;
do $$ begin
  assert (select period_start from public.task_commitments where task_id = (select v from ids where k = 'week') and status = 'open') = date '2026-09-27', '18: back to Sunday: Sun 27 again';
  assert (select period_start || '>' || carried_to from public.task_commitments where task_id = (select v from ids where k = 'carried') and status = 'carried') = '2026-09-20>2026-09-27', '19: history round-trips';
  assert (select period_token from public.planning_sessions where author_id = (select v from ids where k = 'a') and horizon = 'weekly') = '2026-9-27', '20: the token round-trips';
  -- A household that never chose keeps Sunday, and so does a user in none.
  assert public.household_week_start(gen_random_uuid()) = 0, '21: no household = Sunday';
  raise notice '103 household week start: all 21 assertions passed';
end $$;

rollback;
