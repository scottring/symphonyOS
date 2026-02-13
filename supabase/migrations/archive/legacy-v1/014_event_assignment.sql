-- Add assigned_to to event_notes for local event assignment
alter table event_notes
  add column if not exists assigned_to uuid references family_members(id);

create index if not exists idx_event_notes_assigned_to on event_notes(assigned_to);
