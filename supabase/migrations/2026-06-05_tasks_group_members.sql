-- Today grouping: let a wrapper task hold event/routine members.
-- Tasks attach to a group via parent_task_id; events/routines (which aren't task
-- rows) are referenced here as [{ "type": "event"|"routine", "id": "<id>" }].
-- NOT NULL DEFAULT '[]' so the app's write path can clear it with [] (never null).
-- Applied to prod 2026-06-05 via the Supabase Management API (migration history
-- is out of sync in this project — this file documents the schema for repro).
alter table tasks
  add column if not exists group_members jsonb not null default '[]'::jsonb;
