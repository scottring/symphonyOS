-- Rollback of 20261013170000_rls_household_once.sql: the policies as they were
-- (users_share_household per row), then drop the helper.

-- tasks, notes, goals, contacts, routines, projects: own, or couple/compound from my household
alter policy "Users can view tasks" on public.tasks using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can update tasks" on public.tasks using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id))) with check ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can delete tasks" on public.tasks using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can view notes" on public.notes using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can update notes" on public.notes using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id))) with check ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can delete notes" on public.notes using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can read household goals" on public.goals using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can update household goals" on public.goals using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id))) with check ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can view contacts" on public.contacts using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can update contacts" on public.contacts using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id))) with check ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can delete contacts" on public.contacts using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can view routines" on public.routines using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can update routines" on public.routines using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id))) with check ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can delete routines" on public.routines using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can view projects" on public.projects using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can update projects" on public.projects using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id))) with check ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));
alter policy "Users can delete projects" on public.projects using ((auth.uid() = user_id) or ((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));

-- family_members: own, or anyone in my household
alter policy "Users can view household family members" on public.family_members using ((auth.uid() = user_id) or users_share_household(auth.uid(), user_id));
alter policy "Users can update household family members" on public.family_members using ((auth.uid() = user_id) or users_share_household(auth.uid(), user_id));
alter policy "Users can delete household family members" on public.family_members using ((auth.uid() = user_id) or users_share_household(auth.uid(), user_id));

-- actionable_instances: own, or my household's calendar events / shared routines
alter policy "Users can view instances" on public.actionable_instances using ((auth.uid() = user_id) or (users_share_household(auth.uid(), user_id) and ((entity_type = 'calendar_event'::text) or ((entity_type = 'routine'::text) and (exists (select 1 from routines r where (((r.id)::text = actionable_instances.entity_id) and (r.scope = any (array['couple'::text, 'compound'::text])))))))));
alter policy "Users can update instances" on public.actionable_instances using ((auth.uid() = user_id) or (users_share_household(auth.uid(), user_id) and ((entity_type = 'calendar_event'::text) or ((entity_type = 'routine'::text) and (exists (select 1 from routines r where (((r.id)::text = actionable_instances.entity_id) and (r.scope = any (array['couple'::text, 'compound'::text])))))))));
alter policy "Users can delete instances" on public.actionable_instances using ((auth.uid() = user_id) or (users_share_household(auth.uid(), user_id) and ((entity_type = 'calendar_event'::text) or ((entity_type = 'routine'::text) and (exists (select 1 from routines r where (((r.id)::text = actionable_instances.entity_id) and (r.scope = any (array['couple'::text, 'compound'::text])))))))));

-- chat_sessions: a couple/compound session from my household
alter policy "chat_sessions_household_read" on public.chat_sessions using (((scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), user_id)));

drop function if exists public.my_household_user_ids();
