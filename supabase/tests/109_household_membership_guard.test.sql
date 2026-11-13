-- 109_household_membership_guard.test.sql
-- Proof for 20261113151000_household_membership_guard.sql. Setup runs as
-- postgres; client writes run as `authenticated` with a JWT carrying "sub".
-- Needs the edition migration applied (the last check reads my_edition()).
-- Ends in ROLLBACK.
begin;

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

do $$
declare o uuid := gen_random_uuid(); m uuid := gen_random_uuid(); x uuid := gen_random_uuid(); f uuid := gen_random_uuid(); st uuid := gen_random_uuid();
  h1 uuid; h2 uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (o, 'symphony-109-o@gmail.com', 'authenticated', 'authenticated'),
    (m, 'symphony-109-m@gmail.com', 'authenticated', 'authenticated'),
    (x, 'symphony-109-x@gmail.com', 'authenticated', 'authenticated'),
    (f, 'symphony-109-f@gmail.com', 'authenticated', 'authenticated'),
    (st, 'symphony-109-s@gmail.com', 'authenticated', 'authenticated');
  insert into public.households (owner_id) values (o) returning id into h1;
  insert into public.households (owner_id, edition) values (f, 'full') returning id into h2;
  update public.households set edition = 'light' where id = h1;
  insert into public.household_members (household_id, user_id, role, status) values
    (h1, o, 'owner', 'active'), (h1, m, 'member', 'active'), (h2, f, 'owner', 'active');
  insert into ids values ('o', o), ('m', m), ('x', x), ('f', f), ('s', st), ('h1', h1), ('h2', h2);
end $$;

-- A SECURITY DEFINER function owned by the superuser, like accept_household_invitation.
create function public.test_move_member(p_user uuid, p_to uuid) returns void
language sql security definer set search_path = '' as $$
  update public.household_members set household_id = p_to, status = 'active' where user_id = p_user $$;

create function public.test_add_member(p_household uuid, p_user uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.household_members (household_id, user_id, role, status) values (p_household, p_user, 'member', 'active') $$;

-- As member M.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'm'), 'role', 'authenticated')::text, true);
do $$
declare m uuid := (select v from ids where k = 'm'); h1 uuid := (select v from ids where k = 'h1'); h2 uuid := (select v from ids where k = 'h2');
  x uuid := (select v from ids where k = 'x');
begin
  begin
    update public.household_members set household_id = h2 where user_id = m;
    assert false, '1: M moved into another household';
  exception when insufficient_privilege then
    assert sqlerrm like '%cannot be moved%', '1: refused by something other than the guard: ' || sqlerrm;
  end;
  assert (select household_id from public.household_members where user_id = m) = h1, '1: M is no longer in H1';
  assert public.my_edition() = 'light', '8: M became full after the failed move';

  begin
    update public.household_members set user_id = x where user_id = m;
    assert false, '2: M reassigned the membership to another person';
  exception when insufficient_privilege then
    assert sqlerrm like '%cannot be moved%', '2: refused by something other than the guard: ' || sqlerrm;
  end;
  assert exists (select 1 from public.household_members where user_id = m and household_id = h1), '2: M''s membership changed person';

  begin
    update public.household_members set role = 'owner' where user_id = m;
    assert false, '3: M promoted self to owner';
  exception when insufficient_privilege then
    assert sqlerrm like '%owner or admin can change a role%', '3: wrong refusal: ' || sqlerrm;
  end;
  begin
    update public.household_members set role = 'admin' where user_id = m;
    assert false, '3: M promoted self to admin';
  exception when insufficient_privilege then
    assert sqlerrm like '%owner or admin can change a role%', '3: wrong refusal: ' || sqlerrm;
  end;
end $$;

-- As owner O of H1.
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'o'), 'role', 'authenticated')::text, true);
do $$
declare m uuid := (select v from ids where k = 'm'); h1 uuid := (select v from ids where k = 'h1'); h2 uuid := (select v from ids where k = 'h2');
begin
  update public.household_members set role = 'admin' where user_id = m;
  assert (select role from public.household_members where user_id = m) = 'admin', '5: owner could not change a role';
  begin
    update public.household_members set household_id = h2 where user_id = m;
    assert false, '5: owner moved a member to another household';
  exception when insufficient_privilege then
    assert sqlerrm like '%cannot be moved%', '5: refused by something other than the guard: ' || sqlerrm;
  end;
  -- RLS lets an owner update any row in the household; only the guard stops reassigning it to a person.
  begin
    update public.household_members set user_id = (select v from ids where k = 's') where user_id = m;
    assert false, '5b: owner reassigned a member row to another person';
  exception when insufficient_privilege then
    assert sqlerrm like '%cannot be moved%', '5b: refused by something other than the guard: ' || sqlerrm;
  end;
  update public.household_members set role = 'member' where user_id = m;
end $$;

-- A pending member can still decline.
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare x uuid := (select v from ids where k = 'x'); h1 uuid := (select v from ids where k = 'h1');
begin
  insert into public.household_members (household_id, user_id, role, status) values (h1, x, 'member', 'pending');
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'x'), 'role', 'authenticated')::text, true);
do $$
declare x uuid := (select v from ids where k = 'x');
begin
  update public.household_members set status = 'declined' where user_id = x;
  assert (select status from public.household_members where user_id = x) = 'declined', '4: a pending member could not decline';
end $$;

-- SECURITY DEFINER function while M's claims are set: still works.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'm'), 'role', 'authenticated')::text, true);
do $$
declare m uuid := (select v from ids where k = 'm'); h2 uuid := (select v from ids where k = 'h2');
begin
  perform public.test_move_member(m, h2);
  assert (select household_id from public.household_members where user_id = m) = h2, '6: the trusted function could not move a membership';
end $$;

reset role;
-- No role switch (postgres): any update succeeds.
select set_config('request.jwt.claims', '', true);
do $$
declare m uuid := (select v from ids where k = 'm'); h1 uuid := (select v from ids where k = 'h1');
begin
  update public.household_members set household_id = h1, role = 'admin' where user_id = m;
  assert (select role from public.household_members where user_id = m) = 'admin', '7: postgres update was blocked';
end $$;

-- Joining needs the person's own yes (direct client writes only).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'o'), 'role', 'authenticated')::text, true);
do $$
declare o uuid := (select v from ids where k = 'o'); st uuid := (select v from ids where k = 's'); h1 uuid := (select v from ids where k = 'h1');
begin
  begin
    insert into public.household_members (household_id, user_id, role, status, invited_by) values (h1, st, 'member', 'active', o);
    assert false, '9: owner inserted an active row for a stranger';
  exception when insufficient_privilege then
    assert sqlerrm like '%starts as pending%', '9: refused by something other than the guard: ' || sqlerrm;
  end;
  insert into public.household_members (household_id, user_id, role, status, invited_by) values (h1, st, 'member', 'pending', o);
  assert (select status from public.household_members where user_id = st and household_id = h1) = 'pending', '9: pending invite not created';
  begin
    update public.household_members set status = 'active' where user_id = st and household_id = h1;
    assert false, '10: owner activated someone else''s membership';
  exception when insufficient_privilege then
    assert sqlerrm like '%person invited can accept%', '10: refused by something other than the guard: ' || sqlerrm;
  end;
  -- A trusted definer function may still insert an active row while a client is signed in.
  perform public.test_add_member(h1, (select v from ids where k = 'f'));
  assert exists (select 1 from public.household_members where user_id = (select v from ids where k = 'f') and household_id = h1 and status = 'active'), '12: the trusted function could not add an active member';
end $$;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 's'), 'role', 'authenticated')::text, true);
do $$
declare st uuid := (select v from ids where k = 's');
begin
  update public.household_members set status = 'active' where user_id = st;
  assert (select status from public.household_members where user_id = st) = 'active', '11: the invited person could not accept';
end $$;
reset role;

rollback;
