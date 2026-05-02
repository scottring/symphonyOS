-- 089_clean_break_for_sunday_start.sql
-- Switch week_start convention from Monday to Sunday.
-- No real users yet, so wiping is the simplest correct path.
-- Existing rows have Monday week_start dates and Mon-indexed day_of_week
-- values, both of which would be wrong under the new convention.

truncate table meal_plan_entries cascade;
truncate table meal_plans cascade;
truncate table weekly_briefs cascade;
