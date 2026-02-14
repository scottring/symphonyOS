-- RPC function to accept a household invitation
-- Uses SECURITY DEFINER to bypass RLS (the invitation token is the auth secret)

-- 1. Allow anyone to view invitation details by token (for the join page)
create policy "Anyone can view invitation by token"
  on household_invitations for select
  using (true);

-- 2. RPC function that handles the full accept flow
create or replace function accept_household_invitation(invitation_token uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  inv record;
  current_user_id uuid := auth.uid();
  current_membership record;
  result jsonb;
begin
  -- Verify user is authenticated
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Find valid invitation
  select * into inv
  from household_invitations
  where token = invitation_token
  and accepted_at is null
  and expires_at > now();

  if inv is null then
    raise exception 'Invalid or expired invitation';
  end if;

  -- Remove from current household (handles auto-created solo households)
  select * into current_membership
  from household_members
  where user_id = current_user_id
  and status = 'active';

  if current_membership is not null then
    -- Delete membership
    delete from household_members
    where id = current_membership.id;

    -- Clean up empty household if user was owner
    if current_membership.role = 'owner' then
      if not exists (
        select 1 from household_members
        where household_id = current_membership.household_id
        limit 1
      ) then
        delete from households
        where id = current_membership.household_id;
      end if;
    end if;
  end if;

  -- Join new household
  insert into household_members (household_id, user_id, role, status, invited_by, joined_at)
  values (inv.household_id, current_user_id, 'member', 'active', inv.invited_by, now());

  -- Mark invitation as accepted
  update household_invitations
  set accepted_at = now()
  where id = inv.id;

  -- Try to auto-link family_members record
  update family_members
  set auth_user_id = current_user_id, is_full_user = true
  where user_id = inv.invited_by
  and auth_user_id is null
  and is_full_user = false
  and lower(name) = split_part(
    (select email from auth.users where id = current_user_id),
    '@', 1
  );

  result := jsonb_build_object(
    'household_id', inv.household_id,
    'status', 'joined'
  );

  return result;
end;
$$;
