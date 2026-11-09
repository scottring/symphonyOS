-- Routines leave Today's grid (Scott, 2026-11-09). show_on_day_grid pins one to
-- the grid; off, it is on the day's checklist. background takes one off Today,
-- the kitchen kiosk and the kids' tablets while its time still counts against
-- the hours open. Both default off.
alter table public.routines
  add column if not exists show_on_day_grid boolean not null default false,
  add column if not exists background boolean not null default false;

comment on column public.routines.show_on_day_grid is
  'Pinned to Today''s grid. Default false: on the day''s checklist unless pinned or placed on that day.';
comment on column public.routines.background is
  'No row on Today, the kitchen kiosk or the kids'' tablets. Its time still counts against the hours open.';
