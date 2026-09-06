-- The invitee says which member row is theirs; the name==email guess stays as a fallback.
-- `create or replace` does NOT replace the 1-argument overload from
-- 051_accept_invitation_rpc.sql (different argument-type list) — drop it
-- first, or both versions coexist and the old one (no search_path, no
-- member_id) stays callable.
drop function if exists public.accept_household_invitation(uuid);
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
    update family_members set auth_user_id = current_user_id, is_full_user = true
    where id = member_id and user_id = inv.invited_by and auth_user_id is null;
  else
    update family_members set auth_user_id = current_user_id, is_full_user = true
    where user_id = inv.invited_by and auth_user_id is null and is_full_user = false
      and lower(name) = split_part((select email from auth.users where id = current_user_id), '@', 1);
  end if;
  return jsonb_build_object('household_id', inv.household_id, 'status', 'joined');
end $$;

-- The join page needs the household name, the inviter's name, and the unlinked adult rows — by token, before membership.
-- Candidates = unlinked, not-yet-a-full-user rows that are NOT a child.
-- A member added via Settings -> Add family member never sets role_label
-- (it stays NULL), and 'adult' is never written anywhere — an allowlist of
-- ('parent','adult') silently emptied the chooser for the documented
-- "add your spouse now, invite later" flow. Exclude children by label
-- instead of allow-listing adult labels that don't exist in the data.
create or replace function public.invitation_preview(invitation_token uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'household_name', h.name,
    'inviter_name', coalesce((select fm.name from family_members fm where fm.user_id = i.invited_by and fm.is_full_user and fm.auth_user_id is null limit 1), 'Your partner'),
    'candidates', coalesce((select jsonb_agg(jsonb_build_object('id', fm.id, 'name', fm.name)) from family_members fm
        where fm.user_id = i.invited_by and fm.auth_user_id is null and not fm.is_full_user and coalesce(fm.role_label,'') not in ('child','kid','family')), '[]'::jsonb)
  )
  from household_invitations i join households h on h.id = i.household_id
  where i.token = invitation_token and i.accepted_at is null and i.expires_at > now();
$$;
grant execute on function public.invitation_preview(uuid) to anon, authenticated;
notify pgrst, 'reload schema';
