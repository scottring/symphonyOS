-- The day's chosen plan, separate from the day a thing is merely dated.
--
-- Today used to expand everything eligible for the day into its main list: every
-- untimed task dated today and every flexible routine occurrence. A weekend of
-- weekly chores read as a wall. Now the main list is what you CHOSE for the day
-- (plus appointments and anything with a time); the rest waits in the Today pin
-- as "Scheduled today" (dated, a commitment) or "Available" (a choice).
--
-- "Chosen for the day" is a DATE, like needed_on, so it expires by ceasing to
-- match the viewed day — nothing has to clear it, nothing is deleted, and a
-- choice never silently carries into tomorrow. needed_on itself is NOT reused:
-- it already means "needed today" on the note, the kitchen wall's kid cards and
-- homework due dates, and planning a chore must not turn it into homework.
--
-- Both columns are nullable with no default, so every existing row reads as
-- "not chosen" and older clients that never write them are unaffected. No row
-- is rewritten by this migration.

alter table public.tasks
  add column if not exists planned_on date;

comment on column public.tasks.planned_on is
  'The day this task was deliberately chosen for (Today''s main list). A date, not a flag: it expires by ceasing to match the viewed day. Independent of scheduled_for (the day it is dated) and of bucket/week_start (its broader commitment, which planning a day never removes).';

-- One routine OCCURRENCE (routine + date) chosen for its day without a time.
-- Lives on the instance row, never on the routine: planning Saturday''s laundry
-- must not rewrite the repeating rule.
alter table public.actionable_instances
  add column if not exists planned_on date;

comment on column public.actionable_instances.planned_on is
  'The day this occurrence was chosen for, without a time. NULL = not chosen. The recurrence rule is never touched; a time still lives in deferred_to.';
