-- Migration 052: Household Definition Rework
-- Adds guest member concept, role labels, and home address
-- Part of the Relish redesign (Phase 1)

-- Add member_type to distinguish core household members from guests
alter table family_members
  add column if not exists member_type text not null default 'core'
    check (member_type in ('core', 'guest'));

-- Add role_label for human-readable role description
-- Core members: "parent", "child"
-- Guest members: "grandparent", "babysitter", "uncle", "playdate regular", etc.
alter table family_members
  add column if not exists role_label text;

-- Add typical_involvement for guest members
-- e.g., "picks up Tuesdays", "Thursday evenings", "every other weekend"
alter table family_members
  add column if not exists typical_involvement text;

-- Add home address to households
alter table households
  add column if not exists address text;

-- Backfill: all existing family members are 'core' (already default)
-- Set role_label for existing members based on is_full_user and age_range
update family_members
  set role_label = 'parent'
  where is_full_user = true and role_label is null;

update family_members
  set role_label = case
    when age_range in ('infant', 'toddler', 'child', 'teen') then 'child'
    else 'family'
  end
  where is_full_user = false and role_label is null and member_type = 'core';
