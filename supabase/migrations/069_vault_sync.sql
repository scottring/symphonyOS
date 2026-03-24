-- Vault Sync: Extend notes table for Obsidian vault integration
-- ============================================================
-- Enables syncing markdown files from the scotts-world Obsidian vault
-- into Symphony's existing notes system via GitHub webhook.
-- Also enables pgvector for semantic search.

-- ============================================================================
-- 1. EXTEND CHECK CONSTRAINTS on notes table
-- ============================================================================

-- Drop and recreate type constraint to include 'vault_note'
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_type_check;
ALTER TABLE notes ADD CONSTRAINT notes_type_check
  CHECK (type IN ('quick_capture', 'meeting_note', 'transcript', 'voice_memo', 'general', 'task_note', 'vault_note'));

-- Drop and recreate source constraint to include 'vault'
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_source_check;
ALTER TABLE notes ADD CONSTRAINT notes_source_check
  CHECK (source IN ('manual', 'fathom', 'voice', 'import', 'task', 'vault'));

-- ============================================================================
-- 2. ADD VAULT-SPECIFIC COLUMNS
-- ============================================================================

-- Path within the vault repo (e.g., 'people/dr-mills.md')
ALTER TABLE notes ADD COLUMN IF NOT EXISTS vault_path TEXT;

-- Domain from vault YAML frontmatter (e.g., 'health', 'family', 'stacks-data')
ALTER TABLE notes ADD COLUMN IF NOT EXISTS vault_domain TEXT;

-- Full YAML frontmatter stored as JSON for future use
ALTER TABLE notes ADD COLUMN IF NOT EXISTS vault_frontmatter JSONB;

-- SHA of the last commit that updated this note
ALTER TABLE notes ADD COLUMN IF NOT EXISTS vault_last_commit_sha TEXT;

-- Unique constraint for vault notes: one note per vault file per user
-- (Must be a real constraint, not a partial index, for PostgREST upsert)
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_user_vault_path_unique;
ALTER TABLE notes ADD CONSTRAINT notes_user_vault_path_unique UNIQUE (user_id, vault_path);

-- Index for vault domain filtering
CREATE INDEX IF NOT EXISTS idx_notes_vault_domain
  ON notes(vault_domain) WHERE vault_domain IS NOT NULL;

-- ============================================================================
-- 3. PGVECTOR FOR SEMANTIC SEARCH
-- ============================================================================

-- Enable the vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (1536 dimensions = OpenAI text-embedding-3-small)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_notes_embedding
  ON notes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- 4. HELPER FUNCTION: Map vault domain to Symphony context
-- ============================================================================

CREATE OR REPLACE FUNCTION vault_domain_to_context(domain TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE domain
    WHEN 'family' THEN 'family'
    WHEN 'stacks-data' THEN 'work'
    WHEN 'symphony-os' THEN 'work'
    WHEN 'ppvis' THEN 'work'
    WHEN 'job-search' THEN 'personal'
    WHEN 'health' THEN 'personal'
    WHEN 'personal' THEN 'personal'
    ELSE NULL  -- unknown domains default to private (no context = owner only)
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 5. RPC: Semantic search function
-- ============================================================================

CREATE OR REPLACE FUNCTION search_notes_semantic(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  filter_vault_domain text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  vault_path text,
  vault_domain text,
  context text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.title,
    n.content,
    n.vault_path,
    n.vault_domain,
    n.context,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM notes n
  WHERE
    n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
    AND (
      -- Owner sees everything
      n.user_id = auth.uid()
      -- Household members see family-context notes
      OR (n.context = 'family' AND users_share_household(auth.uid(), n.user_id))
    )
    AND (filter_vault_domain IS NULL OR n.vault_domain = filter_vault_domain)
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
