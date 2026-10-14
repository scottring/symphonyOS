-- Math of the day (Scott, 2026-10-14): one problem per kid per day on the
-- kitchen wall. The wall builds the problem in code (src/lib/wall/math) and
-- inserts it the first time it loads that day; Claude's story is written onto
-- the row afterwards; each Check updates tries and status. Streaks and each
-- kid's level per type are read back from these rows.
--
-- Household-shared like the scratchpad (a kid's math lives on the family's
-- wall), using the once-per-query household check from
-- 20261013170000_rls_household_once. One row per kid per day (unique), so two
-- walls loading at once can't make two problems; the loser's insert is ignored.
-- The finger drawing is never stored.

create table if not exists public.kid_math_problems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id uuid not null references public.family_members(id) on delete cascade,
  for_date date not null,
  kind text not null check (kind in ('multiply', 'divide', 'fraction', 'addsub', 'word')),
  level smallint not null check (level between 1 and 5),
  -- The numbers (MathSpec). The answer is computed from them, never stored.
  problem jsonb not null,
  -- Claude's story, hint and answer-box names; null until written (or if never).
  wording jsonb,
  status text not null default 'open' check (status in ('open', 'solved', 'revealed')),
  tries smallint not null default 0 check (tries between 0 and 3),
  solved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, for_date)
);

create index if not exists kid_math_problems_user_date_idx
  on public.kid_math_problems (user_id, for_date desc);

alter table public.kid_math_problems enable row level security;

drop policy if exists "Household reads kid math" on public.kid_math_problems;
create policy "Household reads kid math" on public.kid_math_problems
  for select using (user_id in (select public.my_household_user_ids()));

drop policy if exists "Users add kid math" on public.kid_math_problems;
create policy "Users add kid math" on public.kid_math_problems
  for insert with check (
    (select auth.uid()) = user_id
    -- Only a kid this account can see (family_members' own RLS: the household).
    and exists (select 1 from public.family_members fm where fm.id = member_id)
  );

drop policy if exists "Household updates kid math" on public.kid_math_problems;
create policy "Household updates kid math" on public.kid_math_problems
  for update using (user_id in (select public.my_household_user_ids()))
  with check (user_id in (select public.my_household_user_ids()));

drop policy if exists "Household deletes kid math" on public.kid_math_problems;
create policy "Household deletes kid math" on public.kid_math_problems
  for delete using (user_id in (select public.my_household_user_ids()));

drop trigger if exists kid_math_problems_updated_at on public.kid_math_problems;
create trigger kid_math_problems_updated_at before update on public.kid_math_problems
  for each row execute function update_updated_at_column();

notify pgrst, 'reload schema';
