-- Planning Workspace: research materials for informed rule-making
CREATE TABLE IF NOT EXISTS planning_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  content TEXT,                          -- pasted text, notes, excerpts
  resource_type TEXT NOT NULL DEFAULT 'note',  -- 'note' | 'paste' | 'upload'
  source_url TEXT,                       -- optional: URL of article/resource
  file_path TEXT,                        -- Supabase Storage path for uploads
  file_name TEXT,
  file_type TEXT,                        -- MIME type
  file_size INTEGER,
  tags TEXT[] DEFAULT '{}',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE planning_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own planning resources"
  ON planning_resources FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_planning_resources_user ON planning_resources(user_id);
CREATE INDEX IF NOT EXISTS idx_planning_resources_type ON planning_resources(user_id, resource_type);
