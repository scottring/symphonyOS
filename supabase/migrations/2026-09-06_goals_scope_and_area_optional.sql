-- Goals join the scope axis (tasks/routines/notes have had it since 2026-06-07).
-- A year page written by one partner was invisible to the other: goals were
-- owner-only. Also: an area is optional — a first year page should not have to
-- invent a "General" area to land.
alter table public.goals add column if not exists scope text
  check (scope in ('individual','couple','compound')) not null default 'individual';
alter table public.goals alter column area_id drop not null;
update public.goals set scope = 'compound' where context = 'family' and scope = 'individual';
create index if not exists idx_goals_scope on public.goals(user_id, scope) where scope <> 'individual';

drop policy if exists "Users can read their own goals" on public.goals;
create policy "Users can read household goals" on public.goals for select
  using (auth.uid() = user_id or (scope in ('couple','compound') and users_share_household(auth.uid(), user_id)));
drop policy if exists "Users can update their own goals" on public.goals;
create policy "Users can update household goals" on public.goals for update
  using (auth.uid() = user_id or (scope in ('couple','compound') and users_share_household(auth.uid(), user_id)));
-- insert/delete stay owner-only.
notify pgrst, 'reload schema';
