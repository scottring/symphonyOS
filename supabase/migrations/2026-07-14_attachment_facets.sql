-- Attachment facets: typed, validated extraction results from analyze-attachment.
-- null facets = never analyzed; analyzed_at set with facets '[]' = analyzed,
-- nothing found (or failed quietly).
-- Spec: docs/superpowers/specs/2026-07-14-attachment-facets-design.md
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS facets jsonb;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

-- analyze-attachment updates rows through a caller-scoped client, so RLS
-- needs an UPDATE policy (added elsewhere on prod already — guard it).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'attachments' AND policyname = 'Users can update own attachments'
  ) THEN
    CREATE POLICY "Users can update own attachments"
      ON attachments FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
