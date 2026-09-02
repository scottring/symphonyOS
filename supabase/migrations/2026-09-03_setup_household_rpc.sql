-- First-run household setup.
--
-- Nothing ever created a household for a fresh signup: the
-- ensure_user_has_household() trigger function from 027 was never attached
-- (it would have to sit on auth.users), and RLS on household_members requires
-- an existing membership to insert one — so the client cannot create the
-- owner row itself. Until now the only path into a household was accepting
-- an invitation, and Settings → Invite partner failed with "No household
-- found" for anyone who signed up on their own.
--
-- setup_household(p_name) is idempotent:
--   * no active membership  → create a household (named p_name, or the
--     default) and the owner membership; return its id
--   * already a member      → rename it if p_name is given and the caller is
--     owner/admin; return the existing id
create or replace function setup_household(p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  nm text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select household_id into hid
  from household_members
  where user_id = uid and status = 'active'
  limit 1;

  if hid is null then
    insert into households (owner_id, name)
    values (uid, coalesce(nm, 'My Household'))
    returning id into hid;

    insert into household_members (household_id, user_id, role, status, joined_at)
    values (hid, uid, 'owner', 'active', now());
  elsif nm is not null then
    update households
    set name = nm, updated_at = now()
    where id = hid
      and exists (
        select 1 from household_members
        where household_id = hid
          and user_id = uid
          and status = 'active'
          and role in ('owner', 'admin')
      );
  end if;

  return hid;
end;
$$;

revoke all on function setup_household(text) from public;
grant execute on function setup_household(text) to authenticated;
