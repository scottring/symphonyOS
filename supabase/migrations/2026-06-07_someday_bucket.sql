-- Allow the new 'someday' bucket (distinct from 'quarter'='this season').
-- bucket is stored as free text today, so no constraint change is required;
-- this migration documents the new allowed value. If a CHECK is added later,
-- include 'someday'. No backfill: existing 'quarter' rows stay 'quarter'
-- (This Season); items meant as no-horizon get re-triaged to 'someday' in-app.
SELECT 1;
