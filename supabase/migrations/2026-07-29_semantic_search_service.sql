-- Service-role variant of search_notes_semantic (069_vault_sync.sql).
-- That function scopes by auth.uid(), which is NULL for the service-role
-- clients the proactive engine and symphony-agent use — they'd always get
-- zero rows. This variant takes the user id explicitly and is executable
-- by service_role ONLY (revoked from everyone else), so a leaked anon key
-- cannot read another user's notes through it.
CREATE OR REPLACE FUNCTION search_notes_semantic_for_user(
  p_user_id uuid,
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid, title text, content text, vault_path text,
  vault_domain text, context text, similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT n.id, n.title, n.content, n.vault_path, n.vault_domain, n.context,
         1 - (n.embedding <=> query_embedding) AS similarity
  FROM notes n
  WHERE n.embedding IS NOT NULL
    AND n.user_id = p_user_id
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION search_notes_semantic_for_user(uuid, vector, float, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_notes_semantic_for_user(uuid, vector, float, int) TO service_role;
