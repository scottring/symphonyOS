-- Domains System Migration
-- Converts context enum to proper domain architecture with sharing support
--
-- This enables:
-- - User-created domains (future)
-- - Domain sharing (Family domain shared between household members)
-- - Proper multi-user support
--
-- For now, creates 3 default domains per user: Work, Family, Personal

-- ============================================================================
-- 1. CREATE DOMAINS TABLE
-- ============================================================================

CREATE TABLE domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  color TEXT, -- Hex color for UI display (e.g., '#3d8b6e')
  icon TEXT, -- Icon identifier for UI (e.g., 'briefcase', 'home', 'user')
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for efficient owner queries
CREATE INDEX domains_owner_id_idx ON domains(owner_id);

-- ============================================================================
-- 2. CREATE DOMAIN_MEMBERS TABLE (for sharing)
-- ============================================================================

CREATE TABLE domain_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID REFERENCES domains(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT CHECK (role IN ('owner', 'member')) DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Prevent duplicate memberships
  UNIQUE(domain_id, user_id)
);

-- Indexes for efficient queries
CREATE INDEX domain_members_domain_id_idx ON domain_members(domain_id);
CREATE INDEX domain_members_user_id_idx ON domain_members(user_id);

-- ============================================================================
-- 2a. ENABLE RLS AND CREATE POLICIES (after both tables exist)
-- ============================================================================

-- Enable RLS on domains
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;

-- Users can view domains they own or are members of
CREATE POLICY "Users can view own and shared domains"
  ON domains FOR SELECT
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM domain_members
      WHERE domain_members.domain_id = domains.id
      AND domain_members.user_id = auth.uid()
    )
  );

-- Users can create their own domains
CREATE POLICY "Users can create own domains"
  ON domains FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Users can update domains they own
CREATE POLICY "Users can update own domains"
  ON domains FOR UPDATE
  USING (owner_id = auth.uid());

-- Users can delete domains they own
CREATE POLICY "Users can delete own domains"
  ON domains FOR DELETE
  USING (owner_id = auth.uid());

-- Enable RLS on domain_members
ALTER TABLE domain_members ENABLE ROW LEVEL SECURITY;

-- Users can view memberships for domains they have access to
CREATE POLICY "Users can view domain memberships"
  ON domain_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM domains
      WHERE domains.id = domain_members.domain_id
      AND domains.owner_id = auth.uid()
    )
  );

-- Only domain owners can add members
CREATE POLICY "Domain owners can add members"
  ON domain_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM domains
      WHERE domains.id = domain_id
      AND domains.owner_id = auth.uid()
    )
  );

-- Only domain owners can remove members
CREATE POLICY "Domain owners can remove members"
  ON domain_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM domains
      WHERE domains.id = domain_id
      AND domains.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- 3. ADD DOMAIN_ID TO TASKS TABLE
-- ============================================================================

-- Add domain_id column (nullable for migration)
ALTER TABLE tasks
ADD COLUMN domain_id UUID REFERENCES domains(id) ON DELETE SET NULL;

-- Index for efficient domain queries
CREATE INDEX tasks_domain_id_idx ON tasks(domain_id) WHERE domain_id IS NOT NULL;

-- ============================================================================
-- 4. ADD DOMAIN_ID TO ROUTINES TABLE
-- ============================================================================

-- Add domain_id column (nullable for migration)
ALTER TABLE routines
ADD COLUMN domain_id UUID REFERENCES domains(id) ON DELETE SET NULL;

-- Index for efficient domain queries
CREATE INDEX routines_domain_id_idx ON routines(domain_id) WHERE domain_id IS NOT NULL;

-- ============================================================================
-- 5. MIGRATE EXISTING DATA
-- ============================================================================

-- Create default domains for all existing users
-- This ensures every user gets Work, Family, Personal domains

DO $$
DECLARE
  user_record RECORD;
  work_domain_id UUID;
  family_domain_id UUID;
  personal_domain_id UUID;
BEGIN
  FOR user_record IN SELECT id FROM auth.users LOOP
    -- Create Work domain
    INSERT INTO domains (name, owner_id, color, icon)
    VALUES ('Work', user_record.id, '#3b82f6', 'briefcase')
    RETURNING id INTO work_domain_id;

    -- Create Family domain
    INSERT INTO domains (name, owner_id, color, icon)
    VALUES ('Family', user_record.id, '#f59e0b', 'home')
    RETURNING id INTO family_domain_id;

    -- Create Personal domain
    INSERT INTO domains (name, owner_id, color, icon)
    VALUES ('Personal', user_record.id, '#8b5cf6', 'user')
    RETURNING id INTO personal_domain_id;

    -- Migrate tasks: context -> domain_id
    UPDATE tasks
    SET domain_id = CASE
      WHEN context = 'work' THEN work_domain_id
      WHEN context = 'family' THEN family_domain_id
      WHEN context = 'personal' THEN personal_domain_id
      ELSE NULL
    END
    WHERE user_id = user_record.id;

    -- Note: Routines don't have a context column, so they stay with domain_id = NULL for now
    -- They can be assigned to domains via the UI after migration
  END LOOP;
END $$;

-- ============================================================================
-- 6. UPDATE RLS POLICIES FOR TASKS
-- ============================================================================

-- Drop old policies
DROP POLICY IF EXISTS "Users can view own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can create own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;

-- New policies: Users can see tasks in domains they have access to
CREATE POLICY "Users can view tasks in accessible domains"
  ON tasks FOR SELECT
  USING (
    user_id = auth.uid() -- Own tasks
    OR domain_id IN ( -- Tasks in shared domains
      SELECT domain_id FROM domain_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tasks in accessible domains"
  ON tasks FOR INSERT
  WITH CHECK (
    user_id = auth.uid() -- Creating for yourself
    AND (
      domain_id IS NULL -- No domain
      OR EXISTS ( -- Domain you own
        SELECT 1 FROM domains
        WHERE domains.id = domain_id
        AND domains.owner_id = auth.uid()
      )
      OR domain_id IN ( -- Domain you're a member of
        SELECT domain_id FROM domain_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update tasks in accessible domains"
  ON tasks FOR UPDATE
  USING (
    user_id = auth.uid()
    OR domain_id IN (
      SELECT domain_id FROM domain_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own tasks"
  ON tasks FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- 7. UPDATE RLS POLICIES FOR ROUTINES
-- ============================================================================

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can view own routines" ON routines;
DROP POLICY IF EXISTS "Users can create own routines" ON routines;
DROP POLICY IF EXISTS "Users can update own routines" ON routines;
DROP POLICY IF EXISTS "Users can delete own routines" ON routines;

-- New policies: Users can see routines in domains they have access to
CREATE POLICY "Users can view routines in accessible domains"
  ON routines FOR SELECT
  USING (
    user_id = auth.uid()
    OR domain_id IN (
      SELECT domain_id FROM domain_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create routines in accessible domains"
  ON routines FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      domain_id IS NULL
      OR EXISTS (
        SELECT 1 FROM domains
        WHERE domains.id = domain_id
        AND domains.owner_id = auth.uid()
      )
      OR domain_id IN (
        SELECT domain_id FROM domain_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update routines in accessible domains"
  ON routines FOR UPDATE
  USING (
    user_id = auth.uid()
    OR domain_id IN (
      SELECT domain_id FROM domain_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own routines"
  ON routines FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- 8. CLEANUP (Optional - keeping context for backwards compatibility)
-- ============================================================================

-- We're keeping the context column on tasks for now to avoid breaking existing code
-- It will be removed in a future migration once all code is updated
--
-- Note: Routines never had a context column, so no cleanup needed there
--
-- Uncomment to remove context column from tasks:
-- ALTER TABLE tasks DROP COLUMN context;

-- Add trigger to keep tasks.context in sync with domain_id (temporary)
CREATE OR REPLACE FUNCTION sync_task_context_from_domain()
RETURNS TRIGGER AS $$
BEGIN
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_sync_context
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION sync_task_context_from_domain();
