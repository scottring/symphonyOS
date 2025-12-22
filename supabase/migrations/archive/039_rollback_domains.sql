-- ROLLBACK: Undo domains system migrations
-- This reverts migrations 037 and 038

-- Drop triggers
DROP TRIGGER IF EXISTS tasks_sync_context_and_domain ON tasks;
DROP FUNCTION IF EXISTS sync_task_context_and_domain();

-- Restore original task RLS policies
DROP POLICY IF EXISTS "Users can view tasks in accessible domains" ON tasks;
DROP POLICY IF EXISTS "Users can create tasks in accessible domains" ON tasks;
DROP POLICY IF EXISTS "Users can update tasks in accessible domains" ON tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;

CREATE POLICY "Users can view own tasks"
  ON tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tasks"
  ON tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks"
  ON tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tasks"
  ON tasks FOR DELETE
  USING (auth.uid() = user_id);

-- Restore original routine RLS policies
DROP POLICY IF EXISTS "Users can view routines in accessible domains" ON routines;
DROP POLICY IF EXISTS "Users can create routines in accessible domains" ON routines;
DROP POLICY IF EXISTS "Users can update routines in accessible domains" ON routines;
DROP POLICY IF EXISTS "Users can delete own routines" ON routines;

CREATE POLICY "Users can view own routines"
  ON routines FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own routines"
  ON routines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routines"
  ON routines FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own routines"
  ON routines FOR DELETE
  USING (auth.uid() = user_id);

-- Remove domain_id columns
ALTER TABLE tasks DROP COLUMN IF EXISTS domain_id;
ALTER TABLE routines DROP COLUMN IF EXISTS domain_id;

-- Drop domain tables
DROP TABLE IF EXISTS domain_members CASCADE;
DROP TABLE IF EXISTS domains CASCADE;
