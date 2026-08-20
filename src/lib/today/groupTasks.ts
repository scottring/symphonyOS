import type { Task, TaskContext, GroupMemberRef } from '@/types/task'

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
  // useSupabaseTasks.updateTask now reports success as a boolean; this helper
  // ignores the return value, so the type just needs to admit it.
  updateTask: (id: string, updates: Partial<Task>) => Promise<boolean> | Promise<void> | void
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

export interface GroupItemsInput {
  taskIds: string[]
  memberRefs: GroupMemberRef[]   // events + routines only (tasks use parentTaskId)
  groupName: string
  date: Date
  isAllDay: boolean
  assignedTo?: string
  context?: TaskContext | null
}

/**
 * Create a wrapper task and attach a mix of members: tasks reparent via
 * parentTaskId (same as groupTasks); events/routines are recorded as refs in
 * the wrapper's group_members. grouping.ts relocates all members under the
 * wrapper card. Returns the wrapper id, or undefined if wrapper creation failed
 * (in which case nothing is touched).
 */
export async function groupItems(
  input: GroupItemsInput,
  deps: GroupTasksDeps,
): Promise<string | undefined> {
  const { taskIds, memberRefs, groupName, date, isAllDay, assignedTo, context } = input
  const wrapperId = await deps.addTask(groupName, undefined, undefined, date, {
    isAllDay,
    assignedTo,
    context,
  })
  if (!wrapperId) return undefined
  for (const id of taskIds) {
    await deps.updateTask(id, { parentTaskId: wrapperId, scheduledFor: date, isAllDay })
  }
  if (memberRefs.length > 0) {
    await deps.updateTask(wrapperId, { groupMembers: memberRefs })
  }
  await deps.refetch?.()
  return wrapperId
}

type UpdateFn = (id: string, updates: Partial<Task>) => Promise<boolean> | Promise<void> | void
type DeleteFn = (id: string) => Promise<void> | void
type RefetchFn = () => Promise<void> | void

/**
 * Remove a single task from its group: detach it from its parent so it returns
 * to being a standalone task (it keeps its own schedule). Refetch rebuilds the
 * tree (the optimistic path doesn't promote a detached subtask back to top level).
 */
export async function removeFromGroup(
  taskId: string,
  deps: { updateTask: UpdateFn; refetch?: RefetchFn },
): Promise<void> {
  await deps.updateTask(taskId, { parentTaskId: undefined })
  await deps.refetch?.()
}

/**
 * Dissolve a group but keep its tasks: detach every child first (so none is
 * orphaned), then delete the now-empty wrapper. Refetch rebuilds the tree.
 */
export async function ungroupTasks(
  wrapperId: string,
  childIds: string[],
  deps: { updateTask: UpdateFn; deleteTask: DeleteFn; refetch?: RefetchFn },
): Promise<void> {
  for (const id of childIds) {
    await deps.updateTask(id, { parentTaskId: undefined })
  }
  await deps.deleteTask(wrapperId)
  await deps.refetch?.()
}

/**
 * Delete a whole group: every child plus the wrapper. Refetch rebuilds the tree.
 */
export async function deleteTaskGroup(
  wrapperId: string,
  childIds: string[],
  deps: { deleteTask: DeleteFn; refetch?: RefetchFn },
): Promise<void> {
  for (const id of childIds) {
    await deps.deleteTask(id)
  }
  await deps.deleteTask(wrapperId)
  await deps.refetch?.()
}

export interface AddToGroupInput {
  wrapperId: string
  /** Tasks to reparent under the wrapper. */
  taskIds: string[]
  /** Events/routines to attach as group_members refs. */
  memberRefs: GroupMemberRef[]
  /** The wrapper's CURRENT group_members. New refs append to these. */
  existingMemberRefs: GroupMemberRef[]
  date: Date
  isAllDay: boolean
}

/**
 * Add members to a group that already exists. Until this, groups were
 * create-once: `groupItems` builds one and the only way to add was to ungroup
 * and regroup.
 *
 * Note this APPENDS to group_members. `groupItems` replaces the array
 * wholesale, which is right at creation and wrong here — reusing that shape
 * would drop every existing event/routine member on the first addition.
 */
export async function addToGroup(
  input: AddToGroupInput,
  deps: GroupTasksDeps,
): Promise<void> {
  const { wrapperId, taskIds, memberRefs, existingMemberRefs, date, isAllDay } = input

  // De-duplicate against existing members; within-batch duplicates in memberRefs itself are not de-duped.
  const seen = new Set(existingMemberRefs.map((r) => `${r.type}-${r.id}`))
  const fresh = memberRefs.filter((r) => !seen.has(`${r.type}-${r.id}`))

  if (taskIds.length === 0 && fresh.length === 0) return

  for (const id of taskIds) {
    await deps.updateTask(id, { parentTaskId: wrapperId, scheduledFor: date, isAllDay })
  }
  if (fresh.length > 0) {
    await deps.updateTask(wrapperId, { groupMembers: [...existingMemberRefs, ...fresh] })
  }
  await deps.refetch?.()
}
