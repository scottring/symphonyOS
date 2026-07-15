-- Task lineage — the thread that makes the planning cascade visible.
--
-- Copy-down (season→month, month→week) and goal promotion create NEW task rows
-- by design (the level above keeps its copy for its own review). These columns
-- record where a copy came from so the app can show ancestry ("← Ship auth
-- layer ← Firebase rebuild") and roll progress up to the Year view:
--
--   source_id — the task this one was copied down from (immediate parent in
--               the cascade; NOT parent_task_id, which is subtask nesting).
--   goal_id   — the annual goal this task ultimately serves. Stamped when a
--               goal is promoted into a season, then INHERITED by every copy
--               further down, so roll-up is a flat filter (no chain walking).
--   is_fun    — the fun audit (Best Laid Plans): marked during write-list
--               steps; coach lines tally the fun : obligation ratio.
--
-- All three are additive + nullable/defaulted: existing rows and code paths
-- are untouched. Pre-existing copies simply have no lineage (historically
-- true — it was never recorded).

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_fun BOOLEAN NOT NULL DEFAULT FALSE;

-- Roll-up reads filter by goal; breadcrumbs look up by source. Partial
-- indexes keep them tiny (most tasks have no lineage).
CREATE INDEX IF NOT EXISTS idx_tasks_goal_id ON tasks(goal_id) WHERE goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_source_id ON tasks(source_id) WHERE source_id IS NOT NULL;
