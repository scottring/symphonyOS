-- Add recipe_url column to event_notes for storing detected recipe URLs
alter table event_notes
  add column if not exists recipe_url text;

-- Index for finding events with recipes
create index if not exists idx_event_notes_recipe_url on event_notes(recipe_url) where recipe_url is not null;
