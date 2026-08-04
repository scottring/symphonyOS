-- Tasks carry an email address alongside phone_number.
--
-- Same job as phone_number: how to reach whoever the task requires (the school
-- office, the vendor, the claims desk), captured once and surfaced as a
-- tap-to-act affordance when you come to do the task.
--
-- Applied to production 2026-08-04 via the Management API, because local
-- migrations are out of sync with the deployed schema. Recorded here so the
-- file history matches the database.
alter table public.tasks add column if not exists email text;
