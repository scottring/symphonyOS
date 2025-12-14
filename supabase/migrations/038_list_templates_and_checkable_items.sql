-- Add is_checked to list_items for checkable lists (movies watched, packing items packed, etc.)
alter table list_items add column is_checked boolean not null default false;

-- Add is_template to lists for reusable checklist templates (packing lists, etc.)
alter table lists add column is_template boolean not null default false;

-- Index for filtering templates vs regular lists
create index idx_lists_is_template on lists(user_id, is_template);

-- Index for filtering checked/unchecked items
create index idx_list_items_is_checked on list_items(list_id, is_checked);

-- Add comment explaining the template system
comment on column lists.is_template is 'When true, this list serves as a reusable template. Templates can be used to spawn new checklists with pre-populated items.';
comment on column list_items.is_checked is 'Whether this item has been checked off (e.g., movie watched, item packed)';
