-- ============================================================================
-- ADD individual_domains COLUMN TO MANUALS TABLE
-- ============================================================================
-- Individual manuals (type='individual') store per-person domain data in a
-- separate JSONB column alongside the household-level domains column.
-- This keeps household and individual domain schemas cleanly separated.
-- Migration is idempotent (safe to re-run).
-- ============================================================================

-- Add individual_domains column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'manuals' and column_name = 'individual_domains'
  ) then
    alter table manuals add column individual_domains jsonb not null default '{}'::jsonb;
  end if;
end $$;
