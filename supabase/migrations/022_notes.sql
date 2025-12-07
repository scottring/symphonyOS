-- Notes System Migration
-- Creates note_topics, notes, and note_entity_links tables
-- Following architecture from docs/notes-architecture-decisions.md

-- ============================================================================
-- NOTE TOPICS: Optional grouping for related notes (thematic threads)
-- ============================================================================
CREATE TABLE note_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT, -- hex color for visual distinction
  archived_at TIMESTAMPTZ, -- soft archive instead of delete
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for user's topics lookup
CREATE INDEX idx_note_topics_user_id ON note_topics(user_id);

-- RLS policies for note_topics
ALTER TABLE note_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own note topics"
  ON note_topics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own note topics"
  ON note_topics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own note topics"
  ON note_topics FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own note topics"
  ON note_topics FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- NOTES: Core content entity
-- ============================================================================
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT, -- optional, can be derived from first line of content
  content TEXT NOT NULL,
  type TEXT DEFAULT 'quick_capture' CHECK (type IN ('quick_capture', 'meeting_note', 'transcript', 'voice_memo', 'general')),
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'fathom', 'voice', 'import')),
  topic_id UUID REFERENCES note_topics(id) ON DELETE SET NULL, -- optional topic grouping
  audio_url TEXT, -- for voice memos (future)
  external_id TEXT, -- for Fathom or other integrations (future)
  external_url TEXT, -- link to source (Fathom call, etc.)
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for notes
CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_topic_id ON notes(topic_id);
CREATE INDEX idx_notes_created_at ON notes(user_id, created_at DESC);
CREATE INDEX idx_notes_type ON notes(user_id, type);

-- RLS policies for notes
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own notes"
  ON notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notes"
  ON notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notes"
  ON notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notes"
  ON notes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- NOTE ENTITY LINKS: Connect notes to Symphony entities
-- ============================================================================
CREATE TABLE note_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('event', 'project', 'contact', 'task', 'routine')),
  entity_id TEXT NOT NULL, -- UUID for internal entities, google_event_id for calendar events
  link_type TEXT DEFAULT 'related' CHECK (link_type IN ('related', 'primary', 'mentioned')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Unique constraint: one link per note-entity pair
  UNIQUE (note_id, entity_type, entity_id)
);

-- Indexes for entity links
CREATE INDEX idx_note_entity_links_note_id ON note_entity_links(note_id);
CREATE INDEX idx_note_entity_links_entity ON note_entity_links(entity_type, entity_id);

-- RLS policies for note_entity_links (inherit access from parent note)
ALTER TABLE note_entity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read links for their notes"
  ON note_entity_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM notes WHERE notes.id = note_entity_links.note_id AND notes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert links for their notes"
  ON note_entity_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notes WHERE notes.id = note_entity_links.note_id AND notes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update links for their notes"
  ON note_entity_links FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM notes WHERE notes.id = note_entity_links.note_id AND notes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete links for their notes"
  ON note_entity_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM notes WHERE notes.id = note_entity_links.note_id AND notes.user_id = auth.uid()
    )
  );

-- ============================================================================
-- TRIGGERS: Auto-update updated_at timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_note_topics_updated_at
  BEFORE UPDATE ON note_topics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
