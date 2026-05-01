-- 087_pantry_inventory.sql
-- Per-ingredient inventory level. Lets the Send-to-Groceries modal auto-remove
-- items the user has plenty of, and surface "marked high N days ago, used in M
-- recipes since" as soft context. Pattern is the same normalized form as
-- grocery_store_overrides.pattern.

create table pantry_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null check (length(trim(pattern)) > 0),
  level text not null check (level in ('high','medium','low','out')),
  last_checked_at timestamptz not null default now(),
  unique (user_id, pattern)
);

create index pantry_inventory_user_idx on pantry_inventory(user_id);

alter table pantry_inventory enable row level security;

create policy "pantry inventory household select"
  on pantry_inventory for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "pantry inventory household insert"
  on pantry_inventory for insert
  with check (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "pantry inventory household update"
  on pantry_inventory for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "pantry inventory household delete"
  on pantry_inventory for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));
