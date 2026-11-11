-- School feed guard (Scott, 2026-11-11). On 2026-11-08 the school feeds
-- worker stopped and nobody knew for three days. Three additions:
--   1. connector_health learns when the worker was last alive (heartbeat_at)
--      and when it last ran the 5pm flush (last_flush_at); a server-side
--      check emails the household when either goes stale or a feed errors.
--   2. A WhatsApp pairing code (pair_qr) the app can show in Settings, in
--      place of a QR in the Fly logs.
--   3. connector_alerts remembers what was last emailed, so a problem is
--      mailed once (again after a day) and its end is mailed once.

alter table connector_health add column if not exists heartbeat_at timestamptz;
alter table connector_health add column if not exists last_flush_at timestamptz;
alter table connector_health add column if not exists pair_qr text;
alter table connector_health add column if not exists pair_qr_at timestamptz;

create table if not exists connector_alerts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  alert_key text,
  alerted_at timestamptz
);
alter table connector_alerts enable row level security;
drop policy if exists connector_alerts_owner on connector_alerts;
create policy connector_alerts_owner on connector_alerts
  for select using (auth.uid() = user_id);

create extension if not exists pg_net with schema extensions;

create or replace function school_feed_check()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  service_role_key text;
begin
  -- The key lives in Vault (managed Postgres denies custom GUCs); the GUC is
  -- only a local-stack fallback. Same as supernote_poll.
  begin
    select decrypted_secret into service_role_key
    from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  exception when others then
    service_role_key := null;
  end;
  if service_role_key is null then
    service_role_key := current_setting('app.settings.service_role_key', true);
  end if;
  if service_role_key is null then
    raise notice 'school_feed_check: no service key in vault or settings; skipping';
    return;
  end if;

  perform net.http_post(
    url := 'https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/school-feed-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function school_feed_check() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('school-feed-check')
  where exists (select 1 from cron.job where jobname = 'school-feed-check');
exception when others then null;
end;
$$;

do $$
begin
  -- Every 15 minutes; the function itself keeps quiet hours.
  perform cron.schedule('school-feed-check', '*/15 * * * *', 'select school_feed_check();');
exception when others then
  raise notice 'pg_cron not available; school-feed-check not scheduled.';
end;
$$;
