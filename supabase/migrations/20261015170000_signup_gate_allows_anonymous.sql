-- A display's anonymous sign-in has no email; the invite gate refused it
-- ("Database error creating anonymous user", found on the first hosted
-- pairing attempt, 2026-10-15). An anonymous user is admitted by the gate;
-- it can do nothing until a pairing code makes it a display.
create or replace function public.check_allowed_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.is_anonymous, false) then return new; end if;
  if public.signup_allowed(new.email) then
    return new;
  end if;
  raise exception 'Signups are currently restricted. Contact the administrator.';
end $$;
