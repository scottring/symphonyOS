// src/lib/canvas/toolLabels.ts
// Plain words for what a write tool is doing, shown while it saves.

const LABELS: Record<string, string> = {
  symphony_create_plan_item: 'Adding to your plan…',
  symphony_link_plan_item: 'Connecting plan items…',
  symphony_update_intention: 'Updating an intention…',
  symphony_create_task: 'Adding a task…',
  symphony_create_calendar_event: 'Adding to the calendar…',
  symphony_update_task: 'Updating a task…',
  symphony_complete_task: 'Marking it done…',
  symphony_delete_task: 'Removing a task…',
  symphony_create_project: 'Adding a project…',
  symphony_update_project: 'Updating a project…',
  symphony_create_routine: 'Adding a routine…',
  symphony_update_routine: 'Updating a routine…',
  symphony_delete_routine: 'Removing a routine…',
  symphony_create_note: 'Saving a note…',
  symphony_attach_source: 'Attaching a file…',
}

export function toolSavingLabel(name: string): string {
  return LABELS[name] ?? 'Saving…'
}
