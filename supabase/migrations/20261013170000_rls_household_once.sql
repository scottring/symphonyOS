-- RLS: decide "shared with my household" once per query, not once per row.
--
-- Measured on prod 2026-10-13, signed in as the household owner:
--   select * from tasks   167 ms with RLS (98 planning + 69 executing), 5 ms without
--   notes for one user    172 ms with RLS (40 + 132),                   2.4 ms without
-- Each shared row called users_share_household(auth.uid(), user_id): a
-- SECURITY DEFINER function with its own search_path, so it is never inlined
-- and every call pays a security-context switch.
--
-- Same meaning, evaluated once: users_share_household(a, b) is
--   a = b OR (a and b are active members of one household)
-- = "b is in {a} ∪ {active co-members of a}", which my_household_user_ids()
-- returns for a = auth.uid(). Signed out, auth.uid() is null: the set is
-- {null}, `user_id IN ({null})` is null, the row is denied, as before.
--
-- Tested 2026-10-13 in rolled-back transactions on prod: visible row counts
-- and id hashes identical before/after for the owner, the other member and a
-- non-member across all 9 tables; tasks 69 -> 3.7 ms, notes 132 -> 1.6 ms.

create or replace function public.my_household_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid()
  union
  select hm_b.user_id
  from household_members hm_a
  join household_members hm_b on hm_b.household_id = hm_a.household_id
  where hm_a.user_id = auth.uid()
    and hm_a.status = 'active'
    and hm_b.status = 'active'
$$;
-- Every role that the policies apply to must be able to run it, anon included:
-- signed out, it returns only {null}, so those queries get no rows, as before
-- (applied as a follow-up, rls_household_once_anon, after a signed-out query
-- returned "permission denied" instead of no rows).
revoke all on function public.my_household_user_ids() from public;
grant execute on function public.my_household_user_ids() to anon, authenticated, service_role;

-- tasks, notes, goals, contacts, routines, projects: own, or couple/compound from my household
alter policy "Users can view tasks" on public.tasks using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can update tasks" on public.tasks using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids())))) with check (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can delete tasks" on public.tasks using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can view notes" on public.notes using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can update notes" on public.notes using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids())))) with check (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can delete notes" on public.notes using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can read household goals" on public.goals using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can update household goals" on public.goals using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids())))) with check (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can view contacts" on public.contacts using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can update contacts" on public.contacts using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids())))) with check (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can delete contacts" on public.contacts using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can view routines" on public.routines using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can update routines" on public.routines using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids())))) with check (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can delete routines" on public.routines using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can view projects" on public.projects using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can update projects" on public.projects using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids())))) with check (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
alter policy "Users can delete projects" on public.projects using (((select auth.uid()) = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));

-- family_members: own, or anyone in my household
alter policy "Users can view household family members" on public.family_members using (((select auth.uid()) = user_id) or (user_id in (select public.my_household_user_ids())));
alter policy "Users can update household family members" on public.family_members using (((select auth.uid()) = user_id) or (user_id in (select public.my_household_user_ids())));
alter policy "Users can delete household family members" on public.family_members using (((select auth.uid()) = user_id) or (user_id in (select public.my_household_user_ids())));

-- actionable_instances: own, or my household's calendar events / shared routines
alter policy "Users can view instances" on public.actionable_instances using (((select auth.uid()) = user_id) or ((user_id in (select public.my_household_user_ids())) and ((entity_type = 'calendar_event'::text) or ((entity_type = 'routine'::text) and (exists (select 1 from routines r where (((r.id)::text = actionable_instances.entity_id) and (r.scope = any (array['couple'::text, 'compound'::text])))))))));
alter policy "Users can update instances" on public.actionable_instances using (((select auth.uid()) = user_id) or ((user_id in (select public.my_household_user_ids())) and ((entity_type = 'calendar_event'::text) or ((entity_type = 'routine'::text) and (exists (select 1 from routines r where (((r.id)::text = actionable_instances.entity_id) and (r.scope = any (array['couple'::text, 'compound'::text])))))))));
alter policy "Users can delete instances" on public.actionable_instances using (((select auth.uid()) = user_id) or ((user_id in (select public.my_household_user_ids())) and ((entity_type = 'calendar_event'::text) or ((entity_type = 'routine'::text) and (exists (select 1 from routines r where (((r.id)::text = actionable_instances.entity_id) and (r.scope = any (array['couple'::text, 'compound'::text])))))))));

-- chat_sessions: a couple/compound session from my household
alter policy "chat_sessions_household_read" on public.chat_sessions using (((scope = any (array['couple'::text, 'compound'::text])) and (user_id in (select public.my_household_user_ids()))));
