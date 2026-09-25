// src/lib/planning/goalStatus.ts
//
// A month or season goal's status, in the vocabulary year goals already use:
// active · completed · archived (`GoalStatus` in types/goal.ts).
//
// Those goals are `tasks` rows distinguished by `is_goal`, so the three states
// are expressed in the fields a task already has, rather than a fourth concept:
//
//   active     open, sitting in its period's bucket (month / quarter)
//   completed  `completed` — the outcome happened
//   archived   `bucket: 'someday'` — the app's existing park, which the plan
//              rows already draw with an Archive icon (`PlanRow.tsx:65`)
//
// Removing the task-style checkbox from the goal page (walk finding S2-06) took
// away the only way to close a goal; Scott, 2026-09-23: "the goal page needs an
// obvious status control: Active, Completed, Archived". Archiving never
// deletes: the row keeps its title, its steps and its period.

import type { GoalStatus } from '@/types/goal'
import type { Task } from '@/types/task'

export const GOAL_STATUSES: GoalStatus[] = ['active', 'completed', 'archived']

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
}

export const GOAL_STATUS_HINT: Record<GoalStatus, string> = {
  active: 'Still what this period is for.',
  completed: 'The outcome happened.',
  archived: 'Set aside. The goal and its steps are kept.',
}

export function goalStatusOf(task: Pick<Task, 'completed' | 'bucket'>): GoalStatus {
  if (task.completed) return 'completed'
  if (task.bucket === 'someday') return 'archived'
  return 'active'
}

/**
 * The update that moves a goal to `next`, or `null` when nothing would change
 * — or when the move cannot be expressed.
 *
 * It carries ONLY `completed`. A goal may not be placed: `updateTask` refuses
 * any write to a goal that touches a placement key and shows "Goals aren\u2019t
 * scheduled" (`useSupabaseTasks.ts:1614`). The first version of this control
 * sent `{ completed: false, bucket: 'month' }`, so the whole write was refused
 * and Active did nothing at all — a goal ticked by accident could not be
 * reopened from its own page (2026-09-24).
 *
 * `archived` therefore returns null: parking a month or season goal would mean
 * `bucket: 'someday'`, which is a placement. Year goals have a real `status`
 * column; these do not. See `canSetGoalStatus`.
 */
export function goalStatusUpdate(
  task: Pick<Task, 'completed' | 'bucket'>,
  next: GoalStatus,
): Partial<Task> | null {
  if (goalStatusOf(task) === next) return null
  if (next === 'archived') return null
  return { completed: next === 'completed' }
}

/** Whether this control can actually carry out `status` on a month or season goal. */
export function canSetGoalStatus(status: GoalStatus): boolean {
  return status !== 'archived'
}
