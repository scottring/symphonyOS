-- ============================================================================
-- RELISH FOUNDATION: Manuals, Entries, Yearbooks, Conversations, Checkins
-- ============================================================================
-- This migration adds the Relish intelligence layer tables.
-- These tables power the family coherence system: AI-guided onboarding that
-- creates a family "manual" (8-domain operating document), yearbooks with
-- generated entries, and weekly coherence check-ins with drift detection.
--
-- All tables follow the household-sharing RLS pattern from 027_households.sql.
-- Migration is fully idempotent (safe to re-run).
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE TABLES (IF NOT EXISTS)
-- ============================================================================

-- MANUALS TABLE
create table if not exists manuals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null default 'household' check (type in ('household', 'individual')),
  person_id uuid references family_members(id) on delete set null,
  title text not null,
  subtitle text,
  domains jsonb not null default '{}'::jsonb,
  domain_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- YEARBOOKS TABLE
create table if not exists yearbooks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  person_id uuid references family_members(id) on delete cascade not null,
  year integer not null,
  chapters jsonb not null default '[]'::jsonb,
  developmental_baseline jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (household_id, person_id, year)
);

-- ENTRIES TABLE
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  manual_id uuid references manuals(id) on delete set null,
  yearbook_id uuid references yearbooks(id) on delete set null,
  person_id uuid references family_members(id) on delete set null,
  type text not null check (type in (
    'insight', 'activity', 'goal', 'task', 'reflection',
    'story', 'checklist', 'discussion', 'milestone'
  )),
  source text not null default 'system' check (source in ('system', 'parent', 'child', 'imported')),
  domain text not null check (domain in (
    'values', 'communication', 'connection', 'roles',
    'organization', 'adaptability', 'problemSolving', 'resources'
  )),
  title text not null,
  content jsonb not null default '{}'::jsonb,
  linked_entry_ids uuid[] default '{}',
  lifecycle text not null default 'active' check (lifecycle in ('active', 'completed', 'archived')),
  visibility text not null default 'family' check (visibility in ('family', 'parents', 'individual')),
  completed_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- CONVERSATIONS TABLE
-- Drop and recreate if it exists with wrong schema (from partial migration)
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'conversations' and table_schema = 'public') then
    -- Check if it has the expected columns; if not, drop and recreate
    if not exists (select 1 from information_schema.columns where table_name = 'conversations' and column_name = 'purpose') then
      drop table conversations cascade;
    end if;
  end if;
end $$;

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  purpose text not null check (purpose in ('onboarding', 'coaching', 'checkin', 'facilitation', 'refresh')),
  manual_id uuid references manuals(id) on delete set null,
  phase_id text,
  domain_id text,
  turns jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- CHECKINS TABLE
create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  week text not null,
  responses jsonb not null default '{}'::jsonb,
  system_observations jsonb not null default '[]'::jsonb,
  drift_signals jsonb not null default '[]'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (user_id, week)
);

-- ============================================================================
-- STEP 2: INDEXES (IF NOT EXISTS)
-- ============================================================================

create index if not exists manuals_household_id_idx on manuals(household_id);
create index if not exists manuals_user_id_idx on manuals(user_id);
create index if not exists manuals_type_idx on manuals(type);
create index if not exists manuals_person_id_idx on manuals(person_id) where person_id is not null;

create index if not exists yearbooks_household_id_idx on yearbooks(household_id);
create index if not exists yearbooks_person_id_idx on yearbooks(person_id);
create index if not exists yearbooks_year_idx on yearbooks(year);

create index if not exists entries_household_id_idx on entries(household_id);
create index if not exists entries_manual_id_idx on entries(manual_id) where manual_id is not null;
create index if not exists entries_yearbook_id_idx on entries(yearbook_id) where yearbook_id is not null;
create index if not exists entries_person_id_idx on entries(person_id) where person_id is not null;
create index if not exists entries_type_idx on entries(type);
create index if not exists entries_domain_idx on entries(domain);
create index if not exists entries_lifecycle_idx on entries(lifecycle);

create index if not exists conversations_household_id_idx on conversations(household_id);
create index if not exists conversations_user_id_idx on conversations(user_id);
create index if not exists conversations_purpose_idx on conversations(purpose);
create index if not exists conversations_status_idx on conversations(status);

create index if not exists checkins_household_id_idx on checkins(household_id);
create index if not exists checkins_user_id_idx on checkins(user_id);
create index if not exists checkins_week_idx on checkins(week);

-- ============================================================================
-- STEP 3: ENABLE RLS
-- ============================================================================

alter table manuals enable row level security;
alter table yearbooks enable row level security;
alter table entries enable row level security;
alter table conversations enable row level security;
alter table checkins enable row level security;

-- ============================================================================
-- STEP 4: RLS POLICIES (drop + create for idempotency)
-- ============================================================================

-- MANUALS
drop policy if exists "Users can view household manuals" on manuals;
create policy "Users can view household manuals"
  on manuals for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

drop policy if exists "Users can create own manuals" on manuals;
create policy "Users can create own manuals"
  on manuals for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update household manuals" on manuals;
create policy "Users can update household manuals"
  on manuals for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

drop policy if exists "Users can delete household manuals" on manuals;
create policy "Users can delete household manuals"
  on manuals for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

-- YEARBOOKS
drop policy if exists "Users can view household yearbooks" on yearbooks;
create policy "Users can view household yearbooks"
  on yearbooks for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

drop policy if exists "Users can create own yearbooks" on yearbooks;
create policy "Users can create own yearbooks"
  on yearbooks for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update household yearbooks" on yearbooks;
create policy "Users can update household yearbooks"
  on yearbooks for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

drop policy if exists "Users can delete household yearbooks" on yearbooks;
create policy "Users can delete household yearbooks"
  on yearbooks for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

-- ENTRIES
drop policy if exists "Users can view household entries" on entries;
create policy "Users can view household entries"
  on entries for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

drop policy if exists "Users can create own entries" on entries;
create policy "Users can create own entries"
  on entries for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update household entries" on entries;
create policy "Users can update household entries"
  on entries for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

drop policy if exists "Users can delete household entries" on entries;
create policy "Users can delete household entries"
  on entries for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

-- CONVERSATIONS
drop policy if exists "Users can view household conversations" on conversations;
create policy "Users can view household conversations"
  on conversations for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

drop policy if exists "Users can create own conversations" on conversations;
create policy "Users can create own conversations"
  on conversations for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update household conversations" on conversations;
create policy "Users can update household conversations"
  on conversations for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

drop policy if exists "Users can delete household conversations" on conversations;
create policy "Users can delete household conversations"
  on conversations for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

-- CHECKINS
drop policy if exists "Users can view household checkins" on checkins;
create policy "Users can view household checkins"
  on checkins for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

drop policy if exists "Users can create own checkins" on checkins;
create policy "Users can create own checkins"
  on checkins for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update household checkins" on checkins;
create policy "Users can update household checkins"
  on checkins for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

drop policy if exists "Users can delete household checkins" on checkins;
create policy "Users can delete household checkins"
  on checkins for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

-- ============================================================================
-- STEP 5: UPDATED_AT TRIGGERS (drop + create for idempotency)
-- ============================================================================

drop trigger if exists update_manuals_updated_at on manuals;
create trigger update_manuals_updated_at
  before update on manuals
  for each row execute function update_updated_at_column();

drop trigger if exists update_yearbooks_updated_at on yearbooks;
create trigger update_yearbooks_updated_at
  before update on yearbooks
  for each row execute function update_updated_at_column();

drop trigger if exists update_entries_updated_at on entries;
create trigger update_entries_updated_at
  before update on entries
  for each row execute function update_updated_at_column();

drop trigger if exists update_conversations_updated_at on conversations;
create trigger update_conversations_updated_at
  before update on conversations
  for each row execute function update_updated_at_column();

drop trigger if exists update_checkins_updated_at on checkins;
create trigger update_checkins_updated_at
  before update on checkins
  for each row execute function update_updated_at_column();

-- ============================================================================
-- STEP 6: EXTEND USER_PROFILES FOR RELISH ONBOARDING
-- ============================================================================

alter table user_profiles
  add column if not exists relish_onboarding_phases_completed text[] default '{}',
  add column if not exists relish_current_phase text,
  add column if not exists family_manual_id uuid,
  add column if not exists relish_intro_completed boolean default false;
