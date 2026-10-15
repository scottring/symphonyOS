// src/lib/canvas/toolLabels.ts
// Plain words for what a write tool is doing, shown while it saves.

const LABELS: Record<string, string> = {
  symphony_create_plan_item: 'Adding to your plan…',
  symphony_link_plan_item: 'Connecting plan items…',
  symphony_update_intention: 'Updating a year goal…',
  symphony_create_task: 'Adding a task…',
  symphony_create_calendar_event: 'Adding to the calendar…',
  symphony_update_task: 'Updating a task…',
  symphony_complete_task: 'Marking it done…',
  symphony_create_routine: 'Adding a routine…',
  symphony_update_routine: 'Updating a routine…',
  symphony_create_note: 'Saving a note…',
  symphony_set_meal: 'Setting a meal…',
  symphony_create_contact: 'Adding a contact…',
  symphony_update_contact: 'Updating a contact…',
  symphony_create_list: 'Adding a list…',
  symphony_add_list_item: 'Adding to a list…',
  symphony_check_list_item: 'Checking it off…',
  symphony_delete_list_item: 'Removing from a list…',
  symphony_draft_email: 'Drafting an email…',
}

export function toolSavingLabel(name: string): string {
  return LABELS[name] ?? 'Saving…'
}
