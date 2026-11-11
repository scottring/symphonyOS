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
--    one.
--
-- Joining someone else's household is unchanged: accept_household_invitation
-- drops the person's own membership and deletes their household when they were
-- its only member (every table that points at households cascades; the AI
-- ledgers carry household_id without a foreign key and keep their history).

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

do $$
declare u record; n integer := 0;
begin
  for u in
    select au.id from auth.users au
    where not coalesce(au.is_anonymous, false)
      and not exists (select 1 from public.household_members m where m.user_id = au.id and m.status = 'active')
  loop
    perform public.ensure_own_household(u.id);
    n := n + 1;
  end loop;
  raise notice 'household_for_every_account: % households made', n;
end $$;
