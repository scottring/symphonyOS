-- Rollback for 20261111140000_household_for_every_account.sql.
-- Removes the sign-up trigger and both functions. The households the
-- backfill and the trigger made are left in place on purpose: they are real
-- households now (people may have planned, captured or invited in them), and
-- an account with one is what first-run setup would have made anyway.
drop trigger if exists household_for_new_account on auth.users;
drop function if exists public.household_for_new_account();
drop function if exists public.ensure_own_household(uuid);
