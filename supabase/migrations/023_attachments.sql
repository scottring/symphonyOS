-- Attachments system for notes fields across all entities
-- Supports file uploads on tasks, projects, events, instance notes, and notes

-- ============================================================================
-- ATTACHMENTS TABLE
-- ============================================================================

CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Polymorphic reference to parent entity
  entity_type TEXT NOT NULL 
    CHECK (entity_type IN ('task', 'project', 'event_note', 'instance_note', 'note')),
  entity_id TEXT NOT NULL,  -- UUID as text to handle various ID formats
  
  -- File metadata
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,  -- MIME type
  file_size INTEGER NOT NULL,  -- bytes
  storage_path TEXT NOT NULL,  -- path in Supabase Storage bucket
  
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX attachments_user_id_idx ON attachments(user_id);
CREATE INDEX attachments_entity_idx ON attachments(entity_type, entity_id);

-- RLS
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own attachments"
  ON attachments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own attachments"
  ON attachments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own attachments"
  ON attachments FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- STORAGE BUCKET SETUP
-- Note: Run this in Supabase Dashboard SQL editor or via supabase CLI
-- The bucket needs to be created manually or via the dashboard
-- ============================================================================

-- Create the storage bucket (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  52428800,  -- 50MB in bytes
  ARRAY[
    'image/png',
    'image/jpeg', 
    'image/svg+xml',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'audio/mpeg'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  file_size_limit = EXCLUDED.file_size_limit;

-- Storage RLS policies
CREATE POLICY "Users can upload own attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
