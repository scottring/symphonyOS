-- 075_meal_planner.sql
-- Schema for the meal planner feature: recipes (per-household library),
-- meal plans (per-week plans), meal plan entries (per-slot scheduled items),
-- cooking history (audit log of what was actually cooked), and ai_undo_tokens
-- (act-and-undo support for the Ask Symphony chat rail).
--
-- Architecture spec: docs/superpowers/specs/2026-04-28-meal-planner.md
-- Reuses the project's existing update_updated_at_column() function (from migration 018-era).

-- ─────────────────────────────────────────────────────────────────
-- recipes — per-household recipe library
-- ─────────────────────────────────────────────────────────────────

create table recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  source_url text,
  source_label text,
  image_url text,
  prep_minutes integer,
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  kid_acceptance jsonb not null default '{}'::jsonb,
  acceptance_sentence text,
  is_prep_friendly boolean not null default false,
  times_cooked integer not null default 0,
  last_cooked_at timestamptz,
  streak_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_user_id_idx on recipes(user_id);
create index recipes_last_cooked_idx on recipes(user_id, last_cooked_at desc nulls last);
create index recipes_tags_idx on recipes using gin(tags);

alter table recipes enable row level security;

create policy "users can view own recipes" on recipes for select using (auth.uid() = user_id);
create policy "users can insert own recipes" on recipes for insert with check (auth.uid() = user_id);
create policy "users can update own recipes" on recipes for update using (auth.uid() = user_id);
create policy "users can delete own recipes" on recipes for delete using (auth.uid() = user_id);

create trigger update_recipes_updated_at
  before update on recipes
  for each row
  execute function update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────
-- meal_plans — one row per (user, week_start)
-- ─────────────────────────────────────────────────────────────────

create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  week_start date not null,
  parameter text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index meal_plans_user_week_idx on meal_plans(user_id, week_start desc);

alter table meal_plans enable row level security;

create policy "users can view own meal plans" on meal_plans for select using (auth.uid() = user_id);
create policy "users can insert own meal plans" on meal_plans for insert with check (auth.uid() = user_id);
create policy "users can update own meal plans" on meal_plans for update using (auth.uid() = user_id);
create policy "users can delete own meal plans" on meal_plans for delete using (auth.uid() = user_id);

create trigger update_meal_plans_updated_at
  before update on meal_plans
  for each row
  execute function update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────
-- meal_plan_entries — one row per scheduled slot (day × slot_type)
-- ─────────────────────────────────────────────────────────────────

create table meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid references meal_plans(id) on delete cascade not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  slot text not null check (slot in ('dinner', 'prep', 'lunch_iris', 'lunch_scott', 'kid_alternate')),
  recipe_id uuid references recipes(id) on delete set null,
  ad_hoc_title text,
  notes text,
  leftover_from uuid references meal_plan_entries(id) on delete set null,
  created_at timestamptz not null default now()
);

create index meal_plan_entries_plan_id_idx on meal_plan_entries(meal_plan_id);
create index meal_plan_entries_recipe_id_idx on meal_plan_entries(recipe_id);

alter table meal_plan_entries enable row level security;

create policy "users can view own meal plan entries"
  on meal_plan_entries for select
  using (exists (
    select 1 from meal_plans
    where meal_plans.id = meal_plan_entries.meal_plan_id
      and meal_plans.user_id = auth.uid()
  ));

create policy "users can insert own meal plan entries"
  on meal_plan_entries for insert
  with check (exists (
    select 1 from meal_plans
    where meal_plans.id = meal_plan_entries.meal_plan_id
      and meal_plans.user_id = auth.uid()
  ));

create policy "users can update own meal plan entries"
  on meal_plan_entries for update
  using (exists (
    select 1 from meal_plans
    where meal_plans.id = meal_plan_entries.meal_plan_id
      and meal_plans.user_id = auth.uid()
  ));

create policy "users can delete own meal plan entries"
  on meal_plan_entries for delete
  using (exists (
    select 1 from meal_plans
    where meal_plans.id = meal_plan_entries.meal_plan_id
      and meal_plans.user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────────
-- cooking_history — audit log of every recipe actually cooked
-- ─────────────────────────────────────────────────────────────────

create table cooking_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  recipe_id uuid references recipes(id) on delete cascade not null,
  entry_id uuid references meal_plan_entries(id) on delete set null,
  cooked_at timestamptz not null default now(),
  outcome jsonb not null default '{}'::jsonb,
  notes text
);

create index cooking_history_recipe_id_idx on cooking_history(recipe_id, cooked_at desc);
create index cooking_history_user_id_idx on cooking_history(user_id, cooked_at desc);

alter table cooking_history enable row level security;

create policy "users can view own cooking history" on cooking_history for select using (auth.uid() = user_id);
create policy "users can insert own cooking history" on cooking_history for insert with check (auth.uid() = user_id);
create policy "users can update own cooking history" on cooking_history for update using (auth.uid() = user_id);
create policy "users can delete own cooking history" on cooking_history for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- ai_undo_tokens — act-and-undo support for the Ask Symphony chat rail
-- ─────────────────────────────────────────────────────────────────

create table ai_undo_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  description text not null,
  inverse_actions jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used_at timestamptz
);

create index ai_undo_tokens_user_active_idx
  on ai_undo_tokens(user_id, expires_at)
  where used_at is null;

alter table ai_undo_tokens enable row level security;

create policy "users can view own undo tokens" on ai_undo_tokens for select using (auth.uid() = user_id);
create policy "users can insert own undo tokens" on ai_undo_tokens for insert with check (auth.uid() = user_id);
create policy "users can update own undo tokens" on ai_undo_tokens for update using (auth.uid() = user_id);
create policy "users can delete own undo tokens" on ai_undo_tokens for delete using (auth.uid() = user_id);
