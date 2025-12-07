-- Lists and List Items tables for Symphony OS
-- Reference lists for movies, restaurants, gift ideas, etc.

-- Lists table
create table lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  icon text,
  category text default 'other' check (category in ('entertainment', 'food_drink', 'shopping', 'travel', 'family_info', 'home', 'other')),
  visibility text default 'self' check (visibility in ('self', 'family')),
  hidden_from text[], -- family member IDs who shouldn't see this list
  sort_order integer default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Index for efficient user queries
create index lists_user_id_idx on lists(user_id);

-- Index for category filtering
create index lists_category_idx on lists(user_id, category);

-- Index for visibility filtering
create index lists_visibility_idx on lists(user_id, visibility);

-- Index for sort order
create index lists_sort_order_idx on lists(user_id, sort_order);

-- Index for title search (case-insensitive)
create index lists_title_search_idx on lists(user_id, lower(title));

-- Enable Row Level Security
alter table lists enable row level security;

-- Users can view their own lists
create policy "Users can view own lists"
  on lists for select
  using (auth.uid() = user_id);

-- Users can create their own lists
create policy "Users can create own lists"
  on lists for insert
  with check (auth.uid() = user_id);

-- Users can update their own lists
create policy "Users can update own lists"
  on lists for update
  using (auth.uid() = user_id);

-- Users can delete their own lists
create policy "Users can delete own lists"
  on lists for delete
  using (auth.uid() = user_id);

-- Trigger to update updated_at on list changes
create trigger update_lists_updated_at
  before update on lists
  for each row
  execute function update_updated_at_column();


-- List Items table
create table list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  list_id uuid references lists(id) on delete cascade not null,
  text text not null,
  note text,
  sort_order integer default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Index for efficient list queries
create index list_items_list_id_idx on list_items(list_id);

-- Index for user queries
create index list_items_user_id_idx on list_items(user_id);

-- Index for sort order within a list
create index list_items_sort_order_idx on list_items(list_id, sort_order);

-- Index for text search (case-insensitive)
create index list_items_text_search_idx on list_items(user_id, lower(text));

-- Enable Row Level Security
alter table list_items enable row level security;

-- Users can view their own list items
create policy "Users can view own list items"
  on list_items for select
  using (auth.uid() = user_id);

-- Users can create their own list items
create policy "Users can create own list items"
  on list_items for insert
  with check (auth.uid() = user_id);

-- Users can update their own list items
create policy "Users can update own list items"
  on list_items for update
  using (auth.uid() = user_id);

-- Users can delete their own list items
create policy "Users can delete own list items"
  on list_items for delete
  using (auth.uid() = user_id);

-- Trigger to update updated_at on list item changes
create trigger update_list_items_updated_at
  before update on list_items
  for each row
  execute function update_updated_at_column();
