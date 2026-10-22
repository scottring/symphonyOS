-- Goal log (spec 2026-10-22-choice-log-design.md): calls, visits and other
-- events on a goal or on one of its choice options. Visibility follows the
-- goal exactly as Choices do (choice_goal_visible, 20261022120000_choices.sql).
begin;

create table public.goal_log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_task_id uuid references public.tasks(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete cascade,
  choice_option_id uuid references public.choice_options(id) on delete cascade,
  kind text not null check (kind in ('call','visit','message','meeting','note')),
  happened_on date not null,
  happened_at_time time,
  summary text not null check (length(btrim(summary)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(goal_task_id, goal_id) = 1)
);
create index goal_log_entries_goal_task_idx on public.goal_log_entries(goal_task_id);
create index goal_log_entries_goal_idx on public.goal_log_entries(goal_id);
create index goal_log_entries_option_idx on public.goal_log_entries(choice_option_id);

-- A follow-up task can be a logged event kind (a planned call or visit).
alter table public.tasks add column if not exists log_kind text
  check (log_kind is null or log_kind in ('call','visit','message','meeting','note'));

-- goal_task_id must name a goal, not an ordinary task.
create trigger goal_log_entries_goal_task_is_goal before insert or update of goal_task_id on public.goal_log_entries
  for each row execute function public.choices_goal_task_is_goal();

-- An entry about an option sits on that option's own goal. Security invoker:
-- the option is read under the caller's RLS, so an unreadable option fails.
create function public.goal_log_option_matches_goal() returns trigger language plpgsql set search_path = public as $$
begin
  if new.choice_option_id is not null and not exists (
    select 1 from choice_options o join choices c on c.id = o.choice_id
    where o.id = new.choice_option_id
      and c.goal_task_id is not distinct from new.goal_task_id
      and c.goal_id is not distinct from new.goal_id
  ) then
    raise exception 'A log entry about an option belongs to that option''s goal' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger goal_log_entries_option_matches_goal before insert or update of choice_option_id, goal_task_id, goal_id on public.goal_log_entries
  for each row execute function public.goal_log_option_matches_goal();

create trigger update_goal_log_entries_updated_at before update on public.goal_log_entries
  for each row execute function update_updated_at_column();
create trigger goal_log_entries_guard_parent before update of goal_task_id, goal_id, choice_option_id on public.goal_log_entries
  for each row execute function public.guard_parent_immutable('goal_task_id', 'goal_id', 'choice_option_id');
create trigger goal_log_entries_guard_owner before update of user_id on public.goal_log_entries
  for each row execute function public.guard_owner_immutable();

alter table public.goal_log_entries enable row level security;
create policy goal_log_read on public.goal_log_entries for select using (public.choice_goal_visible(goal_task_id, goal_id));
create policy goal_log_insert on public.goal_log_entries for insert with check (user_id = (select auth.uid()) and public.choice_goal_visible(goal_task_id, goal_id));
create policy goal_log_update on public.goal_log_entries for update using (public.choice_goal_visible(goal_task_id, goal_id)) with check (public.choice_goal_visible(goal_task_id, goal_id));
create policy goal_log_delete on public.goal_log_entries for delete using (public.choice_goal_visible(goal_task_id, goal_id));
grant select, insert, update, delete on public.goal_log_entries to authenticated;

-- Undo journal, as for the Choices tables.
do $$declare t text;begin
 foreach t in array array['goal_log_entries'] loop
   execute format('create trigger reviewed_change_before before insert or update or delete on public.%I for each row execute function public.journal_reviewed_change()',t);
   execute format('create trigger zz_reviewed_change_after after insert or update or delete on public.%I for each row execute function public.journal_reviewed_change()',t);
 end loop;
end;$$;

commit;
