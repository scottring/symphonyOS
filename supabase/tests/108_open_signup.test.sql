-- 108_open_signup.test.sql
-- Proof for 20261113170000_open_signup.sql. Runs against a database with the
-- check_signup_allowed trigger on auth.users, the new-account household
-- trigger and the household edition migration. Ends in ROLLBACK.
begin;

-- 1. The function: any non-blank address is allowed, blank and null are not.
do $$
begin
  assert public.signup_allowed('stranger@example.com'), '1: a stranger is refused';
  assert public.signup_allowed('  Stranger@Example.com '), '1: a padded address is refused';
  assert not public.signup_allowed(''), '1: empty is allowed';
  assert not public.signup_allowed('   '), '1: spaces are allowed';
  assert not public.signup_allowed(null), '1: null is allowed';
end $$;

-- 2. The sign-up forms call it as anon and authenticated.
set local role anon;
do $$ begin assert public.signup_allowed('stranger@example.com'), '2: anon cannot call or is refused'; end $$;
reset role;
set local role authenticated;
do $$ begin assert public.signup_allowed('stranger@example.com'), '2: authenticated cannot call or is refused'; end $$;
reset role;

-- 3. A stranger's real sign-up row is admitted and ends in one light household.
do $$
declare u uuid := gen_random_uuid(); n integer; ed text;
begin
  insert into auth.users (id, email, aud, role, is_anonymous)
  values (u, 'stranger-108@example.com', 'authenticated', 'authenticated', false);
  select count(*) into n from public.household_members where user_id = u and status = 'active';
  assert n = 1, format('3: stranger has %s active memberships', n);
  select h.edition into ed from public.household_members m join public.households h on h.id = m.household_id
  where m.user_id = u and m.status = 'active';
  assert ed = 'light', format('3: stranger household edition is %s', ed);
end $$;

-- 4. A blank or missing address is still refused at sign-up.
do $$
begin
  begin
    insert into auth.users (id, email, aud, role, is_anonymous) values (gen_random_uuid(), '   ', 'authenticated', 'authenticated', false);
    assert false, '4: blank email was admitted';
  exception when raise_exception then
    assert sqlerrm like 'Signups are currently restricted%', '4: wrong error: ' || sqlerrm;
  end;
  begin
    insert into auth.users (id, email, aud, role, is_anonymous) values (gen_random_uuid(), null, 'authenticated', 'authenticated', false);
    assert false, '4: null email was admitted';
  exception when raise_exception then
    assert sqlerrm like 'Signups are currently restricted%', '4: wrong error: ' || sqlerrm;
  end;
end $$;

-- 5. An anonymous display user still skips the gate and gets no household.
do $$
declare d uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, is_anonymous) values (d, null, 'authenticated', 'authenticated', true);
  assert not exists (select 1 from public.household_members where user_id = d), '5: display user got a household';
end $$;

rollback;
