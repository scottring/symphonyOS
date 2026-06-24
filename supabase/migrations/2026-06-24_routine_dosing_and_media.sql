-- supabase/migrations/2026-06-24_routine_dosing_and_media.sql
-- Dosing: a routine can recur N times within a single day.
alter table routines add column if not exists times_per_day jsonb;
-- Forward-compat slot for a per-exercise image (fidelity B); null in fidelity A.
alter table routines add column if not exists image_url text;

-- Allow attachments to hang off routines (source documents / exercise media).
alter table attachments drop constraint if exists attachments_entity_type_check;
alter table attachments add constraint attachments_entity_type_check
  check (entity_type in ('task','project','event_note','instance_note','note','routine'));
