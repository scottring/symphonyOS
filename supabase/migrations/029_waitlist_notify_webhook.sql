-- Enable the pg_net extension for HTTP requests from PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to call the Edge Function on waitlist insert
CREATE OR REPLACE FUNCTION notify_waitlist_signup()
RETURNS TRIGGER AS $$
DECLARE
  payload jsonb;
  edge_function_url text;
  service_role_key text;
BEGIN
  -- Build payload matching Supabase webhook format
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'waitlist',
    'record', jsonb_build_object(
      'id', NEW.id,
      'email', NEW.email,
      'created_at', NEW.created_at,
      'source', NEW.source,
      'status', NEW.status
    )
  );

  -- Get the Edge Function URL from Supabase project URL
  -- This uses the project's URL pattern: https://<project-ref>.supabase.co/functions/v1/<function-name>
  edge_function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/waitlist-signup-notify';

  -- If app.settings.supabase_url is not set, construct from project ref
  IF edge_function_url IS NULL OR edge_function_url = '/functions/v1/waitlist-signup-notify' THEN
    edge_function_url := 'https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/waitlist-signup-notify';
  END IF;

  -- Get the service role key for authenticating the request
  service_role_key := current_setting('app.settings.service_role_key', true);

  -- Make async HTTP request to Edge Function using pg_net
  -- This is fire-and-forget so it won't slow down the insert
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(service_role_key, current_setting('request.jwt.claim.role', true))
    ),
    body := payload
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on waitlist table
DROP TRIGGER IF EXISTS on_waitlist_signup ON waitlist;
CREATE TRIGGER on_waitlist_signup
  AFTER INSERT ON waitlist
  FOR EACH ROW
  EXECUTE FUNCTION notify_waitlist_signup();

-- Add comment for documentation
COMMENT ON FUNCTION notify_waitlist_signup() IS 'Sends notification email via Edge Function when someone joins the waitlist';
