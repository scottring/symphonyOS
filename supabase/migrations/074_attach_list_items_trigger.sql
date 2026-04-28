-- 074_attach_list_items_trigger.sql
-- Re-attaches the missing updated_at trigger on list_items (and lists, defensively).
-- Original migration 018_lists.sql declared both, but a check in production found
-- update_list_items_updated_at was never installed — discovered during Phase 3 bridge
-- testing when the Apple Reminders bridge was reverting kiosk-side changes because
-- updated_at was stuck and Apple's lastModifiedDate always won the timestamp compare.
--
-- Idempotent: safe to re-run.

drop trigger if exists update_lists_updated_at on lists;
create trigger update_lists_updated_at
  before update on lists
  for each row
  execute function update_updated_at_column();

drop trigger if exists update_list_items_updated_at on list_items;
create trigger update_list_items_updated_at
  before update on list_items
  for each row
  execute function update_updated_at_column();
