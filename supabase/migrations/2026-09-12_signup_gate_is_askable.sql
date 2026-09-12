-- The invite gate could only ever say "no" by throwing. GoTrue turns any
-- exception raised inside an auth.users trigger into a generic
-- `500 unexpected_failure`, which every client renders as
-- "Database error saving new user" — so a friend who simply wasn't invited yet
-- was told the product was broken. (Josh Glazer, 2026-09-11.)
--
-- Split the rule out of the trigger into a function the clients can ASK before
-- they try, so the UI can say "Symphony is invite-only right now" and point at
-- the waitlist. The trigger keeps enforcing it — the answer is advisory, the
-- trigger is the wall — and the rule now lives in exactly one place instead of
-- being duplicated between the wall and the question.
--
-- This exposes no new information: anyone could already learn whether an email
-- is allowed by simply attempting a sign-up. It just makes the answer legible.

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
  return exists (
    select 1 from public.waitlist w
    where lower(w.email) = email_val and w.approved_at is not null
  );
end $$;

comment on function public.signup_allowed(text) is
  'Single source of truth for the invite gate. Called by the check_signup_allowed trigger on auth.users to enforce it, and by the web and iOS sign-up forms to explain it before attempting a sign-up.';

-- The wall now delegates to the rule rather than restating it.
create or replace function public.check_allowed_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.signup_allowed(new.email) then
    return new;
  end if;
  raise exception 'Signups are currently restricted. Contact the administrator.';
end $$;

-- The sign-up form has to be able to ask before anyone has an account.
revoke all on function public.signup_allowed(text) from public;
grant execute on function public.signup_allowed(text) to anon, authenticated;

notify pgrst, 'reload schema';
