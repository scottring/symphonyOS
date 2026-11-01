-- Which shopping-list line came from which meals (2026-11-01).
--
-- "Build shopping list" copied a week's ingredients onto Groceries and forgot
-- where they came from, so the list never followed the plan: swapping a meal
-- left its ingredients on the list, and a meal added after the build added
-- nothing. One row per ingredient per week now records the recipes that need
-- it and the list item it became (or that it was skipped: a staple, already on
-- the list, or unticked in the build). src/lib/mealGroceries.ts keeps the list
-- in step from these rows.
create table if not exists public.meal_grocery_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  list_id uuid not null references public.lists(id) on delete cascade,
  -- First day of the Meals page window the line was built for.
  week_start date not null,
  -- consolidateIngredients' canonical key ("garlic", "dijon").
  ingredient_key text not null,
  recipe_ids uuid[] not null default '{}',
  -- The words last written to the list item; an item whose words differ was
  -- edited by hand and is left alone.
  text text not null,
  list_item_id uuid references public.list_items(id) on delete set null,
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (list_id, week_start, ingredient_key)
);

create index if not exists meal_grocery_lines_list_item_idx on public.meal_grocery_lines (list_item_id);

alter table public.meal_grocery_lines enable row level security;

-- Owner-only, like lists and list_items.
drop policy if exists "Users can view own meal grocery lines" on public.meal_grocery_lines;
create policy "Users can view own meal grocery lines" on public.meal_grocery_lines
  for select using (auth.uid() = user_id);
drop policy if exists "Users can create own meal grocery lines" on public.meal_grocery_lines;
create policy "Users can create own meal grocery lines" on public.meal_grocery_lines
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid())
  );
drop policy if exists "Users can update own meal grocery lines" on public.meal_grocery_lines;
create policy "Users can update own meal grocery lines" on public.meal_grocery_lines
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete own meal grocery lines" on public.meal_grocery_lines;
create policy "Users can delete own meal grocery lines" on public.meal_grocery_lines
  for delete using (auth.uid() = user_id);

drop trigger if exists touch_updated_at on public.meal_grocery_lines;
create trigger touch_updated_at before update on public.meal_grocery_lines
  for each row execute function public.touch_updated_at();
