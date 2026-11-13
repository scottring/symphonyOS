-- Signup opens to everyone (2026-11-13), for the free light edition.
--
-- signup_allowed(email) was an invite gate: named accounts, two address
-- patterns, a live household invitation or an approved waitlist row. It is now
-- true for any non-blank address. The check_signup_allowed trigger on
-- auth.users (function check_allowed_signup, which skips anonymous display
-- users) is left in place: it calls this function, so it now lets everyone
-- through. The web and iPhone sign-up forms pre-check signup_allowed, so they
-- need no change and older builds keep working.
-- Rollback: rollback/20261113170000_open_signup.down.sql restores the allowlist.

create or replace function public.signup_allowed(p_email text)
returns boolean language sql security definer set search_path = public as $$
  select length(trim(coalesce(p_email, ''))) > 0
$$;

comment on function public.signup_allowed(text) is
  'Open signup: true for any non-blank email. Called by the check_signup_allowed trigger on auth.users and by the sign-up forms.';
