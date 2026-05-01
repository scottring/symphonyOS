-- 088_standing_habits_assignee.sql
-- Add explicit assignee for standing habits. Today the generator implicitly
-- maps habit.user_id → family_members via auth_user_id, which fails for
-- non-account members (kids) and prevents whole-family habits.
--
-- assigned_family_member_id NULL = applies to the whole family (entries get
-- inserted with family_member_id = NULL so everyone sees them).
-- assigned_family_member_id set  = applies to that specific person.

alter table standing_habits
  add column assigned_family_member_id uuid
    references family_members(id) on delete set null;

create index standing_habits_assigned_idx
  on standing_habits (assigned_family_member_id)
  where assigned_family_member_id is not null;

-- Backfill: for each existing habit, set assignee to the family_members row
-- whose auth_user_id matches the habit's user_id (preserves current behavior).
update standing_habits sh
set assigned_family_member_id = fm.id
from family_members fm
where fm.auth_user_id = sh.user_id
  and sh.assigned_family_member_id is null;
