-- 072_lists_external_sync.sql
-- Adds columns required for syncing Symphony lists/list_items with external sources
-- (Apple Reminders is the first consumer; column shape is generic).

-- lists: where external system maps to this list (e.g. Apple Reminders calendar name)
alter table lists
  add column external_id text,
  add column external_source text;

-- Each (source, id) pair must be globally unique across users; if Iris and Scott
-- both have a Symphony list pointed at the same Apple list it would corrupt sync.
create unique index lists_external_unique_idx
  on lists(external_source, external_id)
  where external_source is not null;

-- list_items: item-level external mapping + completion state
alter table list_items
  add column external_id text,
  add column external_source text,
  add column completed boolean not null default false,
  add column completed_at timestamptz;

create unique index list_items_external_unique_idx
  on list_items(external_source, external_id)
  where external_source is not null;

-- Index used by the bridge to fetch all items it owns for a given list quickly
create index list_items_list_external_idx
  on list_items(list_id, external_source)
  where external_source is not null;
