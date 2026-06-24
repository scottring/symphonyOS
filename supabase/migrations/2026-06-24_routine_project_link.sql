-- Link routines to their parent project (e.g. a physical-therapy exercise
-- program). Nullable so existing routines are unaffected; set null on project
-- delete so orphaned routines stay intact.
alter table routines add column if not exists project_id uuid references projects(id) on delete set null;
