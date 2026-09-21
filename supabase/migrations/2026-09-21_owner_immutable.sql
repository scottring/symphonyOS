-- The owner of a shared row is immutable for signed-in writers.
--
-- Every shared table (tasks, routines, notes, projects, contacts, goals) gates
-- UPDATE with the same predicate: "you own it, or it is shared and we share a
-- household". The policy had no WITH CHECK, so Postgres applied USING to the
-- new row as well — which is not a gap by itself. The gap is that the predicate
-- only ever sees the NEW row: a household member could set user_id to
-- themselves and scope to 'individual' in one write, and the new row passed as
-- "you own it". The row then vanished from the owner's view with no error and
-- no trace. Proved live 2026-09-19 and again 2026-09-21, and mirroring USING
-- into WITH CHECK was proved in the same run to change nothing
-- (supabase/tests/092_owner_immutable.test.sql).
--
-- A policy can never compare against the old row, so the fix is a trigger:
-- user_id may not change on a request that arrives through the API as `anon`
-- or `authenticated`. The boundary is the request ROLE, not auth.uid(): a NULL
-- uid only means "no signed-in user", it is not proof of a trusted operation.
-- Owner changes stay possible on exactly two paths — the service role, and a
-- direct database session with no request JWT at all (migrations, pg_cron,
-- the SQL editor). With the owner pinned, the existing predicate does the
-- rest — a non-owner's new row must still be shared, so nobody can make
-- someone else's item private. Assignment is the way to hand work over;
-- ownership is not a field the app ever writes on UPDATE.
--
-- The WITH CHECK is spelled out explicitly so the intent is visible in
-- pg_policies rather than implied by an omitted clause. Behaviour is identical.

create or replace function public.guard_owner_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- auth.role() is the request JWT's role: 'anon', 'authenticated',
  -- 'service_role', or NULL when there is no request JWT (a direct session).
  if new.user_id is distinct from old.user_id
     and coalesce(auth.role(), 'service_role') <> 'service_role' then
    raise exception 'user_id is immutable'
      using errcode = '42501',
            hint = 'Assign the item instead of changing its owner.';
  end if;
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'routines', 'notes', 'projects', 'contacts', 'goals'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_guard_owner', t);
    execute format(
      'create trigger %I before update of user_id on public.%I for each row execute function public.guard_owner_immutable()',
      t || '_guard_owner', t
    );
  end loop;
end
$$;

alter policy "Users can update tasks" on public.tasks
  with check (auth.uid() = user_id or (scope in ('couple', 'compound') and users_share_household(auth.uid(), user_id)));
alter policy "Users can update routines" on public.routines
  with check (auth.uid() = user_id or (scope in ('couple', 'compound') and users_share_household(auth.uid(), user_id)));
alter policy "Users can update notes" on public.notes
  with check (auth.uid() = user_id or (scope in ('couple', 'compound') and users_share_household(auth.uid(), user_id)));
alter policy "Users can update projects" on public.projects
  with check (auth.uid() = user_id or (scope in ('couple', 'compound') and users_share_household(auth.uid(), user_id)));
alter policy "Users can update contacts" on public.contacts
  with check (auth.uid() = user_id or (scope in ('couple', 'compound') and users_share_household(auth.uid(), user_id)));
alter policy "Users can update household goals" on public.goals
  with check (auth.uid() = user_id or (scope in ('couple', 'compound') and users_share_household(auth.uid(), user_id)));
