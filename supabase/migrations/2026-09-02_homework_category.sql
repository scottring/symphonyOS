-- homework joins tasks.category. The constraint was auto-named by
-- 028_task_category.sql. Applied by hand in prod (DDL goes through Scott).
alter table tasks drop constraint if exists tasks_category_check;
alter table tasks add constraint tasks_category_check
  check (category in ('task','chore','errand','event','activity','homework'));
