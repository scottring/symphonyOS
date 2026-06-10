-- Smart Capture v1: durable learning for entity resolution.
-- entity_aliases: learned text→entity mappings (only created when a fuzzy/alias
-- match is accepted; exact-name containment needs no alias).
-- resolution_log: every suggestion outcome — the labeled corpus future smarter
-- layers read or train on.

create table if not exists entity_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alias_normalized text not null,
  entity_type text not null check (entity_type in ('contact','project')),
  entity_id uuid not null,
  source text not null check (source in ('accepted','corrected')),
  hit_count int not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, alias_normalized, entity_type)
);

create table if not exists resolution_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_text text not null,
  suggested_entity_type text,
  suggested_entity_id uuid,
  score real,
  tier text,
  action text not null check (action in ('auto_applied','accepted','dismissed','ignored')),
  task_id uuid,
  created_at timestamptz not null default now()
);

alter table entity_aliases enable row level security;
alter table resolution_log enable row level security;

create policy "entity_aliases_select_own" on entity_aliases
  for select using (auth.uid() = user_id);
create policy "entity_aliases_insert_own" on entity_aliases
  for insert with check (auth.uid() = user_id);
create policy "entity_aliases_update_own" on entity_aliases
  for update using (auth.uid() = user_id);
create policy "entity_aliases_delete_own" on entity_aliases
  for delete using (auth.uid() = user_id);

create policy "resolution_log_select_own" on resolution_log
  for select using (auth.uid() = user_id);
create policy "resolution_log_insert_own" on resolution_log
  for insert with check (auth.uid() = user_id);

-- Atomic insert-or-increment for learned aliases (supabase-js upsert can't
-- express hit_count = hit_count + 1).
create or replace function upsert_entity_alias(
  p_alias text,
  p_entity_type text,
  p_entity_id uuid,
  p_source text
) returns void
language sql
security invoker
as $$
  insert into entity_aliases (user_id, alias_normalized, entity_type, entity_id, source)
  values (auth.uid(), p_alias, p_entity_type, p_entity_id, p_source)
  on conflict (user_id, alias_normalized, entity_type)
  do update set hit_count = entity_aliases.hit_count + 1,
                last_used_at = now();
$$;
