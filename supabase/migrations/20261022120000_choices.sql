-- Choices (spec 2026-10-22-choices-design.md). Visibility follows the goal:
-- a choice is reachable exactly when its goal (an is_goal task, or a goals
-- row) is reachable under that table's own RLS. No scope column to drift.
create table public.choices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_task_id uuid references public.tasks(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  status text not null default 'open' check (status in ('open','decided')),
  chosen_option_id uuid,
  decided_at timestamptz, decided_note text, decided_work text[] not null default '{}', decided_amount_cents bigint,
  columns jsonb not null default '[]', work jsonb not null default '[]', selected_work text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((goal_task_id is null) <> (goal_id is null))
);
create table public.choice_options (
  id uuid primary key default gen_random_uuid(),
  choice_id uuid not null references public.choices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'considering' check (status in ('considering','contacted','heard_back','ruled_out','chosen')),
  status_changed_at timestamptz not null default now(),
  values jsonb not null default '{}', notes text, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.choices add constraint choices_chosen_option_fk
  foreign key (chosen_option_id) references public.choice_options(id) on delete set null;
create table public.choice_price_lines (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.choice_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  work_ids text[] not null default '{}', amount_cents bigint not null check (amount_cents >= 0),
  note text, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index choices_goal_task_idx on public.choices(goal_task_id) where goal_task_id is not null;
create index choices_goal_idx on public.choices(goal_id) where goal_id is not null;
create index choice_options_choice_idx on public.choice_options(choice_id);
create index choice_price_lines_option_idx on public.choice_price_lines(option_id);

-- goal_task_id must name a goal, not an ordinary task.
create function public.choices_goal_task_is_goal() returns trigger language plpgsql set search_path = public as $$
begin
  if new.goal_task_id is not null and not exists (select 1 from tasks where id = new.goal_task_id and is_goal) then
    raise exception 'A choice belongs to a goal' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger choices_goal_task_is_goal before insert or update of goal_task_id on public.choices
  for each row execute function public.choices_goal_task_is_goal();

create trigger update_choices_updated_at before update on public.choices for each row execute function update_updated_at_column();
create trigger update_choice_options_updated_at before update on public.choice_options for each row execute function update_updated_at_column();
create trigger update_choice_price_lines_updated_at before update on public.choice_price_lines for each row execute function update_updated_at_column();

-- Visibility follows the parent pointer, so a signed-in writer may not move a
-- row: a member could otherwise re-point an owner's Family choice at their own
-- private goal and it would vanish from the owner (the gap
-- 2026-09-21_owner_immutable.sql closed for user_id). Same boundary as that
-- guard: the request role, not auth.uid(). The service role and direct
-- sessions (migrations, SQL editor) can still re-parent. Owners are pinned
-- with the existing guard_owner_immutable().
create function public.guard_parent_immutable() returns trigger language plpgsql set search_path = '' as $$
declare c text;
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' then
    foreach c in array tg_argv loop
      if to_jsonb(new) -> c is distinct from to_jsonb(old) -> c then
        raise exception '% is immutable', c using errcode = '42501', hint = 'Add it again where it belongs instead of moving it.';
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger choices_guard_parent before update of goal_task_id, goal_id on public.choices
  for each row execute function public.guard_parent_immutable('goal_task_id', 'goal_id');
create trigger choice_options_guard_parent before update of choice_id on public.choice_options
  for each row execute function public.guard_parent_immutable('choice_id');
create trigger choice_price_lines_guard_parent before update of option_id on public.choice_price_lines
  for each row execute function public.guard_parent_immutable('option_id');
create trigger choices_guard_owner before update of user_id on public.choices for each row execute function public.guard_owner_immutable();
create trigger choice_options_guard_owner before update of user_id on public.choice_options for each row execute function public.guard_owner_immutable();
create trigger choice_price_lines_guard_owner before update of user_id on public.choice_price_lines for each row execute function public.guard_owner_immutable();

-- Visibility: these subqueries run under the caller's RLS on tasks/goals/choices.
create function public.choice_goal_visible(p_goal_task_id uuid, p_goal_id uuid) returns boolean
language sql stable security invoker set search_path = public as $$
  select case when p_goal_task_id is not null then exists (select 1 from tasks t where t.id = p_goal_task_id)
              else exists (select 1 from goals g where g.id = p_goal_id) end
$$;
alter table public.choices enable row level security;
alter table public.choice_options enable row level security;
alter table public.choice_price_lines enable row level security;
create policy choices_read on public.choices for select using (public.choice_goal_visible(goal_task_id, goal_id));
create policy choices_insert on public.choices for insert with check (user_id = (select auth.uid()) and public.choice_goal_visible(goal_task_id, goal_id));
create policy choices_update on public.choices for update using (public.choice_goal_visible(goal_task_id, goal_id)) with check (public.choice_goal_visible(goal_task_id, goal_id));
create policy choices_delete on public.choices for delete using (public.choice_goal_visible(goal_task_id, goal_id));
create policy choice_options_read on public.choice_options for select using (exists (select 1 from choices c where c.id = choice_id));
create policy choice_options_insert on public.choice_options for insert with check (user_id = (select auth.uid()) and exists (select 1 from choices c where c.id = choice_id));
create policy choice_options_update on public.choice_options for update using (exists (select 1 from choices c where c.id = choice_id)) with check (exists (select 1 from choices c where c.id = choice_id));
create policy choice_options_delete on public.choice_options for delete using (exists (select 1 from choices c where c.id = choice_id));
create policy choice_price_lines_read on public.choice_price_lines for select using (exists (select 1 from choice_options o where o.id = option_id));
create policy choice_price_lines_insert on public.choice_price_lines for insert with check (user_id = (select auth.uid()) and exists (select 1 from choice_options o where o.id = option_id));
create policy choice_price_lines_update on public.choice_price_lines for update using (exists (select 1 from choice_options o where o.id = option_id)) with check (exists (select 1 from choice_options o where o.id = option_id));
create policy choice_price_lines_delete on public.choice_price_lines for delete using (exists (select 1 from choice_options o where o.id = option_id));
grant select, insert, update, delete on public.choices, public.choice_options, public.choice_price_lines to authenticated;

-- A follow-up task names its option.
alter table public.tasks add column if not exists choice_option_id uuid references public.choice_options(id) on delete set null;
create index if not exists tasks_choice_option_idx on public.tasks(choice_option_id) where choice_option_id is not null;

-- Quotes attach to an option; they are visible wherever the option is.
alter table public.attachments drop constraint if exists attachments_entity_type_check;
alter table public.attachments add constraint attachments_entity_type_check
  check (entity_type in ('task','project','event_note','instance_note','note','routine','document','choice_option'));

-- Live definition read from production 2026-10-22 (permissive, for select, no
-- role clause), recreated with one more branch: an option's attachments are
-- visible wherever the option is. Re-read the live text before applying; if it
-- changed, merge the choice_option branch into the newer text. The restrictive
-- attachments policies are untouched.
drop policy if exists "Users can view reachable attachments" on public.attachments;
create policy "Users can view reachable attachments" on public.attachments for select using (
  (auth.uid() = user_id)
  or ((entity_type = 'task'::text) and (exists (select 1 from tasks t where (((t.id)::text = attachments.entity_id) and (t.scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), t.user_id)))))
  or ((entity_type = 'project'::text) and (exists (select 1 from projects p where (((p.id)::text = attachments.entity_id) and (p.scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), p.user_id)))))
  or ((entity_type = 'note'::text) and (exists (select 1 from notes n where (((n.id)::text = attachments.entity_id) and (n.scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), n.user_id)))))
  or ((entity_type = 'routine'::text) and (exists (select 1 from routines r where (((r.id)::text = attachments.entity_id) and (r.scope = any (array['couple'::text, 'compound'::text])) and users_share_household(auth.uid(), r.user_id)))))
  or (entity_type = 'choice_option' and exists (select 1 from public.choice_options o where o.id::text = attachments.entity_id))
);

-- Undo journal: the reviewed-change triggers (20261016100000_reviewed_change_recovery.sql).
-- contacts too: chat's option_add makes a contact for a phone, and the card's
-- Undo must take it back. The journal acts only on writes carrying the
-- x-symphony-command header, so ordinary contact writes are unaffected.
do $$declare t text;begin
 foreach t in array array['choices','choice_options','choice_price_lines','contacts'] loop
   execute format('create trigger reviewed_change_before before insert or update or delete on public.%I for each row execute function public.journal_reviewed_change()',t);
   execute format('create trigger zz_reviewed_change_after after insert or update or delete on public.%I for each row execute function public.journal_reviewed_change()',t);
 end loop;
end;$$;
