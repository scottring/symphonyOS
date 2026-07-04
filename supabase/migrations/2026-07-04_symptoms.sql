-- Symptom tracking — timestamped PD symptom logging with severity.
-- Mirrors the medications/medication_logs model. Owner-only RLS (private health).

create table if not exists symptoms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists symptoms_user_idx on symptoms(user_id);

create table if not exists symptom_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symptom_id uuid not null references symptoms(id) on delete cascade,
  severity smallint not null check (severity between 1 and 3),  -- 1 mild, 2 moderate, 3 severe
  logged_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists symptom_logs_user_logged_idx on symptom_logs(user_id, logged_at desc);
create index if not exists symptom_logs_symptom_idx on symptom_logs(symptom_id);

alter table symptoms enable row level security;
alter table symptom_logs enable row level security;

drop policy if exists "own symptoms" on symptoms;
create policy "own symptoms" on symptoms for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own symptom_logs" on symptom_logs;
create policy "own symptom_logs" on symptom_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Live UI refresh: hooks subscribe via postgres_changes (idempotent).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'symptoms') then
    alter publication supabase_realtime add table symptoms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'symptom_logs') then
    alter publication supabase_realtime add table symptom_logs;
  end if;
end $$;
