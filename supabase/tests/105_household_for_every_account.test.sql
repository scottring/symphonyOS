-- 105_household_for_every_account.test.sql
-- Proof for 20261111140000_household_for_every_account.sql (run it first in
-- the same transaction when it is not yet applied). Setup runs as postgres;
-- the AI and invite checks act as `authenticated`. Emails match the sign-up
-- allowlist's 'symphony%@gmail.com' pattern; nothing is sent. Ends in ROLLBACK.
begin;

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); anon uuid := gen_random_uuid(); r jsonb;
begin
  -- 1. A sign-up gets a household it owns, with an AI allowance, week from Sunday.
  insert into auth.users (id, email, aud, role) values (a, 'symphony-105-a@gmail.com', 'authenticated', 'authenticated');
  assert (select count(*) from public.household_members where user_id = a and status = 'active' and role = 'owner') = 1, '1: no owned household at sign-up';
  assert (select h.week_starts_on from public.households h join public.household_members m on m.household_id = h.id where m.user_id = a) = 0, '1: week start not the default';
  assert exists (select 1 from public.ai_household_allowances al join public.household_members m on m.household_id = al.household_id where m.user_id = a and al.enabled), '1: no AI allowance';
  r := public.reserve_ai_budget(a, (public.ai_guarded_routes())[1], 'claude-sonnet-4-6', 10, 10);
  assert coalesce(r->>'reason', '') <> 'no_household', '1: AI still says no_household: ' || r::text;

  -- 2. An anonymous sign-in (a paired display) gets none.
  insert into auth.users (id, aud, role, is_anonymous) values (anon, 'authenticated', 'authenticated', true);
  assert not exists (select 1 from public.household_members where user_id = anon), '2: display got a household';

  -- 3. Calling it again for an account that has one changes nothing.
  assert public.ensure_own_household(a) = (select household_id from public.household_members where user_id = a), '3: second household';
  assert (select count(*) from public.household_members where user_id = a) = 1, '3: second membership';

  insert into auth.users (id, email, aud, role) values (b, 'symphony-105-b@gmail.com', 'authenticated', 'authenticated');
  insert into ids values ('a', a), ('b', b),
    ('hh_a', (select household_id from public.household_members where user_id = a)),
    ('hh_b', (select household_id from public.household_members where user_id = b));
  insert into public.household_invitations (household_id, email, invited_by)
    values ((select v from ids where k = 'hh_a'), 'symphony-105-b@gmail.com', a);
end $$;

-- 4. The app cannot call the internal function.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'b'), 'role', 'authenticated')::text, true);
do $$ begin
  begin
    perform public.ensure_own_household((select v from ids where k = 'b'));
    assert false, '4: authenticated may call ensure_own_household';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 5. Accepting an invite moves B into A's household and removes B's own.
do $$ begin
  perform public.accept_household_invitation((select token from public.household_invitations where email = 'symphony-105-b@gmail.com'));
end $$;
reset role;
do $$ begin
  assert (select array_agg(household_id) from public.household_members where user_id = (select v from ids where k = 'b') and status = 'active')
    = array[(select v from ids where k = 'hh_a')], '5: B is not only in A''s household';
  assert not exists (select 1 from public.households where id = (select v from ids where k = 'hh_b')), '5: B''s empty household was kept';
  assert public.ai_household_of((select v from ids where k = 'b')) = (select v from ids where k = 'hh_a'), '5: B''s AI allowance is not A''s household';
end $$;

-- 6. The backfill keeps the week the account's tasks are filed under.
do $$
declare c uuid := gen_random_uuid();
begin
  -- An account from before the trigger: signed up, then its household removed.
  insert into auth.users (id, email, aud, role) values (c, 'symphony-105-c@gmail.com', 'authenticated', 'authenticated');
  delete from public.households where owner_id = c;
  assert not exists (select 1 from public.household_members where user_id = c), '6: setup left a membership';
  insert into public.tasks (user_id, title, week_start) values (c, '105 t1', '2026-11-07'), (c, '105 t2', '2026-10-31'), (c, '105 t3', '2026-11-08');
  perform public.ensure_own_household(c);
  assert (select h.week_starts_on from public.households h join public.household_members m on m.household_id = h.id where m.user_id = c) = 6, '6: Saturday week not kept';
end $$;

select 'ok: 105_household_for_every_account' as result;
rollback;
