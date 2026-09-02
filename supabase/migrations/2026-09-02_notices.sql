-- Standing info from a school email, addressed to a kid (or everyone).
-- Surfaced on the wall's per-kid page for 14 days; never deleted by age.
-- Applied by hand in prod (DDL goes through Scott).
create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_member_id uuid references family_members(id) on delete cascade, -- null = everyone
  text text not null,
  sender_label text,
  received_on date not null default current_date,
  capture_id uuid references captures(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists notices_user_received_idx on notices (user_id, received_on desc);
alter table notices enable row level security;
create policy "Users can view household notices" on notices for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));
create policy "Users can create own notices" on notices for insert
  with check (auth.uid() = user_id);
create policy "Users can delete household notices" on notices for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));
