import type { Task } from '@/types/task'

/**
 * A task's current effective assignees: the multi-member `assignedToAll` when
 * present, else the legacy single `assignedTo` as a one-element list, else none.
 */
export function effectiveAssignees(task: Pick<Task, 'assignedTo' | 'assignedToAll'> | undefined): string[] {
  if (!task) return []
  if (task.assignedToAll && task.assignedToAll.length > 0) return task.assignedToAll
  return task.assignedTo ? [task.assignedTo] : []
}

/**
 * Additive bulk-assign: union the chosen member ids into a task's existing
 * assignees, preserving order and de-duplicating. "Assign these to Iris" adds
 * Iris without dropping anyone already assigned (matches the user's "if she
 * isn't already assigned" intent).
 */
export function mergeAssignees(
  task: Pick<Task, 'assignedTo' | 'assignedToAll'> | undefined,
  add: string[],
): string[] {
  return Array.from(new Set([...effectiveAssignees(task), ...add]))
}
