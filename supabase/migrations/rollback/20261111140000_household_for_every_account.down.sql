-- Rollback for 20261111140000_household_for_every_account.sql.
-- Removes the sign-up trigger and both functions, and restores
-- accept_household_invitation from 2026-09-06_accept_invitation_member.sql. The households the
-- backfill and the trigger made are left in place on purpose: they are real
-- households now (people may have planned, captured or invited in them), and
-- an account with one is what first-run setup would have made anyway.
drop trigger if exists household_for_new_account on auth.users;
drop function if exists public.household_for_new_account();
drop function if exists public.ensure_own_household(uuid);

create or replace function public.accept_household_invitation(invitation_token uuid, member_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv record; current_user_id uuid := auth.uid(); current_membership record;
begin
  if current_user_id is null then raise exception 'Not authenticated'; end if;
  select * into inv from household_invitations where token = invitation_token and accepted_at is null and expires_at > now();
  if inv is null then raise exception 'Invalid or expired invitation'; end if;
  select * into current_membership from household_members where user_id = current_user_id and status = 'active';
  if current_membership is not null then
    delete from household_members where id = current_membership.id;
    if current_membership.role = 'owner' and not exists (select 1 from household_members where household_id = current_membership.household_id) then
      delete from households where id = current_membership.household_id;
    end if;
  end if;
  insert into household_members (household_id, user_id, role, status, invited_by, joined_at)
  values (inv.household_id, current_user_id, 'member', 'active', inv.invited_by, now());
  update household_invitations set accepted_at = now() where id = inv.id;
  if member_id is not null then
    -- `not is_full_user` is load-bearing, not tidiness: the INVITER's own seed
    -- row is (is_full_user = true, auth_user_id is null) — see the
    -- `inviter_name` lookup below, which finds it by exactly that shape.
    -- Without this clause a member_id naming the inviter's row passed the
    -- filter and handed the invitee the inviter's identity. It also matches
    -- the candidate list `invitation_preview` offers, so no legitimate choice
    -- is excluded.
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
