-- supabase/migrations/2026-06-24_routine_parent_steps.sql
alter table routines add column if not exists parent_routine_id uuid references routines(id) on delete cascade;
alter table routines add column if not exists step_order integer;
create index if not exists idx_routines_parent on routines(parent_routine_id);
