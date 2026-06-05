import type { Task, TaskContext } from '@/types/task'

/** Options accepted by useSupabaseTasks.addTask (subset used here). */
interface AddTaskOpts {
  isAllDay?: boolean
  assignedTo?: string
  context?: TaskContext | null
}

export interface GroupTasksDeps {
  addTask: (
    title: string,
    contactId: string | undefined,
    projectId: string | undefined,
    scheduledFor: Date | undefined,
    options: AddTaskOpts,
  ) => Promise<string | undefined>
  updateTask: (id: string, updates: Partial<Task>) => Promise<void> | void
  /**
   * Rebuild the task tree from the source of truth. Required for the group to
   * appear immediately: `updateTask`'s optimistic path patches a reparented
   * task in place without re-nesting it under its new parent, so the nested
   * (parent.subtasks) shape the Today view renders from is only produced by a
   * full fetch (the same thing a page refresh does). Called once after all
   * reparents land.
   */
  refetch?: () => Promise<void> | void
}

export interface GroupTasksInput {
  taskIds: string[]
  groupName: string
  date: Date
  isAllDay: boolean
  assignedTo?: string
  context?: TaskContext | null
}

/**
 * Create a wrapper task and reparent the selected tasks under it. Each child
 * inherits the wrapper's date/all-day so it lands in the same Today day-section
 * and nests under the wrapper (see lib/today/grouping.ts). Returns the new
 * wrapper id, or undefined if wrapper creation failed (in which case no child
 * is touched).
 */
export async function groupTasks(
  input: GroupTasksInput,
  deps: GroupTasksDeps,
): Promise<string | undefined> {
  const { taskIds, groupName, date, isAllDay, assignedTo, context } = input
  const wrapperId = await deps.addTask(groupName, undefined, undefined, date, {
    isAllDay,
    assignedTo,
    context,
  })
  if (!wrapperId) return undefined
  for (const id of taskIds) {
    await deps.updateTask(id, { parentTaskId: wrapperId, scheduledFor: date, isAllDay })
  }
  // Rebuild the nested tree so the wrapper + its new subtasks render now,
  // not only after a manual page refresh.
  await deps.refetch?.()
  return wrapperId
}
