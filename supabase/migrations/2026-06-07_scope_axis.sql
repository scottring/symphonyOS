-- Scope axis: WHO can see an item (individual / couple / compound).
-- Replaces `context = 'family'` as the sharing gate so `context` becomes a pure
-- life-area (work/personal/family). Backfill preserves current visibility exactly:
-- family-context items were shared -> compound; everything else -> individual.
--
-- Verified against the current RLS in 063_context_based_sharing.sql.

-- 1. Add scope column to the five core household-shared tables.
ALTER TABLE tasks    ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('individual','couple','compound')) NOT NULL DEFAULT 'individual';
ALTER TABLE routines ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('individual','couple','compound')) NOT NULL DEFAULT 'individual';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('individual','couple','compound')) NOT NULL DEFAULT 'individual';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('individual','couple','compound')) NOT NULL DEFAULT 'individual';
ALTER TABLE notes    ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('individual','couple','compound')) NOT NULL DEFAULT 'individual';

-- 2. Backfill: family (was shared) -> compound; all else stays individual (private).
UPDATE tasks    SET scope = 'compound' WHERE context = 'family';
UPDATE routines SET scope = 'compound' WHERE context = 'family';
UPDATE projects SET scope = 'compound' WHERE context = 'family';
UPDATE contacts SET scope = 'compound' WHERE context = 'family';
UPDATE notes    SET scope = 'compound' WHERE context = 'family';

-- Partial indexes for the shared-item lookups.
CREATE INDEX IF NOT EXISTS idx_tasks_scope    ON tasks(user_id, scope)    WHERE scope <> 'individual';
CREATE INDEX IF NOT EXISTS idx_routines_scope ON routines(user_id, scope) WHERE scope <> 'individual';
CREATE INDEX IF NOT EXISTS idx_projects_scope ON projects(user_id, scope) WHERE scope <> 'individual';
CREATE INDEX IF NOT EXISTS idx_contacts_scope ON contacts(user_id, scope) WHERE scope <> 'individual';
CREATE INDEX IF NOT EXISTS idx_notes_scope    ON notes(user_id, scope)    WHERE scope <> 'individual';

-- 3. Swap RLS: gate sharing on scope, not context. individual = owner-only;
--    couple/compound = shared within household (two adults today).

-- TASKS
DROP POLICY IF EXISTS "Users can view tasks"   ON tasks;
CREATE POLICY "Users can view tasks"   ON tasks FOR SELECT USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can update tasks" ON tasks;
CREATE POLICY "Users can update tasks" ON tasks FOR UPDATE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can delete tasks" ON tasks;
CREATE POLICY "Users can delete tasks" ON tasks FOR DELETE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
-- INSERT stays owner-only (unchanged): "Users can create own tasks".

-- ROUTINES
DROP POLICY IF EXISTS "Users can view routines"   ON routines;
CREATE POLICY "Users can view routines"   ON routines FOR SELECT USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can update routines" ON routines;
CREATE POLICY "Users can update routines" ON routines FOR UPDATE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can delete routines" ON routines;
CREATE POLICY "Users can delete routines" ON routines FOR DELETE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));

-- PROJECTS
DROP POLICY IF EXISTS "Users can view projects"   ON projects;
CREATE POLICY "Users can view projects"   ON projects FOR SELECT USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can update projects" ON projects;
CREATE POLICY "Users can update projects" ON projects FOR UPDATE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can delete projects" ON projects;
CREATE POLICY "Users can delete projects" ON projects FOR DELETE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));

-- CONTACTS
DROP POLICY IF EXISTS "Users can view contacts"   ON contacts;
CREATE POLICY "Users can view contacts"   ON contacts FOR SELECT USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can update contacts" ON contacts;
CREATE POLICY "Users can update contacts" ON contacts FOR UPDATE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can delete contacts" ON contacts;
CREATE POLICY "Users can delete contacts" ON contacts FOR DELETE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));

-- NOTES
DROP POLICY IF EXISTS "Users can view notes"   ON notes;
CREATE POLICY "Users can view notes"   ON notes FOR SELECT USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can update notes" ON notes;
CREATE POLICY "Users can update notes" ON notes FOR UPDATE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can delete notes" ON notes;
CREATE POLICY "Users can delete notes" ON notes FOR DELETE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));

-- NOTE_ENTITY_LINKS: inherit from parent note — swap the parent's family gate to scope.
DROP POLICY IF EXISTS "Users can read note links"   ON note_entity_links;
CREATE POLICY "Users can read note links"   ON note_entity_links FOR SELECT USING (EXISTS (SELECT 1 FROM notes WHERE notes.id = note_entity_links.note_id AND (notes.user_id = auth.uid() OR (notes.scope IN ('couple','compound') AND users_share_household(auth.uid(), notes.user_id)))));
DROP POLICY IF EXISTS "Users can update note links" ON note_entity_links;
CREATE POLICY "Users can update note links" ON note_entity_links FOR UPDATE USING (EXISTS (SELECT 1 FROM notes WHERE notes.id = note_entity_links.note_id AND (notes.user_id = auth.uid() OR (notes.scope IN ('couple','compound') AND users_share_household(auth.uid(), notes.user_id)))));
DROP POLICY IF EXISTS "Users can delete note links" ON note_entity_links;
CREATE POLICY "Users can delete note links" ON note_entity_links FOR DELETE USING (EXISTS (SELECT 1 FROM notes WHERE notes.id = note_entity_links.note_id AND (notes.user_id = auth.uid() OR (notes.scope IN ('couple','compound') AND users_share_household(auth.uid(), notes.user_id)))));
-- INSERT note links stays owner-only (unchanged).

-- ACTIONABLE_INSTANCES: the routine branch gated on routine.context='family' -> routine.scope.
DROP POLICY IF EXISTS "Users can view instances"   ON actionable_instances;
CREATE POLICY "Users can view instances"   ON actionable_instances FOR SELECT USING (auth.uid() = user_id OR (users_share_household(auth.uid(), user_id) AND (entity_type = 'calendar_event' OR (entity_type = 'routine' AND EXISTS (SELECT 1 FROM routines r WHERE r.id::text = entity_id AND r.scope IN ('couple','compound'))))));
DROP POLICY IF EXISTS "Users can update instances" ON actionable_instances;
CREATE POLICY "Users can update instances" ON actionable_instances FOR UPDATE USING (auth.uid() = user_id OR (users_share_household(auth.uid(), user_id) AND (entity_type = 'calendar_event' OR (entity_type = 'routine' AND EXISTS (SELECT 1 FROM routines r WHERE r.id::text = entity_id AND r.scope IN ('couple','compound'))))));
DROP POLICY IF EXISTS "Users can delete instances" ON actionable_instances;
CREATE POLICY "Users can delete instances" ON actionable_instances FOR DELETE USING (auth.uid() = user_id OR (users_share_household(auth.uid(), user_id) AND (entity_type = 'calendar_event' OR (entity_type = 'routine' AND EXISTS (SELECT 1 FROM routines r WHERE r.id::text = entity_id AND r.scope IN ('couple','compound'))))));
-- INSERT instances stays owner-only (unchanged).

-- event_notes / calendar events: scope-by-calendar is handled in the events plan, not here.
-- The wall (.eq('context','family')), needs-discussion, meal-events, and family-capture
-- still read context='family' and KEEP WORKING (context column is unchanged); they are
-- migrated to scope in the dedicated "migrate context='family' surfaces" step.
