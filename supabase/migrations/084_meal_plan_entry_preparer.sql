-- 084_meal_plan_entry_preparer.sql
-- Add a "who is cooking this" axis. Distinct from family_member_id, which
-- answers "for whom" (per-person variants). Nullable: NULL = unassigned.

alter table meal_plan_entries
  add column prepared_by_family_member_id uuid
    references family_members(id) on delete set null;

create index meal_plan_entries_prepared_by_idx
  on meal_plan_entries (prepared_by_family_member_id)
  where prepared_by_family_member_id is not null;
