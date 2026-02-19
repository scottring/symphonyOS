-- Context-Based Household Sharing
-- ================================
-- Previously: all data shared unconditionally between household members.
-- Now: only data with context = 'family' is shared. Work and personal data
-- stays private to the owner.
--
-- Tables affected:
--   tasks       (already has context column)
--   routines    (already has context column)
--   projects    (already has context column)
--   contacts    (adding context column)
--   notes       (adding context column)
--   event_notes (already has context column)
--   actionable_instances (linked to routines — scoped via routine context)
--   note_entity_links    (inherits from parent note — updated to match)
--
-- Tables NOT changed (remain fully shared within household):
--   family_members, lists (has own visibility field), coaching/layer data,
--   manuals, yearbooks, entries, conversations, checkins, assessment_actions

-- ============================================================================
-- 1. ADD CONTEXT COLUMN TO CONTACTS AND NOTES
-- ============================================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS context TEXT CHECK (context IN ('work', 'family', 'personal'));

CREATE INDEX IF NOT EXISTS idx_contacts_context ON contacts(user_id, context) WHERE context IS NOT NULL;

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS context TEXT CHECK (context IN ('work', 'family', 'personal'));

CREATE INDEX IF NOT EXISTS idx_notes_context ON notes(user_id, context) WHERE context IS NOT NULL;

-- ============================================================================
-- 2. TASKS: Share only family-context tasks
-- ============================================================================

DROP POLICY IF EXISTS "Users can view household tasks" ON tasks;
CREATE POLICY "Users can view tasks"
  ON tasks FOR SELECT
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

-- Insert stays owner-only (unchanged)
-- DROP + recreate to ensure clean state
DROP POLICY IF EXISTS "Users can create own tasks" ON tasks;
CREATE POLICY "Users can create own tasks"
  ON tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update household tasks" ON tasks;
CREATE POLICY "Users can update tasks"
  ON tasks FOR UPDATE
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Users can delete household tasks" ON tasks;
CREATE POLICY "Users can delete tasks"
  ON tasks FOR DELETE
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

-- ============================================================================
-- 3. ROUTINES: Share only family-context routines
-- ============================================================================

DROP POLICY IF EXISTS "Users can view household routines" ON routines;
CREATE POLICY "Users can view routines"
  ON routines FOR SELECT
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Users can create own routines" ON routines;
CREATE POLICY "Users can create own routines"
  ON routines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update household routines" ON routines;
CREATE POLICY "Users can update routines"
  ON routines FOR UPDATE
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Users can delete household routines" ON routines;
CREATE POLICY "Users can delete routines"
  ON routines FOR DELETE
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

-- ============================================================================
-- 4. ACTIONABLE INSTANCES: Share only if parent routine is family-context
-- ============================================================================

DROP POLICY IF EXISTS "Users can view household instances" ON actionable_instances;
CREATE POLICY "Users can view instances"
  ON actionable_instances FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      users_share_household(auth.uid(), user_id)
      AND (
        -- Calendar events: shared if user shares household
        entity_type = 'calendar_event'
        OR
        -- Routines: shared only if the parent routine is family-context
        (entity_type = 'routine' AND EXISTS (
          SELECT 1 FROM routines r
          WHERE r.id::text = entity_id
          AND r.context = 'family'
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Users can create own instances" ON actionable_instances;
CREATE POLICY "Users can create own instances"
  ON actionable_instances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update household instances" ON actionable_instances;
CREATE POLICY "Users can update instances"
  ON actionable_instances FOR UPDATE
  USING (
    auth.uid() = user_id
    OR (
      users_share_household(auth.uid(), user_id)
      AND (
        entity_type = 'calendar_event'
        OR (entity_type = 'routine' AND EXISTS (
          SELECT 1 FROM routines r
          WHERE r.id::text = entity_id
          AND r.context = 'family'
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete household instances" ON actionable_instances;
CREATE POLICY "Users can delete instances"
  ON actionable_instances FOR DELETE
  USING (
    auth.uid() = user_id
    OR (
      users_share_household(auth.uid(), user_id)
      AND (
        entity_type = 'calendar_event'
        OR (entity_type = 'routine' AND EXISTS (
          SELECT 1 FROM routines r
          WHERE r.id::text = entity_id
          AND r.context = 'family'
        ))
      )
    )
  );

-- ============================================================================
-- 5. PROJECTS: Share only family-context projects
-- ============================================================================

DROP POLICY IF EXISTS "Users can view household projects" ON projects;
CREATE POLICY "Users can view projects"
  ON projects FOR SELECT
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Users can create own projects" ON projects;
CREATE POLICY "Users can create own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update household projects" ON projects;
CREATE POLICY "Users can update projects"
  ON projects FOR UPDATE
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Users can delete household projects" ON projects;
CREATE POLICY "Users can delete projects"
  ON projects FOR DELETE
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

-- ============================================================================
-- 6. CONTACTS: Share only family-context contacts
-- ============================================================================

DROP POLICY IF EXISTS "Users can view household contacts" ON contacts;
CREATE POLICY "Users can view contacts"
  ON contacts FOR SELECT
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Users can create own contacts" ON contacts;
CREATE POLICY "Users can create own contacts"
  ON contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update household contacts" ON contacts;
CREATE POLICY "Users can update contacts"
  ON contacts FOR UPDATE
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Users can delete household contacts" ON contacts;
CREATE POLICY "Users can delete contacts"
  ON contacts FOR DELETE
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

-- ============================================================================
-- 7. NOTES: Share only family-context notes
-- ============================================================================

DROP POLICY IF EXISTS "Users can view household notes" ON notes;
CREATE POLICY "Users can view notes"
  ON notes FOR SELECT
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Users can create own notes" ON notes;
CREATE POLICY "Users can create own notes"
  ON notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update household notes" ON notes;
CREATE POLICY "Users can update notes"
  ON notes FOR UPDATE
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Users can delete household notes" ON notes;
CREATE POLICY "Users can delete notes"
  ON notes FOR DELETE
  USING (
    auth.uid() = user_id
    OR (context = 'family' AND users_share_household(auth.uid(), user_id))
  );

-- ============================================================================
-- 8. NOTE ENTITY LINKS: Inherit sharing from parent note
-- ============================================================================
-- These already check parent note ownership. Update to also allow access
-- when the parent note is family-context and users share a household.

DROP POLICY IF EXISTS "Users can read links for their notes" ON note_entity_links;
CREATE POLICY "Users can read note links"
  ON note_entity_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = note_entity_links.note_id
      AND (
        notes.user_id = auth.uid()
        OR (notes.context = 'family' AND users_share_household(auth.uid(), notes.user_id))
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert links for their notes" ON note_entity_links;
CREATE POLICY "Users can insert note links"
  ON note_entity_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = note_entity_links.note_id
      AND notes.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update links for their notes" ON note_entity_links;
CREATE POLICY "Users can update note links"
  ON note_entity_links FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = note_entity_links.note_id
      AND (
        notes.user_id = auth.uid()
        OR (notes.context = 'family' AND users_share_household(auth.uid(), notes.user_id))
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete links for their notes" ON note_entity_links;
CREATE POLICY "Users can delete note links"
  ON note_entity_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = note_entity_links.note_id
      AND (
        notes.user_id = auth.uid()
        OR (notes.context = 'family' AND users_share_household(auth.uid(), notes.user_id))
      )
    )
  );

-- ============================================================================
-- 9. EVENT NOTES: Share only family-context event notes
-- ============================================================================
-- event_notes gained a context column in migration 061. Update RLS if policies exist.

DO $$
BEGIN
  -- Only update if the table has household-sharing policies
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'event_notes'
    AND policyname LIKE '%household%'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view household event_notes" ON event_notes';
    EXECUTE 'CREATE POLICY "Users can view event notes" ON event_notes FOR SELECT USING (
      auth.uid() = user_id
      OR (context = ''family'' AND users_share_household(auth.uid(), user_id))
    )';
  END IF;
END $$;

-- ============================================================================
-- 10. INTELLIGENCE LAYERS: Add missing RLS (read-only for all authenticated)
-- ============================================================================

ALTER TABLE intelligence_layers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view layers"
  ON intelligence_layers FOR SELECT
  TO authenticated
  USING (true);

-- No insert/update/delete policies — only admins via service_role can modify

-- ============================================================================
-- NOTES ON BEHAVIOR CHANGE
-- ============================================================================
-- BEFORE: Iris sees all of Scott's tasks, routines, projects, contacts, notes.
-- AFTER:  Iris only sees items where context = 'family'. Work and personal
--         items are invisible to household members.
--
-- Items with context = NULL are PRIVATE (not shared). This is intentional —
-- untagged items default to private. Users must explicitly set context = 'family'
-- to share with household.
--
-- Family-shared tables (unchanged, still fully shared):
--   family_members, manuals, yearbooks, entries, conversations, checkins,
--   assessment_actions, lists (uses own visibility field)
