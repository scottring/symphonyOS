-- ============================================================================
-- HOUSEHOLDS: Multi-user family sharing
-- ============================================================================
-- This migration enables true multi-user support by linking auth users to
-- shared households. Once users are in the same household, they can see
-- each other's tasks, routines, projects, and other data.
--
-- USAGE:
-- 1. First user creates a household (becomes owner)
-- 2. Owner invites other users via email
-- 3. Invited users accept to join the household
-- 4. All household members see shared data
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE ALL TABLES (without RLS policies)
-- ============================================================================

-- HOUSEHOLDS TABLE
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Household',
  owner_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Index for owner lookup
create index households_owner_id_idx on households(owner_id);

-- HOUSEHOLD MEMBERS TABLE
create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active', 'declined')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_email text, -- Email used for invitation (before user accepts)
  joined_at timestamptz,
  created_at timestamptz default now() not null,

  -- One membership per user per household
  unique (household_id, user_id)
);

-- Indexes
create index household_members_household_id_idx on household_members(household_id);
create index household_members_user_id_idx on household_members(user_id);
create index household_members_invited_email_idx on household_members(invited_email) where invited_email is not null;

-- HOUSEHOLD INVITATIONS TABLE
-- Tracks pending invitations by email (for users who don't have accounts yet)
create table household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  email text not null,
  invited_by uuid references auth.users(id) on delete cascade not null,
  token uuid default gen_random_uuid() not null unique,
  expires_at timestamptz default (now() + interval '7 days') not null,
  accepted_at timestamptz,
  created_at timestamptz default now() not null,

  -- One pending invitation per email per household
  unique (household_id, email)
);

-- Indexes
create index household_invitations_email_idx on household_invitations(email);
create index household_invitations_token_idx on household_invitations(token);

-- ============================================================================
-- STEP 2: ENABLE RLS ON ALL TABLES
-- ============================================================================

alter table households enable row level security;
alter table household_members enable row level security;
alter table household_invitations enable row level security;

-- ============================================================================
-- STEP 3: CREATE RLS POLICIES (now that all tables exist)
-- ============================================================================

-- HOUSEHOLDS POLICIES

-- Users can view households they belong to
create policy "Users can view their households"
  on households for select
  using (
    auth.uid() = owner_id
    or exists (
      select 1 from household_members
      where household_members.household_id = households.id
      and household_members.user_id = auth.uid()
      and household_members.status = 'active'
    )
  );

-- Only the owner can create a household
create policy "Users can create households"
  on households for insert
  with check (auth.uid() = owner_id);

-- Only the owner can update the household
create policy "Owners can update their households"
  on households for update
  using (auth.uid() = owner_id);

-- Only the owner can delete the household
create policy "Owners can delete their households"
  on households for delete
  using (auth.uid() = owner_id);

-- Updated_at trigger
create trigger update_households_updated_at
  before update on households
  for each row
  execute function update_updated_at_column();

-- HOUSEHOLD MEMBERS POLICIES

-- Users can view members of households they belong to
create policy "Users can view household members"
  on household_members for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from household_members hm
      where hm.household_id = household_members.household_id
      and hm.user_id = auth.uid()
      and hm.status = 'active'
    )
  );

-- Owners/admins can invite new members
create policy "Admins can invite members"
  on household_members for insert
  with check (
    auth.uid() = invited_by
    and exists (
      select 1 from household_members hm
      where hm.household_id = household_members.household_id
      and hm.user_id = auth.uid()
      and hm.status = 'active'
      and hm.role in ('owner', 'admin')
    )
  );

-- Users can update their own membership (accept/decline invite)
-- Owners can update any membership in their household
create policy "Users can update memberships"
  on household_members for update
  using (
    auth.uid() = user_id
    or exists (
      select 1 from households h
      where h.id = household_members.household_id
      and h.owner_id = auth.uid()
    )
  );

-- Owners can remove members, users can remove themselves
create policy "Users can delete memberships"
  on household_members for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from households h
      where h.id = household_members.household_id
      and h.owner_id = auth.uid()
    )
  );

-- HOUSEHOLD INVITATIONS POLICIES

-- Users can view invitations for households they own/admin
create policy "Admins can view invitations"
  on household_invitations for select
  using (
    exists (
      select 1 from household_members hm
      where hm.household_id = household_invitations.household_id
      and hm.user_id = auth.uid()
      and hm.status = 'active'
      and hm.role in ('owner', 'admin')
    )
  );

-- Admins can create invitations
create policy "Admins can create invitations"
  on household_invitations for insert
  with check (
    auth.uid() = invited_by
    and exists (
      select 1 from household_members hm
      where hm.household_id = household_invitations.household_id
      and hm.user_id = auth.uid()
      and hm.status = 'active'
      and hm.role in ('owner', 'admin')
    )
  );

-- Admins can delete invitations
create policy "Admins can delete invitations"
  on household_invitations for delete
  using (
    exists (
      select 1 from household_members hm
      where hm.household_id = household_invitations.household_id
      and hm.user_id = auth.uid()
      and hm.status = 'active'
      and hm.role in ('owner', 'admin')
    )
  );

-- ============================================================================
-- STEP 4: HELPER FUNCTIONS
-- ============================================================================

-- UPDATE users_share_household() FUNCTION
-- Now properly checks the households table
create or replace function users_share_household(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
stable
as $$
  select
    user_a = user_b
    or exists (
      -- Check if both users are active members of the same household
      select 1
      from household_members hm_a
      join household_members hm_b on hm_a.household_id = hm_b.household_id
      where hm_a.user_id = user_a
        and hm_b.user_id = user_b
        and hm_a.status = 'active'
        and hm_b.status = 'active'
    );
$$;

-- Get user's household ID
create or replace function get_user_household_id(target_user_id uuid default auth.uid())
returns uuid
language sql
security definer
stable
as $$
  select household_id
  from household_members
  where user_id = target_user_id
  and status = 'active'
  limit 1;
$$;

-- Check if user is household admin
create or replace function is_household_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from household_members
    where user_id = target_user_id
    and status = 'active'
    and role in ('owner', 'admin')
  );
$$;

-- Auto-create household for new users (trigger function)
create or replace function ensure_user_has_household()
returns trigger
language plpgsql
security definer
as $$
declare
  new_household_id uuid;
begin
  -- Check if user already has a household
  if not exists (
    select 1 from household_members
    where user_id = new.id
    and status = 'active'
  ) then
    -- Create a new household
    insert into households (owner_id, name)
    values (new.id, 'My Household')
    returning id into new_household_id;

    -- Add user as owner member
    insert into household_members (household_id, user_id, role, status, joined_at)
    values (new_household_id, new.id, 'owner', 'active', now());
  end if;

  return new;
end;
$$;

-- Note: This trigger would go on auth.users, but we can't modify that directly.
-- Instead, we'll handle this in the application when users first log in.

-- ============================================================================
-- STEP 5: UPDATE RLS POLICIES FOR EXISTING TABLES
-- ============================================================================

-- TASKS: Update RLS for household sharing
drop policy if exists "Users can view own tasks" on tasks;
drop policy if exists "Users can create own tasks" on tasks;
drop policy if exists "Users can update own tasks" on tasks;
drop policy if exists "Users can delete own tasks" on tasks;

-- Users can view tasks from their household
create policy "Users can view household tasks"
  on tasks for select
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

-- Users can create tasks (owned by themselves)
create policy "Users can create own tasks"
  on tasks for insert
  with check (auth.uid() = user_id);

-- Users can update tasks in their household
create policy "Users can update household tasks"
  on tasks for update
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

-- Users can delete tasks in their household
create policy "Users can delete household tasks"
  on tasks for delete
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

-- ROUTINES: Update RLS for household sharing
drop policy if exists "Users can view own routines" on routines;
drop policy if exists "Users can create own routines" on routines;
drop policy if exists "Users can update own routines" on routines;
drop policy if exists "Users can delete own routines" on routines;

create policy "Users can view household routines"
  on routines for select
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

create policy "Users can create own routines"
  on routines for insert
  with check (auth.uid() = user_id);

create policy "Users can update household routines"
  on routines for update
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

create policy "Users can delete household routines"
  on routines for delete
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

-- ACTIONABLE INSTANCES: Update RLS for household sharing
drop policy if exists "Users can view own instances" on actionable_instances;
drop policy if exists "Users can create own instances" on actionable_instances;
drop policy if exists "Users can update own instances" on actionable_instances;
drop policy if exists "Users can delete own instances" on actionable_instances;

create policy "Users can view household instances"
  on actionable_instances for select
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

create policy "Users can create own instances"
  on actionable_instances for insert
  with check (auth.uid() = user_id);

create policy "Users can update household instances"
  on actionable_instances for update
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

create policy "Users can delete household instances"
  on actionable_instances for delete
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

-- PROJECTS: Update RLS for household sharing
drop policy if exists "Users can view own projects" on projects;
drop policy if exists "Users can create own projects" on projects;
drop policy if exists "Users can update own projects" on projects;
drop policy if exists "Users can delete own projects" on projects;

create policy "Users can view household projects"
  on projects for select
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

create policy "Users can create own projects"
  on projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update household projects"
  on projects for update
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

create policy "Users can delete household projects"
  on projects for delete
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

-- CONTACTS: Update RLS for household sharing
drop policy if exists "Users can view their contacts" on contacts;
drop policy if exists "Users can create contacts" on contacts;
drop policy if exists "Users can update their contacts" on contacts;
drop policy if exists "Users can delete their contacts" on contacts;

create policy "Users can view household contacts"
  on contacts for select
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

create policy "Users can create own contacts"
  on contacts for insert
  with check (auth.uid() = user_id);

create policy "Users can update household contacts"
  on contacts for update
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

create policy "Users can delete household contacts"
  on contacts for delete
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

-- FAMILY MEMBERS: Update RLS for household sharing
-- Family members should be visible to all household users
drop policy if exists "Users can view their own family members" on family_members;
drop policy if exists "Users can insert their own family members" on family_members;
drop policy if exists "Users can update their own family members" on family_members;
drop policy if exists "Users can delete their own family members" on family_members;

create policy "Users can view household family members"
  on family_members for select
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

create policy "Users can create own family members"
  on family_members for insert
  with check (auth.uid() = user_id);

create policy "Users can update household family members"
  on family_members for update
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

create policy "Users can delete household family members"
  on family_members for delete
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

-- Add auth_user_id to family_members
-- Links family_member records to auth users (for users with accounts)
alter table family_members
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

-- Index for looking up family member by auth user
create index if not exists family_members_auth_user_id_idx
  on family_members(auth_user_id)
  where auth_user_id is not null;

-- NOTES: Update RLS for household sharing
drop policy if exists "Users can view own notes" on notes;
drop policy if exists "Users can create notes" on notes;
drop policy if exists "Users can update own notes" on notes;
drop policy if exists "Users can delete own notes" on notes;

create policy "Users can view household notes"
  on notes for select
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

create policy "Users can create own notes"
  on notes for insert
  with check (auth.uid() = user_id);

create policy "Users can update household notes"
  on notes for update
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

create policy "Users can delete household notes"
  on notes for delete
  using (
    auth.uid() = user_id
    or users_share_household(auth.uid(), user_id)
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================
--
-- To link Iris to Scott's household:
-- 1. Scott creates invitation: INSERT INTO household_invitations (household_id, email, invited_by)
-- 2. Iris creates account with that email
-- 3. Iris accepts: INSERT INTO household_members (household_id, user_id, status, joined_at)
--    VALUES (scotts_household_id, iris_user_id, 'active', now())
-- 4. Done! Iris can now see all of Scott's tasks, routines, projects, etc.
--
-- The frontend will need:
-- 1. A "Household Settings" page to manage members
-- 2. An invitation flow (generate link or send email)
-- 3. Accept invitation flow for new users
-- ============================================================================
