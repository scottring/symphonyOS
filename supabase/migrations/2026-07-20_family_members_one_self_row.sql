-- Applied to prod 2026-07-20 via Management API (audit S2 finding).
--
-- The useFamilyMembers auto-seed raced across simultaneously-mounted hook
-- instances, inserting duplicate "self" rows (9 for the demo account, and
-- 2-3 for real users tim.rappold / meganhryan; previously 5 on 2026-06-27).
-- Before creating the index, duplicates were deduped: for each user's
-- (is_full_user, auth_user_id IS NULL) rows the oldest was kept, all 16 FK
-- columns referencing family_members were repointed to it, and the rest
-- were deleted.
--
-- The index makes the duplicate-seed race impossible at the DB level:
-- at most one self row (is_full_user, no auth_user_id) per user_id.
-- Joined household members (auth_user_id set) and non-full-user family
-- members are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS family_members_one_self_row
  ON family_members (user_id)
  WHERE is_full_user AND auth_user_id IS NULL;
