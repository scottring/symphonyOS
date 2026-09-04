-- APP ADMINS + WAITLIST LOCKDOWN
--
-- Found during the 2026-09-04 launch rehearsal: `waitlist` granted SELECT,
-- UPDATE and DELETE to the `authenticated` role with `USING (true)`. Every
-- signed-up user could read every waitlist email address — and delete the
-- table's contents. Hiding the Admin tab in the client would not have fixed
-- it; the rows were reachable from any browser console with a session.
--
-- There was no admin concept at all, so this adds the smallest one that can
-- carry the policy: a membership table plus a SECURITY DEFINER predicate.
-- `app_admins` is deliberately NOT self-serve — rows are inserted by a
-- migration or the service role, never by the client (no INSERT policy).

create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

-- A user may read ONLY their own row. That is enough for the client to ask
-- "am I an admin?" without exposing the roster of admins to everyone.
drop policy if exists "Read own admin row" on public.app_admins;
create policy "Read own admin row"
  on public.app_admins for select to authenticated
  using (user_id = auth.uid());

-- SECURITY DEFINER so a policy on another table can consult app_admins
-- without that table's reader needing to be able to SELECT app_admins.
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid());
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

-- Seed by email so the migration is not tied to a hardcoded uuid.
insert into public.app_admins (user_id, note)
select id, 'founder — seeded by 2026-09-04 migration'
from auth.users
where email = 'smkaufman@gmail.com'
on conflict (user_id) do nothing;

-- ── waitlist ────────────────────────────────────────────────────────────────
-- The anonymous INSERT policy STAYS: the landing page signup form depends on
-- it, and insert-only is not a read hole. Everything else becomes admin-only.

drop policy if exists "Authenticated users can view waitlist"   on public.waitlist;
drop policy if exists "Authenticated users can update waitlist" on public.waitlist;
drop policy if exists "Authenticated users can delete waitlist" on public.waitlist;

create policy "Admins can view waitlist"
  on public.waitlist for select to authenticated
  using (public.is_app_admin());

create policy "Admins can update waitlist"
  on public.waitlist for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

create policy "Admins can delete waitlist"
  on public.waitlist for delete to authenticated
  using (public.is_app_admin());
