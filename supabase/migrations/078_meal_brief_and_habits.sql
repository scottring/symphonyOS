-- 078_meal_brief_and_habits.sql
-- Surface 1 (Weekly Brief composer) + Surface 2 (Standing Habits config).
--
--   weekly_briefs   one row per (user, week_start). The free-form text Iris
--                   types Sunday morning. Symphony drafts the plan from this.
--   standing_habits per-user durable habits that get applied to every plan
--                   unless overridden. Five canonical defaults; reorderable.

-- ─────────────────────────────────────────────────────────────────
-- weekly_briefs
-- ─────────────────────────────────────────────────────────────────
create table weekly_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  week_start date not null,
  body text not null default '',
  status text not null default 'draft' check (status in ('draft', 'generated')),
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index weekly_briefs_user_week_idx on weekly_briefs(user_id, week_start desc);

alter table weekly_briefs enable row level security;

create policy "users can view own weekly briefs"
  on weekly_briefs for select using (auth.uid() = user_id);
create policy "users can insert own weekly briefs"
  on weekly_briefs for insert with check (auth.uid() = user_id);
create policy "users can update own weekly briefs"
  on weekly_briefs for update using (auth.uid() = user_id);
create policy "users can delete own weekly briefs"
  on weekly_briefs for delete using (auth.uid() = user_id);

create trigger update_weekly_briefs_updated_at
  before update on weekly_briefs
  for each row
  execute function update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────
-- standing_habits
-- ─────────────────────────────────────────────────────────────────
create table standing_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'snack', 'dinner')),
  grams_hint integer,
  sort_order integer not null default 0,
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index standing_habits_user_idx on standing_habits(user_id, sort_order);

alter table standing_habits enable row level security;

create policy "users can view own standing habits"
  on standing_habits for select using (auth.uid() = user_id);
create policy "users can insert own standing habits"
  on standing_habits for insert with check (auth.uid() = user_id);
create policy "users can update own standing habits"
  on standing_habits for update using (auth.uid() = user_id);
create policy "users can delete own standing habits"
  on standing_habits for delete using (auth.uid() = user_id);

create trigger update_standing_habits_updated_at
  before update on standing_habits
  for each row
  execute function update_updated_at_column();
