-- "Show on the week" (Scott, 2026-11-08: "routines should not show on the
-- calendar grid at all, unless explicitly tagged to do so"). A routine is
-- Today's, on its days; with this on, the Week's grid of days shows it too.
-- An occurrence someone gave a day shows there regardless. Default off.
alter table public.routines
  add column if not exists show_on_week boolean not null default false;

comment on column public.routines.show_on_week is
  'Show on the week: on the Week grid (web) and By day (iPhone). Default false; a chosen occurrence shows regardless.';
