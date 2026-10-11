-- Reset a test account from inside the app (Scott, 2026-10-11: "make it so
-- it's easier for me to do this without coming to the terminal first").
--
-- Only accounts listed in test_accounts can reset, and a reset only ever
-- touches the caller's own rows (auth.uid()). It clears what was planned and
-- written — tasks, goals, routines, lists, notes, meals, conversations — and
-- keeps who the account is: family members, the household and its members,
-- the profile, calendar connections and their cached events, devices.
-- Another member's own rows are never deleted for referencing this
-- account's; they are detached instead. Rows that only exist on this
-- account's items (a pick or plan entry for its task, an item on its list)
-- go with them.

create table if not exists public.test_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

alter table public.test_accounts enable row level security;

-- A user may see only whether THEY are a test account; nobody writes from the app.
drop policy if exists test_accounts_select_own on public.test_accounts;
create policy test_accounts_select_own on public.test_accounts
  for select to authenticated using (user_id = auth.uid());

insert into public.test_accounts (user_id, note)
select id, 'seeded 2026-10-11' from auth.users
where email in (
  'symphonygoals@gmail.com',
  'symphonyedith@gmail.com',
  'symphonytest4444@gmail.com',
  'symphonygoals+onboarding1008@gmail.com'
)
on conflict (user_id) do nothing;

create or replace function public.reset_test_account()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  u uuid := auth.uid();
  n integer;
  total integer := 0;
  t record;
begin
  if u is null or not exists (select 1 from public.test_accounts where user_id = u) then
    raise exception 'Only a test account can be reset' using errcode = '42501';
  end if;

  -- Another member's rows that hang off this account's keep their own
  -- content: their subtasks and child routines come loose, and their meal
  -- plan entries keep the recipe's name as plain text.
  update tasks set parent_task_id = null
    where user_id <> u and parent_task_id in (select id from tasks where user_id = u);
  update routines set parent_routine_id = null
    where user_id <> u and parent_routine_id in (select id from routines where user_id = u);
  update meal_plan_entries e set ad_hoc_title = coalesce(e.ad_hoc_title, r.title), recipe_id = null
    from recipes r
    where e.recipe_id = r.id and r.user_id = u
      and e.meal_plan_id not in (select id from meal_plans where user_id = u);

  -- Rows hanging off this account's tasks, routines and meal plans first.
  delete from task_commitments where task_id in (select id from tasks where user_id = u);
  get diagnostics n = row_count; total := total + n;
  delete from meal_plan_entries where meal_plan_id in (select id from meal_plans where user_id = u);
  get diagnostics n = row_count; total := total + n;
  delete from planning_sessions where author_id = u;
  get diagnostics n = row_count; total := total + n;
  update tasks set parent_task_id = null where user_id = u and parent_task_id is not null;
  update routines set parent_routine_id = null where user_id = u and parent_routine_id is not null;

  -- Then the account's own content, children before parents.
  for t in select unnest(array[
    'task_focus', 'actionable_instances', 'instance_notes', 'subroutine_instances',
    'proactive_suggestions', 'attachments', 'pinned_items', 'event_notes',
    'event_discussion_flags', 'hidden_calendar_events', 'chat_session_reads', 'chat_sessions',
    'conversation_messages', 'conversations', 'evening_reflections', 'checkins', 'daily_briefs',
    'meal_chat_messages', 'meal_plans', 'list_items', 'lists', 'notes', 'note_topics',
    'captures', 'scratchpad_notes', 'notices', 'email_action_items', 'action_queue',
    'action_history', 'vault_inbox', 'screen_time_entries', 'screen_time_adjustments',
    'goal_milestones', 'tasks', 'recipes', 'contacts', 'subroutines', 'routines',
    'goals', 'goal_areas', 'projects', 'playbook_instances', 'playbook_blocks',
    'weekly_templates', 'packing_templates', 'planning_resources', 'responsibilities',
    'family_rules', 'kiosk_cards'
  ]) as name loop
    if to_regclass('public.' || t.name) is not null then
      execute format('delete from public.%I where user_id = $1', t.name) using u;
      get diagnostics n = row_count; total := total + n;
    end if;
  end loop;

  update user_profiles set guided_plan = null where user_id = u;
  return total;
end;
$$;

revoke all on function public.reset_test_account() from public, anon;
grant execute on function public.reset_test_account() to authenticated;
