-- Math of the day, round two (Scott, 2026-10-14):
--
-- Bonus problems: after the daily problem a kid can ask for up to three more,
-- each a step harder. They live beside the daily row as slots 1–3 of the
-- same day; slot 0 is the daily problem, the only one streaks and levels read.
--
-- Topics: each kid taps up to three things they like on the wall (dinosaurs,
-- soccer, space…) and the next stories are about one of them. One row per
-- kid, household-shared like the problems.

alter table public.kid_math_problems
  add column if not exists slot smallint not null default 0 check (slot between 0 and 3);

alter table public.kid_math_problems drop constraint if exists kid_math_problems_member_id_for_date_key;
alter table public.kid_math_problems drop constraint if exists kid_math_problems_member_date_slot_key;
alter table public.kid_math_problems
  add constraint kid_math_problems_member_date_slot_key unique (member_id, for_date, slot);

create table if not exists public.kid_math_prefs (
  member_id uuid primary key references public.family_members(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  topics text[] not null default '{}' check (cardinality(topics) <= 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kid_math_prefs enable row level security;

drop policy if exists "Household reads kid math prefs" on public.kid_math_prefs;
create policy "Household reads kid math prefs" on public.kid_math_prefs
  for select using (user_id in (select public.my_household_user_ids()));

drop policy if exists "Users add kid math prefs" on public.kid_math_prefs;
create policy "Users add kid math prefs" on public.kid_math_prefs
  for insert with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.family_members fm where fm.id = member_id)
  );

drop policy if exists "Household updates kid math prefs" on public.kid_math_prefs;
create policy "Household updates kid math prefs" on public.kid_math_prefs
  for update using (user_id in (select public.my_household_user_ids()))
  with check (user_id in (select public.my_household_user_ids()));

drop policy if exists "Household deletes kid math prefs" on public.kid_math_prefs;
create policy "Household deletes kid math prefs" on public.kid_math_prefs
  for delete using (user_id in (select public.my_household_user_ids()));

drop trigger if exists kid_math_prefs_updated_at on public.kid_math_prefs;
create trigger kid_math_prefs_updated_at before update on public.kid_math_prefs
  for each row execute function update_updated_at_column();

notify pgrst, 'reload schema';
