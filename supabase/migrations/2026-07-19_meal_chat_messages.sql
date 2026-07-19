-- 2026-07-19_meal_chat_messages.sql
-- Persist the meal-planner chat transcript so navigating away from /meals no
-- longer wipes the conversation. Household-shared + cross-device: RLS mirrors
-- meal_plans/recipes/meal_plan_entries so both household members and the wall
-- see one shared thread per week (keyed by week_start, merged by created_at).

create table if not exists public.meal_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists meal_chat_messages_week_created_idx
  on public.meal_chat_messages (week_start, created_at);

alter table public.meal_chat_messages enable row level security;

-- SELECT: self or household members (same fence as meal_plans).
drop policy if exists "household members can view meal chat" on public.meal_chat_messages;
create policy "household members can view meal chat"
  on public.meal_chat_messages for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

-- INSERT: author must be self.
drop policy if exists "users can insert own meal chat" on public.meal_chat_messages;
create policy "users can insert own meal chat"
  on public.meal_chat_messages for insert
  with check (auth.uid() = user_id);

-- DELETE: self or household members (so clear() wipes the shared week thread).
drop policy if exists "household members can delete meal chat" on public.meal_chat_messages;
create policy "household members can delete meal chat"
  on public.meal_chat_messages for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

-- No UPDATE policy: messages are immutable.
