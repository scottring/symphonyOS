-- Tasks table for Symphony OS
-- Stores user tasks with context attachments

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  completed boolean default false not null,
  scheduled_for timestamptz,
  notes text,
  links text[],
  phone_number text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Index for efficient user queries
create index tasks_user_id_idx on tasks(user_id);

-- Index for scheduled tasks queries
create index tasks_scheduled_for_idx on tasks(scheduled_for) where scheduled_for is not null;

-- Enable Row Level Security
alter table tasks enable row level security;

-- Users can only see their own tasks
create policy "Users can view own tasks"
  on tasks for select
  using (auth.uid() = user_id);

-- Users can create their own tasks
create policy "Users can create own tasks"
  on tasks for insert
  with check (auth.uid() = user_id);

-- Users can update their own tasks
create policy "Users can update own tasks"
  on tasks for update
  using (auth.uid() = user_id);

-- Users can delete their own tasks
create policy "Users can delete own tasks"
  on tasks for delete
  using (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to update updated_at on task changes
create trigger update_tasks_updated_at
  before update on tasks
  for each row
  execute function update_updated_at_column();
