-- Slice 1 of Family Capture & Extract.
-- captures: one row per ingested payload (text / whatsapp_export).
-- capture_checkpoints: per-source "last processed" timestamp for "since last run" dedupe.

create table if not exists captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('text','whatsapp_export','classdojo_thread','image')),
  source_key text,
  source_label text,
  raw_text text,
  status text not null default 'pending' check (status in ('pending','extracted','failed')),
  error text,
  created_at timestamptz not null default now(),
  constraint captures_text_has_payload check (
    kind not in ('text','whatsapp_export') or raw_text is not null
  )
);
create index if not exists captures_user_idx on captures (user_id, created_at desc);

-- Invariant: callers must supply a stable source_key for any kind that dedupes
-- (text/whatsapp_export); a NULL source_key means no checkpoint and full re-extraction.
create table if not exists capture_checkpoints (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  last_processed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, source_key)
);

alter table captures enable row level security;
alter table capture_checkpoints enable row level security;

-- Users see only their own rows. Edge functions use the service-role key, which bypasses RLS.
create policy captures_owner on captures
  for select using (auth.uid() = user_id);
create policy checkpoints_owner on capture_checkpoints
  for select using (auth.uid() = user_id);
