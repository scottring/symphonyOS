-- "Free" events: the kids just shift over; nothing for a parent to do.
-- For a recurring series the flag lives on a note keyed by recurring_event_id.
alter table public.event_notes
  add column if not exists is_free boolean not null default false;
