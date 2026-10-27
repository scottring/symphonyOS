-- Kiosk switch (2026-10-27): a routine's own choice to stay off the kitchen
-- kiosk and the kids' tablets. Off (show_on_timeline) clears Today and
-- planning but leaves the kiosk alone; this is the kiosk's own switch.
-- Default true: every existing routine stays where it is.
alter table public.routines
  add column if not exists show_on_kiosk boolean not null default true;
