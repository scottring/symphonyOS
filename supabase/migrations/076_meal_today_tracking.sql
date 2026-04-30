-- 076_meal_today_tracking.sql
-- S12 · Today / Diet Tracking. A plan-first tracker: most days you ate the
-- plan, you only mark deviations. Adds tracking-state to meal entries and a
-- per-day log for habits, notes, and weight.

-- ─────────────────────────────────────────────────────────────────
-- meal_plan_entries · per-entry tracking state
-- ─────────────────────────────────────────────────────────────────
-- Default = 'as_planned'. End-of-day or manual confirm leaves it there.
-- Swap stores the replacement title + grams string. Skip dims the row.
-- 'added' marks an entry that was inserted in tracking mode (not part of
-- the original plan).

alter table meal_plan_entries
  add column tracking_state text not null default 'as_planned'
    check (tracking_state in ('as_planned', 'swapped', 'skipped', 'added')),
  add column swap_title text,
  add column swap_grams text,
  add column actual_grams text,
  add column tracking_updated_at timestamptz;

create index meal_plan_entries_tracking_state_idx
  on meal_plan_entries(meal_plan_id, tracking_state);

-- ─────────────────────────────────────────────────────────────────
-- meal_day_logs · ambient per-day signals
-- ─────────────────────────────────────────────────────────────────
-- Habits is a flat object: { yogurt_breakfast: true, dal_lunch: false, ... }.
-- The five default keys live in code; the column is freeform so habit names
-- can drift without migrations.

create table meal_day_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  log_date date not null,
  notes text,
  weight_lb numeric(5, 2),
  weight_note text,
  habits jsonb not null default '{}'::jsonb,
  total_grams_actual integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create index meal_day_logs_user_date_idx on meal_day_logs(user_id, log_date desc);

alter table meal_day_logs enable row level security;

create policy "users can view own meal day logs"
  on meal_day_logs for select using (auth.uid() = user_id);
create policy "users can insert own meal day logs"
  on meal_day_logs for insert with check (auth.uid() = user_id);
create policy "users can update own meal day logs"
  on meal_day_logs for update using (auth.uid() = user_id);
create policy "users can delete own meal day logs"
  on meal_day_logs for delete using (auth.uid() = user_id);

create trigger update_meal_day_logs_updated_at
  before update on meal_day_logs
  for each row
  execute function update_updated_at_column();
