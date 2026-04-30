-- 082_standing_habits_paused_for_weeks.sql
-- Per-week pause: list of week_start dates (Mondays) where this habit should
-- not be applied. Distinct from the global `paused` boolean which suppresses
-- the habit indefinitely.

alter table standing_habits
  add column paused_for_weeks date[] not null default array[]::date[];
