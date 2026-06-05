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
  return wrapperId
}
