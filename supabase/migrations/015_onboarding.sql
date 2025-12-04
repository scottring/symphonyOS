-- Onboarding tracking for users
-- Tracks progress through the onboarding wizard so users can resume

-- Create user_profiles table if it doesn't exist
create table if not exists user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  onboarding_step text default 'welcome',
  onboarding_completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table user_profiles enable row level security;

-- RLS policies
create policy "Users can view own profile"
  on user_profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert own profile"
  on user_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update own profile"
  on user_profiles for update
  using (auth.uid() = user_id);

-- Index for faster lookups
create index if not exists user_profiles_user_id_idx on user_profiles(user_id);

-- Function to auto-update updated_at
create or replace function update_user_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger for updated_at
drop trigger if exists user_profiles_updated_at on user_profiles;
create trigger user_profiles_updated_at
  before update on user_profiles
  for each row
  execute function update_user_profiles_updated_at();
