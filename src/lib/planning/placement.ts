import type { Task } from '@/types/task'

/** Where a task sits (its horizon, day and time): what triage changes, and
 *  what Undo puts back. Cleared fields come back as null. */
export function placementOf(t: Task): Partial<Task> {
  const keep = ['bucket', 'scheduledFor', 'isAllDay', 'plannedOn', 'weekendStart', 'weekStart', 'monthStart', 'seasonStart', 'deferCount', 'weekDeferredAt'] as const
  return Object.fromEntries(keep.map((k) => [k, t[k] ?? null])) as Partial<Task>
}
