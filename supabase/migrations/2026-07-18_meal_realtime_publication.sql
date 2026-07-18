-- 2026-07-18_meal_realtime_publication.sql
-- Add meal_plan_entries and meal_plans to the supabase_realtime publication so
-- useMealPlan can subscribe to a per-instance postgres_changes channel instead
-- of depending on GeneratePlanContext's shared refresh signal.
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'meal_plan_entries') then
    alter publication supabase_realtime add table meal_plan_entries;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'meal_plans') then
    alter publication supabase_realtime add table meal_plans;
  end if;
end $$;
