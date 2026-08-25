-- Raw captures are review material, not an archive. Thirty days after a
-- capture was extracted, the raw text goes; the candidates and the summary
-- note it produced are unaffected. Family chat transcripts should not
-- accumulate in the database indefinitely.

CREATE OR REPLACE FUNCTION purge_old_capture_text()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE captures
  SET raw_text = NULL
  WHERE raw_text IS NOT NULL
    AND status = 'extracted'
    AND created_at < now() - interval '30 days';
$$;

-- SECURITY DEFINER functions in public default to EXECUTE TO PUBLIC, which
-- PostgREST exposes to the anon key. This is called only by pg_cron.
REVOKE EXECUTE ON FUNCTION purge_old_capture_text() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('purge-old-capture-text')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-old-capture-text');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule('purge-old-capture-text', '0 4 * * *', 'SELECT purge_old_capture_text();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available; purge-old-capture-text not scheduled.';
END;
$$;
