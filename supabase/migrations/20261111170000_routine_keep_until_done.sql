-- "Keep it until it's done" (Scott, 2026-11-11: Pay FFG was due on the 10th,
-- forgotten, and stayed quietly on the 10th). With this on, a routine's
-- missed occurrence carries onto Today ("from Tue") until it is ticked off
-- or skipped, or its next occurrence comes due. Default off.
alter table public.routines
  add column if not exists keep_until_done boolean not null default false;

comment on column public.routines.keep_until_done is
  'Keep it until it''s done: a missed occurrence carries onto Today until completed or skipped. Default false.';
