-- Removing a member from a household failed with "infinite recursion detected
-- in policy" (42P17) on the hosted project (privacy pass, 2026-10-15): the
-- update/delete policies on household_members looked up households, whose
-- own policy looks back at household_members. The owner/admin check now goes
-- through a security-definer helper, so neither policy re-enters the other.
create or replace function public.is_household_owner_or_admin(p_household uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.households h where h.id = p_household and h.owner_id = auth.uid())
      or exists (select 1 from public.household_members hm
                 where hm.household_id = p_household and hm.user_id = auth.uid()
                   and hm.status = 'active' and hm.role in ('owner', 'admin'))
$$;
revoke all on function public.is_household_owner_or_admin(uuid) from public;
grant execute on function public.is_household_owner_or_admin(uuid) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_policies where tablename = 'household_members' and policyname = 'Users can delete memberships') then
    alter policy "Users can delete memberships" on public.household_members
      using ((select auth.uid()) = user_id or public.is_household_owner_or_admin(household_id));
  end if;
  if exists (select 1 from pg_policies where tablename = 'household_members' and policyname = 'Users can update memberships') then
    alter policy "Users can update memberships" on public.household_members
      using ((select auth.uid()) = user_id or public.is_household_owner_or_admin(household_id));
  end if;
end $$;
