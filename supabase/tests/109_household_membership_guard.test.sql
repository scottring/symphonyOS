-- 109_household_membership_guard.test.sql
-- Proof for 20261113151000_household_membership_guard.sql. Setup runs as
-- postgres; client writes run as `authenticated` with a JWT carrying "sub".
-- Needs the edition migration applied (the last check reads my_edition()).
-- Ends in ROLLBACK.
begin;

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

do $$
declare o uuid := gen_random_uuid(); m uuid := gen_random_uuid(); x uuid := gen_random_uuid(); f uuid := gen_random_uuid();
  h1 uuid; h2 uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (o, 'symphony-109-o@gmail.com', 'authenticated', 'authenticated'),
    (m, 'symphony-109-m@gmail.com', 'authenticated', 'authenticated'),
    (x, 'symphony-109-x@gmail.com', 'authenticated', 'authenticated'),
    (f, 'symphony-109-f@gmail.com', 'authenticated', 'authenticated');
  insert into public.households (owner_id) values (o) returning id into h1;
  insert into public.households (owner_id, edition) values (f, 'full') returning id into h2;
  update public.households set edition = 'light' where id = h1;
  insert into public.household_members (household_id, user_id, role, status) values
    (h1, o, 'owner', 'active'), (h1, m, 'member', 'active'), (h2, f, 'owner', 'active');
  insert into ids values ('o', o), ('m', m), ('x', x), ('f', f), ('h1', h1), ('h2', h2);
end $$;

-- A SECURITY DEFINER function owned by the superuser, like accept_household_invitation.
create function public.test_move_member(p_user uuid, p_to uuid) returns void
language sql security definer set search_path = '' as $$
  update public.household_members set household_id = p_to, status = 'active' where user_id = p_user $$;

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
  exception when insufficient_privilege then null;
  end;
  assert (select household_id from public.household_members where user_id = m) = h1, '1: M is no longer in H1';
  assert public.my_edition() = 'light', '8: M became full after the failed move';

  begin
    update public.household_members set user_id = x where user_id = m;
    assert false, '2: M reassigned the membership to another person';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.household_members set role = 'owner' where user_id = m;
    assert false, '3: M promoted self to owner';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.household_members set role = 'admin' where user_id = m;
    assert false, '3: M promoted self to admin';
  exception when insufficient_privilege then null;
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
  exception when insufficient_privilege then null;
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
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'm'), 'role', 'authenticated')::text, true);
do $$
declare m uuid := (select v from ids where k = 'm'); h2 uuid := (select v from ids where k = 'h2');
begin
  perform public.test_move_member(m, h2);
  assert (select household_id from public.household_members where user_id = m) = h2, '6: the trusted function could not move a membership';
end $$;

-- No role switch (postgres): any update succeeds.
select set_config('request.jwt.claims', '', true);
do $$
declare m uuid := (select v from ids where k = 'm'); h1 uuid := (select v from ids where k = 'h1');
begin
  update public.household_members set household_id = h1, role = 'admin' where user_id = m;
  assert (select role from public.household_members where user_id = m) = 'admin', '7: postgres update was blocked';
end $$;

rollback;
