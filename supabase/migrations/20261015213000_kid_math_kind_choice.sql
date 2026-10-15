-- Math of the day: a grown-up picks each kid's problem type (Scott,
-- 2026-10-15: "i clicked long division and it gave the kids fraction
-- problems"). Null keeps the weekday schedule (Mon ×, Tue ÷, Wed fractions,
-- Thu + / −, Fri word problem). Lives on the kid's prefs row beside their
-- topics, under the same household policies.

alter table public.kid_math_prefs
  add column if not exists kind text
  check (kind in ('multiply', 'divide', 'fraction', 'addsub', 'word'));

notify pgrst, 'reload schema';
