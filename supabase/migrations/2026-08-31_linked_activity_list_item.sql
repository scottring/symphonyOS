-- Needed Today scheduling: a list item scheduled into the day spawns a task
-- linked to it (linked_activity_type 'list_item'), so completing the task can
-- check the item off its list. The original CHECK predated this link kind and
-- silently bounced every such insert.
ALTER TABLE tasks DROP CONSTRAINT tasks_linked_activity_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_linked_activity_type_check
  CHECK (linked_activity_type = ANY (ARRAY[
    'task'::text, 'routine_instance'::text, 'calendar_event'::text, 'list_item'::text
  ]));
