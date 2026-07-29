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
  service_role_key := current_setting('app.settings.service_role_key', true);
  IF service_role_key IS NULL THEN
    RAISE NOTICE 'proactive_engine_warm: app.settings.service_role_key not set; skipping';
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
        body := jsonb_build_object('user_id', u.user_id)
      );
    END IF;
  END LOOP;
END;
$$;

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
