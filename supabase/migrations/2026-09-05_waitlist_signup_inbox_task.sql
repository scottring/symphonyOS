-- A founding-household signup becomes an inbox task for every app admin.
--
-- The landing page writes one row to `waitlist` (anon INSERT, see
-- 019_waitlist.sql + 2026-09-04_app_admins_waitlist_rls.sql). Nobody was told:
-- waitlist-signup-notify needs Resend and a webhook, and neither was ever set
-- up. This trigger puts the signup where Scott already looks — his Symphony
-- inbox — with the email on the row and a link to the admin list.
--
-- SECURITY DEFINER because the inserting role is `anon`, which has no INSERT
-- on tasks; the function is owned by postgres (bypassrls). Admins come from
-- app_admins, never a hardcoded user id. `context = 'work'` + `scope =
-- 'individual'` mirrors scopeForDomain('work') in src/lib/scope.ts: private
-- to the admin, not shared with the household.

create or replace function public.waitlist_signup_to_inbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tasks (user_id, title, notes, email, links, context, scope, bucket, category)
  select
    a.user_id,
    'Founding household: ' || new.email,
    'Signed up on the landing page '
      || to_char(coalesce(new.created_at, now()) at time zone 'America/New_York', 'Mon FMDD, FMHH12:MI AM')
      || ' ET. Write back within a day to set up their household together.'
      || E'\n\nSource: ' || coalesce(new.source, 'landing_page'),
    new.email,
    jsonb_build_array(jsonb_build_object('url', 'https://app.symphony-os.com/settings', 'title', 'Waitlist admin')),
    'work',
    'individual',
    'inbox',
    'task'
  from public.app_admins a;
  return new;
end;
$$;

drop trigger if exists waitlist_signup_to_inbox on public.waitlist;
create trigger waitlist_signup_to_inbox
  after insert on public.waitlist
  for each row execute function public.waitlist_signup_to_inbox();
