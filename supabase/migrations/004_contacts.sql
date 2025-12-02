-- Contacts table for Symphony OS
-- Stores user contacts for task association

create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Index for efficient user queries
create index contacts_user_id_idx on contacts(user_id);

-- Index for name search (case-insensitive)
create index contacts_name_search_idx on contacts(user_id, lower(name));

-- Enable Row Level Security
alter table contacts enable row level security;

-- Users can only see their own contacts
create policy "Users can view own contacts"
  on contacts for select
  using (auth.uid() = user_id);

-- Users can create their own contacts
create policy "Users can create own contacts"
  on contacts for insert
  with check (auth.uid() = user_id);

-- Users can update their own contacts
create policy "Users can update own contacts"
  on contacts for update
  using (auth.uid() = user_id);

-- Users can delete their own contacts
create policy "Users can delete own contacts"
  on contacts for delete
  using (auth.uid() = user_id);

-- Trigger to update updated_at on contact changes
create trigger update_contacts_updated_at
  before update on contacts
  for each row
  execute function update_updated_at_column();
