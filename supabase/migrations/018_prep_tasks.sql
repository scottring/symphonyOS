-- Add linked_event_id column to tasks for prep tasks
-- Prep tasks are regular tasks linked to a meal event (e.g., "Defrost chicken" for "Dinner: Chicken Stir Fry")
alter table tasks
  add column if not exists linked_event_id text;

-- Index for finding prep tasks for an event
create index if not exists idx_tasks_linked_event_id on tasks(linked_event_id) where linked_event_id is not null;
