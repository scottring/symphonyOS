-- proactive_suggestions was never under migration control: it exists in prod but
-- no migration created it (authoritative DDL lived in tasks/proactive-assistant-spec.md).
-- This file brings it under control and adds the interruption-policy columns.
-- Idempotent: safe to apply to a database where the table already exists.

create table if not exists public.proactive_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  entity_type text not null,
  entity_id text not null,
  suggestion_type text not null,
  title text not null,
  detail text,
  confidence float default 0.8,
  action_type text,
  action_payload jsonb default '{}',
  status text default 'active',
  acted_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz,
  suggestion_key text not null,
  generated_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, suggestion_key)
);

create index if not exists idx_proactive_suggestions_active
  on public.proactive_suggestions(user_id, status, entity_type)
  where status = 'active';

-- Interruption policy columns.
--
-- urgency: rules-derived 0-100, written by the engine as a COARSE ORDERING HINT.
--   The client recomputes live (the engine runs every 6h; "event starts within
--   90min" flips true between runs). The live value is authoritative — do not
--   "optimize" the client recompute away.
alter table public.proactive_suggestions
  add column if not exists urgency smallint;

-- seen_at: first time this rendered on an UNPROMPTED surface (wall line / Today
--   band). Anchored chips never write it. This is what distinguishes "missed"
--   from "ignored", and is the evidence for revisiting OS notifications later.
alter table public.proactive_suggestions
  add column if not exists seen_at timestamptz;

-- seen_urgency: urgency at the moment it was seen, so "escalation beats
--   cooldown" has something to compare against.
alter table public.proactive_suggestions
  add column if not exists seen_urgency smallint;

-- snoozed_until: "not now". Deliberately a timestamp, not a status — a status
--   would need a background job to un-set and would strand rows if that job
--   ever broke. A timestamp is self-healing.
alter table public.proactive_suggestions
  add column if not exists snoozed_until timestamptz;

create index if not exists idx_proactive_suggestions_unprompted
  on public.proactive_suggestions(user_id, status, urgency desc)
  where status = 'active';
