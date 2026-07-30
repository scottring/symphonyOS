-- Morning warm for the proactive engine. The engine is client-claimed
-- (claim_engine_run, every 6h) — which means it goes cold when no Symphony
-- tab is open anywhere. This job runs once each morning server-side so
-- suggestions are warm BEFORE the first glance. It claims through the same
-- claim_engine_run gate, so it can never double-bill against a client run.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION proactive_engine_warm()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  u RECORD;
  service_role_key text;
BEGIN
  -- The key lives in Supabase Vault (managed Postgres denies ALTER DATABASE
  -- SET for custom GUCs — 42501 — so the 029-era current_setting pattern
  -- can't be provisioned; it remains only as a fallback for local stacks).
  BEGIN
    SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    service_role_key := NULL; -- vault absent (local stack) — try the GUC
  END;
  IF service_role_key IS NULL THEN
    service_role_key := current_setting('app.settings.service_role_key', true);
  END IF;
  IF service_role_key IS NULL THEN
    RAISE NOTICE 'proactive_engine_warm: no service key in vault or settings; skipping';
    RETURN;
  END IF;

  FOR u IN
    SELECT DISTINCT user_id FROM tasks
    WHERE completed = false AND updated_at > now() - interval '14 days'
  LOOP
    -- Same 6h gate the clients use — exactly one runner per interval per user.
    IF claim_engine_run('proactive-engine:' || u.user_id, 21600) THEN
      PERFORM net.http_post(
        url := 'https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/proactive-engine',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object('user_id', u.user_id),
        -- Engine runs take 15-60s (LLM pass); pg_net's 5s default records a
        -- misleading timeout row every morning even though the function
        -- completes fine after the disconnect. 90s covers the worst case so
        -- net._http_response actually shows the 200.
        timeout_milliseconds := 90000
      );
    END IF;
  END LOOP;
END;
$$;

-- SECURITY DEFINER functions in public default to EXECUTE TO PUBLIC, which
-- PostgREST exposes to the anon key — an unauthenticated caller could hit
-- this and trigger LLM-billed proactive-engine runs for every user with an
-- incomplete task. This function is invoked only by pg_cron (as its owner),
-- never by a client, so it needs no PostgREST-reachable grant at all.
REVOKE EXECUTE ON FUNCTION proactive_engine_warm() FROM PUBLIC, anon, authenticated;

-- 10:30 UTC = 6:30am US/Eastern in summer — before the first coffee glance,
-- after the quiet-hours window (lib/quietHours.ts ends at 6am local).
DO $$
BEGIN
  PERFORM cron.unschedule('proactive-engine-warm')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'proactive-engine-warm');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule('proactive-engine-warm', '30 10 * * *', 'SELECT proactive_engine_warm();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available; proactive-engine-warm not scheduled.';
END;
$$;
