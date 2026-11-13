-- A signed-in user cannot move or promote their own membership (2026-11-13).
-- The household_members UPDATE policy "Users can update memberships" lets a
-- user update their own row with no WITH CHECK, and every column is
-- updatable, so a client could set household_id to another household (joining
-- it, and becoming 'full') or raise its own role. No client code writes the
-- table directly; every legitimate write goes through SECURITY DEFINER
-- functions, which run as their owner and so are not affected.
--
-- Only a direct client write (current_user authenticated or anon) is checked:
--   - household_id or user_id may not change;
--   - role may change only when the caller is an owner or admin of the household.
-- Everything else about the row (for example declining an invitation) is untouched.

create function public.guard_household_membership()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.household_id is distinct from old.household_id or new.user_id is distinct from old.user_id then
      raise exception 'A membership cannot be moved to another household or person.' using errcode = '42501';
    end if;
    if new.role is distinct from old.role and not public.is_household_owner_or_admin(old.household_id) then
      raise exception 'Only a household''s owner or admin can change a role.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger household_members_guard
  before update on public.household_members
  for each row execute function public.guard_household_membership();
