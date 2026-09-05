-- Drop the custom "span" planning container.
--
-- A span was a saved date range (a long weekend, a school break) with its own
-- task pool beside Week and Month on Today. It asked you to file work into a
-- third bucket that Week already held — a long weekend IS inside a week — so
-- it read as functionally pointless and nothing was ever filed into one
-- (0 rows with bucket='span' or span_id set, checked 2026-09-05).
--
-- The range survives as a VIEW: the timeblocking page ("Plan Your Time") now
-- takes a start and an end, with Today / Weekend / 3 days / Week presets, and
-- lays those days out as columns. That is what a span was for.
--
-- APPLIED to prod 2026-09-05, after the deploy that removed every reader of
-- span_id. Verified: to_regclass('public.spans') is null, tasks.span_id gone.

drop index if exists public.tasks_span_idx;
alter table public.tasks drop column if exists span_id;
drop table if exists public.spans;
