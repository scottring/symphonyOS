-- Family Feed Connectors (2026-08-25 spec).
-- capture_sources: the allowlist of threads the connectors may read.
-- connector_health: heartbeat, so a dead feed is distinguishable from a quiet one.
-- tasks.capture_id: which capture produced a candidate, for the School pool.

create table if not exists capture_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connector text not null check (connector in ('whatsapp','classdojo')),
  source_key text not null,
  source_label text not null,
  child_member_id uuid references family_members(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, source_key)
);

create table if not exists connector_health (
  user_id uuid not null references auth.users(id) on delete cascade,
  connector text not null check (connector in ('whatsapp','classdojo')),
  last_ok_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, connector)
);

alter table tasks add column if not exists capture_id uuid
  references captures(id) on delete set null;

-- The School pool reads incomplete inbox tasks that came from a capture.
create index if not exists tasks_capture_idx
  on tasks (user_id, capture_id) where capture_id is not null;

alter table capture_sources enable row level security;
alter table connector_health enable row level security;

-- Read-own. The connectors use the service-role key, which bypasses RLS.
create policy capture_sources_owner on capture_sources
  for select using (auth.uid() = user_id);
create policy connector_health_owner on connector_health
  for select using (auth.uid() = user_id);
