-- Signups: the live check_allowed_signup() trigger allow-listed six emails and
-- two patterns. A founding household that signed up on the landing page could
-- not create an account. Now: the allowlist OR an approved waitlist row.
alter table public.waitlist add column if not exists approved_at timestamptz;
create index if not exists idx_waitlist_email_lower on public.waitlist (lower(email));

create or replace function public.check_allowed_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  allowed_emails text[] := array['scottring@hotmail.com','smkaufman@gmail.com','irisleviner@gmail.com','tim.rappold@gmail.com','stephanie.nothelle@gmail.com','meganhryan@gmail.com'];
  allowed_patterns text[] := array['smkaufman+%@gmail.com','symphony%@gmail.com'];
  email_val text := lower(new.email);
  pattern text;
begin
  if email_val = any(allowed_emails) then return new; end if;
  foreach pattern in array allowed_patterns loop
    if email_val like pattern then return new; end if;
  end loop;
  if exists (select 1 from public.waitlist w where lower(w.email) = email_val and w.approved_at is not null) then
    return new;
  end if;
  raise exception 'Signups are currently restricted. Contact the administrator.';
end $$;
-- The trigger check_signup_allowed on auth.users already calls this function; no re-create needed.
notify pgrst, 'reload schema';
