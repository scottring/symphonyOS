-- Logins: where you sign in, with what username, and a password HINT.
-- The password itself is never stored — it lives in Apple Passwords. The hint
-- is a masked reminder the owner chose (e.g. "T**Sm****01").
-- Owner-only RLS: never shared with the household, never shown on the wall,
-- not read by the assistant.

create table if not exists public.logins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  site text not null check (length(trim(site)) > 0),
  url text,
  username text,
  password_hint text check (password_hint is null or length(password_hint) <= 64),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists logins_user_idx on public.logins(user_id);

alter table public.logins enable row level security;

drop policy if exists "own logins" on public.logins;
create policy "own logins" on public.logins for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
