-- Rollback for 2026-09-27_guard_goal_conversion.sql. Removes only what that
-- migration added; guard_goal_support and all data are untouched.
drop trigger if exists tasks_guard_goal_target_lock on public.tasks;
drop trigger if exists tasks_guard_goal_unconvert on public.tasks;
drop function if exists public.guard_goal_link_target();
drop function if exists public.guard_goal_unconvert();
drop function if exists public.goal_link_target_is_goal(uuid, boolean);
