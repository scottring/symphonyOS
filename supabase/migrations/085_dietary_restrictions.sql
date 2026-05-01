-- 085_dietary_restrictions.sql
-- Per-person and household-wide constraints that filter the shelf during
-- AI generation. family_member_id NULL = applies to whole household.
-- A short freeform `label` is the user-facing string, fed to the model.

create table dietary_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_member_id uuid references family_members(id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  created_at timestamptz not null default now()
);

create index dietary_restrictions_user_idx on dietary_restrictions(user_id);
create index dietary_restrictions_member_idx on dietary_restrictions(family_member_id)
  where family_member_id is not null;

alter table dietary_restrictions enable row level security;

-- Same household-visibility pattern used by recipes / standing_habits / etc.
create policy "dietary_restrictions household select"
  on dietary_restrictions for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "dietary_restrictions household insert"
  on dietary_restrictions for insert
  with check (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "dietary_restrictions household update"
  on dietary_restrictions for update
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

create policy "dietary_restrictions household delete"
  on dietary_restrictions for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));
