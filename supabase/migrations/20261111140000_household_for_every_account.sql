-- Every account belongs to a household (2026-11-11).
--
-- The AI allowance is the household's, so reserve_ai_budget refuses a person
-- with no household ('no_household'). A household was only ever made by the
-- app (first-run setup, its "Skip for now", Invite partner), so an account
-- that slipped past first-run had no AI at all: on 2026-11-11 that was six
-- real accounts, among them the test account smkaufman+nov6.
--
-- 1. ensure_own_household(user): the account's household, making one
--    (owner, 'My Household') when it has none. An account with no household
--    kept its week start only in the browser, so the new household takes the
--    start day of the weeks the account's tasks are filed under (the most
--    common one), else the default (Sunday). Without that, a Saturday-week
--    account's tasks fell off "This week" (smkaufman+nov6, 2026-11-11).
--    Internal: no role the app signs in as may call it; the app keeps
--    setup_household.
-- 2. A trigger makes it at sign-up. Anonymous sign-ins (paired kiosk
--    displays) never get one. The trigger can never fail a sign-up: on error
--    it warns and first-run setup still makes the household as before.
-- 3. Backfill: every non-anonymous account with no active household gets
--    one, except three inactive beta accounts Scott left out on 2026-11-11
--    (no AI allowance for them). If one of them signs in again it still has
--    no household until first-run setup or Invite partner makes one.
--
-- 4. accept_household_invitation really leaves the person's own household.
--    It tested `current_membership is not null`, which for a row is true only
--    when EVERY column is non-null; an owner row's invited_by is null, so the
--    old membership was never removed and the invitee ended up in two
--    households (ai_household_of then gives null, so no AI, and the household
--    lookups pick one at random). Nobody hit it while invitees joined before
--    first-run made their household; with every account owning one from
--    sign-up, every accepted invite would. Found by supabase/tests/105.
--    Now every other active membership is dropped, an owned household left
--    with no members is deleted (every table that points at households
--    cascades; the AI ledgers carry household_id without a foreign key and
--    keep their history), and a person already in the household is not added
--    twice. The rest is 2026-09-06_accept_invitation_member.sql unchanged.

create or replace function public.ensure_own_household(p_user uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare hid uuid; wso integer;
begin
  if p_user is null then return null; end if;
  select household_id into hid from public.household_members
  where user_id = p_user and status = 'active' order by joined_at nulls last limit 1;
  if hid is not null then return hid; end if;
  select d into wso from (
    select extract(dow from t.week_start)::integer as d, count(*) as n
    from public.tasks t where t.user_id = p_user and t.week_start is not null
    group by 1
  ) days where d in (0, 1, 6) order by n desc, d limit 1;
  insert into public.households (owner_id, week_starts_on)
  values (p_user, coalesce(wso, 0))
  returning id into hid;
  insert into public.household_members (household_id, user_id, role, status, joined_at)
  values (hid, p_user, 'owner', 'active', now());
  return hid;
end $$;

revoke all on function public.ensure_own_household(uuid) from public, anon, authenticated;

create or replace function public.household_for_new_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.is_anonymous, false) then return new; end if;
  begin
    perform public.ensure_own_household(new.id);
  exception when others then
    raise warning 'household_for_new_account: no household for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

revoke all on function public.household_for_new_account() from public, anon, authenticated;

drop trigger if exists household_for_new_account on auth.users;
create trigger household_for_new_account
  after insert on auth.users
  for each row execute function public.household_for_new_account();

create or replace function public.accept_household_invitation(invitation_token uuid, member_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv record; current_user_id uuid := auth.uid(); current_membership record;
begin
  if current_user_id is null then raise exception 'Not authenticated'; end if;
  select * into inv from household_invitations where token = invitation_token and accepted_at is null and expires_at > now();
  if not found then raise exception 'Invalid or expired invitation'; end if;
  for current_membership in
    select * from household_members
    where user_id = current_user_id and status = 'active' and household_id <> inv.household_id
  loop
    delete from household_members where id = current_membership.id;
    if current_membership.role = 'owner' and not exists (select 1 from household_members where household_id = current_membership.household_id) then
      delete from households where id = current_membership.household_id;
    end if;
  end loop;
  if not exists (select 1 from household_members where household_id = inv.household_id and user_id = current_user_id and status = 'active') then
    insert into household_members (household_id, user_id, role, status, invited_by, joined_at)
    values (inv.household_id, current_user_id, 'member', 'active', inv.invited_by, now());
  end if;
  update household_invitations set accepted_at = now() where id = inv.id;
  if member_id is not null then
    -- `not is_full_user` is load-bearing, not tidiness: the INVITER's own seed
    -- row is (is_full_user = true, auth_user_id is null) — see the
    -- `inviter_name` lookup in invitation_preview, which finds it by exactly
    -- that shape. Without this clause a member_id naming the inviter's row
    -- passed the filter and handed the invitee the inviter's identity.
    update family_members set auth_user_id = current_user_id, is_full_user = true
    where id = member_id and user_id = inv.invited_by and auth_user_id is null
      and not is_full_user;
  else
    update family_members set auth_user_id = current_user_id, is_full_user = true
    where user_id = inv.invited_by and auth_user_id is null and is_full_user = false
      and lower(name) = split_part((select email from auth.users where id = current_user_id), '@', 1);
  end if;
  return jsonb_build_object('household_id', inv.household_id, 'status', 'joined');
end $$;

do $$
declare u record; n integer := 0;
begin
  for u in
    select au.id from auth.users au
    where not coalesce(au.is_anonymous, false)
      and not exists (select 1 from public.household_members m where m.user_id = au.id and m.status = 'active')
      and lower(coalesce(au.email, '')) not in ('meganhryan@gmail.com', 'tim.rappold@gmail.com', 'stephanie.nothelle@gmail.com')
  loop
    perform public.ensure_own_household(u.id);
    n := n + 1;
  end loop;
  raise notice 'household_for_every_account: % households made', n;
end $$;
