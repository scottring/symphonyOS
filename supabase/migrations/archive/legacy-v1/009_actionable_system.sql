-- Actionable Items System
-- Unified action tracking for calendar events and routines

-- ============================================================================
-- ROUTINES TABLE
-- Symphony-native recurring items (not synced from external calendars)
-- ============================================================================

create table routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  default_assignee uuid references auth.users(id) on delete set null,
  visibility text not null default 'active' check (visibility in ('active', 'reference')),
  recurrence_pattern jsonb not null default '{"type": "daily"}'::jsonb,
  time_of_day time,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Indexes
create index routines_user_id_idx on routines(user_id);
create index routines_visibility_idx on routines(user_id, visibility);

-- RLS
alter table routines enable row level security;

create policy "Users can view own routines"
  on routines for select
  using (auth.uid() = user_id);

create policy "Users can create own routines"
  on routines for insert
  with check (auth.uid() = user_id);

create policy "Users can update own routines"
  on routines for update
  using (auth.uid() = user_id);

create policy "Users can delete own routines"
  on routines for delete
  using (auth.uid() = user_id);

-- Updated_at trigger
create trigger update_routines_updated_at
  before update on routines
  for each row
  execute function update_updated_at_column();

-- ============================================================================
-- ACTIONABLE INSTANCES TABLE
-- Tracks daily state for both calendar events and routines
-- ============================================================================

create table actionable_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  entity_type text not null check (entity_type in ('calendar_event', 'routine')),
  entity_id text not null, -- Google Calendar event ID or routine UUID
  date date not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped', 'deferred')),
  assignee uuid references auth.users(id) on delete set null,
  deferred_to timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  -- Ensure one instance per entity per date
  unique (user_id, entity_type, entity_id, date)
);

-- Indexes
create index actionable_instances_user_date_idx on actionable_instances(user_id, date);
create index actionable_instances_entity_idx on actionable_instances(entity_type, entity_id);
create index actionable_instances_status_idx on actionable_instances(user_id, status) where status != 'pending';

-- RLS
alter table actionable_instances enable row level security;

create policy "Users can view own instances"
  on actionable_instances for select
  using (auth.uid() = user_id);

create policy "Users can create own instances"
  on actionable_instances for insert
  with check (auth.uid() = user_id);

create policy "Users can update own instances"
  on actionable_instances for update
  using (auth.uid() = user_id);

create policy "Users can delete own instances"
  on actionable_instances for delete
  using (auth.uid() = user_id);

-- Updated_at trigger
create trigger update_actionable_instances_updated_at
  before update on actionable_instances
  for each row
  execute function update_updated_at_column();

-- ============================================================================
-- INSTANCE NOTES TABLE
-- Quick notes attached to specific instances
-- ============================================================================

create table instance_notes (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references actionable_instances(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  note text not null,
  created_at timestamptz default now() not null
);

-- Indexes
create index instance_notes_instance_id_idx on instance_notes(instance_id);

-- RLS
alter table instance_notes enable row level security;

create policy "Users can view notes on own instances"
  on instance_notes for select
  using (auth.uid() = user_id);

create policy "Users can create notes"
  on instance_notes for insert
  with check (auth.uid() = user_id);

create policy "Users can update own notes"
  on instance_notes for update
  using (auth.uid() = user_id);

create policy "Users can delete own notes"
  on instance_notes for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- COVERAGE REQUESTS TABLE
-- Request another user to cover an instance
-- ============================================================================

create table coverage_requests (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references actionable_instances(id) on delete cascade not null,
  requested_by uuid references auth.users(id) on delete cascade not null,
  covered_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  requested_at timestamptz default now() not null,
  responded_at timestamptz
);

-- Indexes
create index coverage_requests_instance_id_idx on coverage_requests(instance_id);
create index coverage_requests_status_idx on coverage_requests(requested_by, status);

-- RLS
alter table coverage_requests enable row level security;

-- Users can view requests they made or are asked to cover
create policy "Users can view relevant coverage requests"
  on coverage_requests for select
  using (auth.uid() = requested_by or auth.uid() = covered_by);

create policy "Users can create coverage requests"
  on coverage_requests for insert
  with check (auth.uid() = requested_by);

-- Users can update requests they're involved in
create policy "Users can update relevant coverage requests"
  on coverage_requests for update
  using (auth.uid() = requested_by or auth.uid() = covered_by);

create policy "Users can delete own coverage requests"
  on coverage_requests for delete
  using (auth.uid() = requested_by);
