-- Hotfix: Add bidirectional sync between context and domain_id
-- This ensures tasks created via UI (which sets context) get domain_id set automatically

-- Drop the old one-way trigger
DROP TRIGGER IF EXISTS tasks_sync_context ON tasks;
DROP FUNCTION IF EXISTS sync_task_context_from_domain();

-- Create new bidirectional sync function
CREATE OR REPLACE FUNCTION sync_task_context_and_domain()
RETURNS TRIGGER AS $$
BEGIN
  -- DIRECTION 1: domain_id → context
  -- If domain_id is set, sync to context
  IF NEW.domain_id IS NOT NULL THEN
    NEW.context := (
      SELECT CASE name
        WHEN 'Work' THEN 'work'::text
        WHEN 'Family' THEN 'family'::text
        WHEN 'Personal' THEN 'personal'::text
        ELSE NEW.context
      END
      FROM domains WHERE id = NEW.domain_id
    );
  END IF;

  -- DIRECTION 2: context → domain_id
  -- If context is set but domain_id is NULL, find matching domain
  IF NEW.context IS NOT NULL AND NEW.domain_id IS NULL THEN
    NEW.domain_id := (
      SELECT id FROM domains
      WHERE owner_id = NEW.user_id
      AND name = CASE NEW.context
        WHEN 'work' THEN 'Work'
        WHEN 'family' THEN 'Family'
        WHEN 'personal' THEN 'Personal'
      END
      LIMIT 1
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER tasks_sync_context_and_domain
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION sync_task_context_and_domain();
