-- Jax's buddy rotation: one child per night, auto-rotating
create table if not exists jax_rotation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_member_id uuid not null references family_members(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- Index for quick lookups by user+date
create index if not exists idx_jax_rotation_user_date on jax_rotation(user_id, date);

-- RLS
alter table jax_rotation enable row level security;

create policy "Users can manage their own jax_rotation"
  on jax_rotation for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
