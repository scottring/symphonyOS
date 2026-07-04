-- Medication tracker — timestamped dose logging for PD meds.
-- Dedicated domain (not routines) so `taken_at` timestamps are first-class and
-- PRN/extra doses are ordinary rows. Owner-only RLS (private health data).

-- ensure_med_log_token() below uses gen_random_bytes() (pgcrypto). Supabase
-- ships pgcrypto enabled, but declare it so the migration is self-contained.
create extension if not exists pgcrypto;

create table if not exists medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  strength text,
  schedule_times jsonb not null default '[]'::jsonb,  -- array of local "HH:MM"
  active boolean not null default true,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists medications_user_idx on medications(user_id);

create table if not exists medication_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  medication_id uuid not null references medications(id) on delete cascade,
  taken_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('siri','shortcut','web','manual')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists medication_logs_user_taken_idx on medication_logs(user_id, taken_at desc);
create index if not exists medication_logs_med_idx on medication_logs(medication_id);

-- Durable per-user secret for the Watch/phone Shortcut (JWTs expire; a static
-- Shortcut needs a stable credential). Same spirit as the vault-sync webhook.
create table if not exists med_log_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

alter table medications enable row level security;
alter table medication_logs enable row level security;
alter table med_log_tokens enable row level security;

-- Owner-only on all three (no household sharing for private meds).
drop policy if exists "own medications" on medications;
create policy "own medications" on medications for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own medication_logs" on medication_logs;
create policy "own medication_logs" on medication_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own med_log_tokens" on med_log_tokens;
create policy "own med_log_tokens" on med_log_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Return the caller's logging token, minting one on first call.
-- SECURITY DEFINER so the insert bypasses RLS timing races; still scoped to auth.uid().
create or replace function ensure_med_log_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
begin
  select token into t from med_log_tokens where user_id = auth.uid();
  if t is null then
    t := encode(gen_random_bytes(24), 'hex');
    insert into med_log_tokens(user_id, token) values (auth.uid(), t)
      on conflict (user_id) do update set token = excluded.token
      returning token into t;
  end if;
  return t;
end;
$$;

revoke all on function ensure_med_log_token() from public;
grant execute on function ensure_med_log_token() to authenticated;
