-- Supernote scratchpad ingest: the RLS gap the review sheet needs, plus the
-- poll job. RUN BY HAND in the Supabase SQL editor — migrations in this repo
-- are out of sync with the deployed database.

-- captures shipped with a SELECT policy only, so a client could see a staged
-- page but never clear it. Reviewing a page deletes its row (the image
-- survives as an attachment, the tasks and notes stand on their own).
DROP POLICY IF EXISTS captures_owner_delete ON captures;
CREATE POLICY captures_owner_delete ON captures
  FOR DELETE USING (auth.uid() = user_id);

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION supernote_poll()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  service_role_key text;
BEGIN
  -- Managed Postgres denies ALTER DATABASE SET for custom GUCs (42501), so the
  -- key lives in Vault; the GUC remains only as a local-stack fallback.
  BEGIN
    SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    service_role_key := NULL;
  END;
  IF service_role_key IS NULL THEN
    service_role_key := current_setting('app.settings.service_role_key', true);
  END IF;
  IF service_role_key IS NULL THEN
    RAISE NOTICE 'supernote_poll: no service key in vault or settings; skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/dropbox-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb,
    -- Up to 10 pages x one vision call each; pg_net's 5s default would record
    -- a misleading timeout on every run that actually had work to do.
    timeout_milliseconds := 300000
  );
END;
$$;

-- SECURITY DEFINER functions in public default to EXECUTE TO PUBLIC, which
-- PostgREST exposes to the anon key — an unauthenticated caller could then
-- trigger LLM-billed runs. pg_cron invokes this as its owner and needs no
-- PostgREST-reachable grant at all.
REVOKE EXECUTE ON FUNCTION supernote_poll() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('supernote-poll')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'supernote-poll');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule('supernote-poll', '*/15 * * * *', 'SELECT supernote_poll();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available; supernote-poll not scheduled.';
END;
$$;
