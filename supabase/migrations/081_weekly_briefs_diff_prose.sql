-- 081_weekly_briefs_diff_prose.sql
-- AI-generated narrative explaining what's different about this week's plan
-- versus the planner's typical week. Set by meal-plan-generate from the
-- model's notes_for_planner output. Manually editable.

alter table weekly_briefs
  add column diff_prose text;
