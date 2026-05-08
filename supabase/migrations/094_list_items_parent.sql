-- 094_list_items_parent.sql
-- Phase 1A polish: subitems for list_items.
-- A list_item can have a parent_item_id pointing at another item in the same list.
-- Cascade-delete subitems when their parent goes away.

alter table list_items
  add column if not exists parent_item_id uuid references list_items(id) on delete cascade;

create index if not exists list_items_parent_idx
  on list_items(parent_item_id) where parent_item_id is not null;
