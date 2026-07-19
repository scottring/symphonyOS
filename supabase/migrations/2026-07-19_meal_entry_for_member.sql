-- 2026-07-19_meal_entry_for_member.sql
-- Let a meal slot diverge per person. NULL = the shared/whole-family meal
-- (unchanged default); set = a per-member variant (e.g. Scott's lunch vs
-- Iris's on the same day). Household RLS on meal_plan_entries is unchanged —
-- access is still governed by the parent plan.
alter table public.meal_plan_entries
  add column if not exists for_member_id uuid references public.family_members(id) on delete cascade;

create index if not exists meal_plan_entries_for_member_idx
  on public.meal_plan_entries (for_member_id);
