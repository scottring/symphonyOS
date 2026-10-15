-- An invited adult may sign up (beta readiness B04, 2026-10-15).
--
-- The invite gate allowed named accounts, two address patterns and approved
-- waitlist rows. A partner invited to a household through Settings, whose
-- address was on none of those lists, was refused at sign-up and never reached
-- the join page. A live, unaccepted household invitation for the address now
-- admits it. The invitation itself still has to be accepted after sign-in
-- (accept_household_invitation), and expired or used invitations admit no one.

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

comment on function public.signup_allowed(text) is
  'Single source of truth for the invite gate: named accounts, two patterns, a live household invitation, or an approved waitlist row. Called by the check_signup_allowed trigger on auth.users and by the sign-up forms.';
