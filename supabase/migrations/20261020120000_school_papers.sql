-- School papers (spec 2026-10-20-school-papers-on-the-wall-design.md).
-- A paper is a task: category 'paper', one row per kid; held_by is the
-- parent who has it (null = not found yet); dismissed_at is "Not ours".
alter table tasks drop constraint if exists tasks_category_check;
alter table tasks add constraint tasks_category_check
  check (category in ('task','chore','errand','event','activity','homework','paper'));
alter table tasks add column if not exists held_by uuid references family_members(id) on delete set null;
alter table tasks add column if not exists dismissed_at timestamptz;
