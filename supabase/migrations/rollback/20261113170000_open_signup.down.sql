-- Rollback for 20261113170000_open_signup.sql. Restores the invite gate from
-- 20261015130000_signup_allowed_invited.sql verbatim.

create or replace function public.signup_allowed(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  allowed_emails text[] := array['scottring@hotmail.com','smkaufman@gmail.com','irisleviner@gmail.com','tim.rappold@gmail.com','stephanie.nothelle@gmail.com','meganhryan@gmail.com'];
  allowed_patterns text[] := array['smkaufman+%@gmail.com','symphony%@gmail.com'];
  email_val text := lower(trim(coalesce(p_email, '')));
  pattern text;
begin
  if email_val = '' then return false; end if;
  if email_val = any(allowed_emails) then return true; end if;
  foreach pattern in array allowed_patterns loop
    if email_val like pattern then return true; end if;
  end loop;
  if exists (
    select 1 from public.household_invitations i
    where lower(i.email) = email_val and i.accepted_at is null and i.expires_at > now()
  ) then return true; end if;
  return exists (
    select 1 from public.waitlist w
    where lower(w.email) = email_val and w.approved_at is not null
  );
end $$;
