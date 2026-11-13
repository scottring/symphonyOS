-- 106_household_edition.test.sql
-- Proof for 20261113150000_household_edition.sql. Setup runs as postgres (no
-- JWT context); the guard and my_edition checks act as `authenticated` with a
-- JWT that carries both "sub" and "role", because the guard reads the JWT role.
-- Ends in ROLLBACK.
begin;

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

-- 1. No JWT context: new households are light; the edition is writable; the check holds.
do $$
declare a uuid := gen_random_uuid(); f uuid := gen_random_uuid(); p uuid := gen_random_uuid();
  hh_a uuid; hh_f uuid; hh_x uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'symphony-106-a@gmail.com', 'authenticated', 'authenticated'),
    (f, 'symphony-106-f@gmail.com', 'authenticated', 'authenticated'),
    (p, 'symphony-106-p@gmail.com', 'authenticated', 'authenticated');

  insert into public.households (owner_id) values (a) returning id into hh_a;
  assert (select edition from public.households where id = hh_a) = 'light', '1: default edition is not light';
  insert into public.households (owner_id, edition) values (f, 'full') returning id into hh_f;
  assert (select edition from public.households where id = hh_f) = 'full', '1: explicit full not kept with no JWT';
  begin
    insert into public.households (owner_id, edition) values (p, 'pro');
    assert false, '1: edition pro was accepted';
  exception when check_violation then null;
  end;
  insert into public.household_members (household_id, user_id, role, status) values
    (hh_a, a, 'owner', 'active'), (hh_f, f, 'owner', 'active');

  -- The AI guard must get past "unavailable" to reach the edition check.
  update public.ai_usage_configuration set enabled = true, daily_calls = 1000, monthly_calls = 10000;
  insert into public.ai_household_allowances (household_id, enabled, daily_calls, monthly_calls)
    values (hh_a, true, 1000, 10000), (hh_f, true, 1000, 10000)
    on conflict (household_id) do update set enabled = true, daily_calls = 1000, monthly_calls = 10000;

  insert into ids values ('a', a), ('f', f), ('p', p), ('hh_a', hh_a), ('hh_f', hh_f);
end $$;

-- 2. Signed in as A: the guard.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'a'), 'role', 'authenticated')::text, true);
do $$
declare a uuid := (select v from ids where k = 'a'); hh_a uuid := (select v from ids where k = 'hh_a'); hh_x uuid;
begin
  insert into public.households (owner_id, edition) values (a, 'full') returning id into hh_x;
  assert (select edition from public.households where id = hh_x) = 'light', '2: signed-in insert as full read back full';
  delete from public.households where id = hh_x;

  update public.households set edition = 'full', name = 'X' where id = hh_a;
  assert (select edition from public.households where id = hh_a) = 'light', '2: signed-in update flipped the edition';
  assert (select name from public.households where id = hh_a) = 'X', '2: the same statement lost the name change';

  assert public.my_edition() = 'light', '2: A with only a light household is not light';
  assert not has_function_privilege('anon', 'public.my_edition()', 'execute'), '2: anon may execute my_edition';
end $$;

-- 2b. The guard holds inside a SECURITY DEFINER function a signed-in person
-- calls (setup_household's shape): it reads the JWT role, not current_user.
-- The two stand-in functions are owned by postgres and rolled back with the rest.
reset role;
select set_config('request.jwt.claims', '', true);
create function public.test_106_definer_insert(p_owner uuid) returns uuid
language plpgsql security definer set search_path = '' as $f$
declare v uuid;
begin
  insert into public.households (owner_id, edition) values (p_owner, 'full') returning id into v;
  return v;
end $f$;
create function public.test_106_definer_update(p_household uuid) returns void
language sql security definer set search_path = '' as $f$
  update public.households set edition = 'full' where id = p_household
$f$;
grant execute on function public.test_106_definer_insert(uuid), public.test_106_definer_update(uuid) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'a'), 'role', 'authenticated')::text, true);
do $$
declare a uuid := (select v from ids where k = 'a'); hh_a uuid := (select v from ids where k = 'hh_a'); hh_x uuid;
begin
  hh_x := public.test_106_definer_insert(a);
  assert (select edition from public.households where id = hh_x) = 'light', '2b: a definer insert as full, called signed in, read back full';
  delete from public.households where id = hh_x;
  perform public.test_106_definer_update(hh_a);
  assert (select edition from public.households where id = hh_a) = 'light', '2b: a definer update, called signed in, flipped the edition';
end $$;

-- 3. No JWT context again: this is how Plus, or Scott by hand, flips a household.
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare hh_a uuid := (select v from ids where k = 'hh_a');
begin
  update public.households set edition = 'full' where id = hh_a;
  assert (select edition from public.households where id = hh_a) = 'full', '3: no-JWT update did not flip the edition';
  update public.households set edition = 'light' where id = hh_a;
  assert (select edition from public.households where id = hh_a) = 'light', '3: could not flip back';
end $$;

-- 4. AI refusal. Row counts first, so we can prove nothing was written.
do $$
declare a uuid := (select v from ids where k = 'a'); f uuid := (select v from ids where k = 'f');
  r jsonb; res_before bigint; use_before bigint;
begin
  select count(*) into res_before from public.ai_budget_reservations;
  select count(*) into use_before from public.ai_provider_call_usage;
  r := public.reserve_ai_budget(a, 'symphony-agent', 'claude-sonnet-5-5', 100, 100);
  assert r->>'reason' = 'light_edition' and (r->>'allowed')::boolean = false, '4: light household was not refused: ' || r::text;
  assert (select count(*) from public.ai_budget_reservations) = res_before, '4: a reservation row was written for a light household';
  assert (select count(*) from public.ai_provider_call_usage) = use_before, '4: a usage row was written for a light household';

  r := public.reserve_ai_budget(f, 'symphony-agent', 'claude-sonnet-5-5', 100, 100);
  assert coalesce(r->>'reason', '') <> 'light_edition', '4: full household was refused as light: ' || r::text;
  assert (r->>'allowed')::boolean, '4: full household was not admitted: ' || r::text;
end $$;

-- 5. my_edition for members.
do $$
declare a uuid := (select v from ids where k = 'a'); p uuid := (select v from ids where k = 'p'); hh_f uuid := (select v from ids where k = 'hh_f');
begin
  insert into public.household_members (household_id, user_id, role, status) values (hh_f, p, 'member', 'pending');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'f'), 'role', 'authenticated')::text, true);
do $$ begin assert public.my_edition() = 'full', '5: active member of a full household is not full'; end $$;

select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'p'), 'role', 'authenticated')::text, true);
do $$ begin assert public.my_edition() = 'light', '5: a pending membership counted as full'; end $$;

reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare a uuid := (select v from ids where k = 'a'); hh_f uuid := (select v from ids where k = 'hh_f');
begin
  insert into public.household_members (household_id, user_id, role, status) values (hh_f, a, 'member', 'active');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'a'), 'role', 'authenticated')::text, true);
do $$ begin assert public.my_edition() = 'full', '5: A did not become full after joining a full household'; end $$;

reset role;
rollback;
