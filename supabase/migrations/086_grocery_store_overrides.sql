-- 086_grocery_store_overrides.sql
-- Persistent per-ingredient routing rules. When a user marks a coffee ingredient
-- as "destination = Mom's", future plans automatically route coffee items to that
-- list. Pattern is matched against the ConsolidatedIngredient.text via the
-- existing ingredientKey normalizer (case-insensitive, prep-stripped).

create table grocery_store_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null check (length(trim(pattern)) > 0),
  target_list_id uuid not null references lists(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, pattern)
);

create index grocery_store_overrides_user_idx on grocery_store_overrides(user_id);
create index grocery_store_overrides_target_idx on grocery_store_overrides(target_list_id);

alter table grocery_store_overrides enable row level security;

create policy "store overrides household select"
  on grocery_store_overrides for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "store overrides household insert"
  on grocery_store_overrides for insert
  with check (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "store overrides household update"
  on grocery_store_overrides for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "store overrides household delete"
  on grocery_store_overrides for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));
