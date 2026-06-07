-- RLS cleanup: drop redundant owner-only policies on tasks/routines that are
-- now fully subsumed by the scope-based policies ("Users can view/update/delete
-- tasks/routines" already include `auth.uid() = user_id`). Permissive policies are
-- OR'd, so these owner-only duplicates grant nothing extra — they're just cruft.
-- Dropping a permissive policy can only REDUCE access, and since the scope policy
-- already covers the owner case, access is unchanged.

DROP POLICY IF EXISTS "Users can view own tasks"   ON tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;

DROP POLICY IF EXISTS "Users can view own routines"   ON routines;
DROP POLICY IF EXISTS "Users can update own routines" ON routines;
DROP POLICY IF EXISTS "Users can delete own routines" ON routines;
