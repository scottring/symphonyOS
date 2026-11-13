-- Rollback for 20261113151000_household_membership_guard.sql.
drop trigger if exists household_members_guard on public.household_members;
drop function if exists public.guard_household_membership();
