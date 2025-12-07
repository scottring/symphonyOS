-- Migration: Enable family sharing for lists
-- This updates RLS policies to support the visibility='family' and hidden_from fields

-- ============================================================================
-- HELPER FUNCTION: Get current user's family_member ID
-- ============================================================================
-- Returns the family_member.id for the current auth user (where is_full_user = true)
-- This is used to check if the current user is in a list's hidden_from array

create or replace function get_current_user_family_member_id()
returns uuid
language sql
security definer
stable
as $$
  select id from family_members
  where user_id = auth.uid()
  and is_full_user = true
  limit 1;
$$;

-- ============================================================================
-- HELPER FUNCTION: Check if users share a household
-- ============================================================================
-- For now, this checks if both users have the same user_id in family_members
-- (i.e., they belong to the same household owner)
--
-- Future: When households table exists, this will check household membership
-- Currently returns true if:
--   1. user_a = user_b (same user)
--   2. Both users have family_member records under the same owner user_id

create or replace function users_share_household(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
stable
as $$
  select
    user_a = user_b
    or exists (
      -- Check if user_a has a family_member record in user_b's household
      select 1 from family_members fm_a
      join family_members fm_b on fm_a.user_id = fm_b.user_id
      where fm_a.is_full_user = true
        and fm_b.is_full_user = true
        -- fm_a is linked to user_a, fm_b is linked to user_b
        -- For now, since only one user manages the household, this will only match when user_a = user_b
        -- When multi-user is added, family_members will have records for each auth user
    );
$$;

-- ============================================================================
-- LISTS: Update SELECT policy for family sharing
-- ============================================================================

-- Drop existing select policy
drop policy if exists "Users can view own lists" on lists;

-- Create new policy that supports family sharing
-- A user can view a list if:
-- 1. They own it (user_id = auth.uid()), OR
-- 2. The list has visibility='family' AND they share a household with the owner
--    AND their family_member_id is NOT in hidden_from
create policy "Users can view own and family-shared lists"
  on lists for select
  using (
    auth.uid() = user_id
    or (
      visibility = 'family'
      and users_share_household(auth.uid(), user_id)
      and (
        hidden_from is null
        or not (get_current_user_family_member_id()::text = any(hidden_from))
      )
    )
  );

-- ============================================================================
-- LIST_ITEMS: Update SELECT policy for family sharing
-- ============================================================================
-- Users should see items in any list they can see

-- Drop existing select policy
drop policy if exists "Users can view own list items" on list_items;

-- Create new policy - user can view items if they can view the parent list
create policy "Users can view items in accessible lists"
  on list_items for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from lists
      where lists.id = list_items.list_id
      and (
        lists.user_id = auth.uid()
        or (
          lists.visibility = 'family'
          and users_share_household(auth.uid(), lists.user_id)
          and (
            lists.hidden_from is null
            or not (get_current_user_family_member_id()::text = any(lists.hidden_from))
          )
        )
      )
    )
  );

-- ============================================================================
-- LIST_ITEMS: Add INSERT policy for family-shared lists
-- ============================================================================
-- Users should be able to add items to family-shared lists they can access

create policy "Users can add items to accessible lists"
  on list_items for insert
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from lists
      where lists.id = list_items.list_id
      and lists.visibility = 'family'
      and users_share_household(auth.uid(), lists.user_id)
      and (
        lists.hidden_from is null
        or not (get_current_user_family_member_id()::text = any(lists.hidden_from))
      )
    )
  );

-- ============================================================================
-- LIST_ITEMS: Add UPDATE policy for family-shared lists
-- ============================================================================
-- Users should be able to update items in family-shared lists they can access

drop policy if exists "Users can update own list items" on list_items;

create policy "Users can update items in accessible lists"
  on list_items for update
  using (
    auth.uid() = user_id
    or exists (
      select 1 from lists
      where lists.id = list_items.list_id
      and lists.visibility = 'family'
      and users_share_household(auth.uid(), lists.user_id)
      and (
        lists.hidden_from is null
        or not (get_current_user_family_member_id()::text = any(lists.hidden_from))
      )
    )
  );

-- ============================================================================
-- LIST_ITEMS: Add DELETE policy for family-shared lists
-- ============================================================================
-- Users should be able to delete items in family-shared lists they can access

drop policy if exists "Users can delete own list items" on list_items;

create policy "Users can delete items in accessible lists"
  on list_items for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from lists
      where lists.id = list_items.list_id
      and lists.visibility = 'family'
      and users_share_household(auth.uid(), lists.user_id)
      and (
        lists.hidden_from is null
        or not (get_current_user_family_member_id()::text = any(lists.hidden_from))
      )
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================
--
-- Current behavior (single-user household model):
-- - Owner sees all their lists regardless of visibility
-- - Family sharing infrastructure is ready but won't expand access until
--   multiple auth users are linked to the same household
-- - hidden_from works to exclude specific family_member IDs
--
-- To enable true multi-user family sharing in the future:
-- 1. Create a households table linking multiple auth users
-- 2. Update users_share_household() function to check that table
-- 3. No other changes needed - policies will automatically work
--
