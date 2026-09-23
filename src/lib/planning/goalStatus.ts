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
 * The update that moves a goal to `next`.
 *
 * `periodBucket` is the bucket the goal belongs in when active — 'month' or
 * 'quarter' — so un-archiving returns it to its own period rather than
 * guessing. Returns `null` when nothing would change.
 */
export function goalStatusUpdate(
  task: Pick<Task, 'completed' | 'bucket'>,
  next: GoalStatus,
  periodBucket: 'month' | 'quarter',
): Partial<Task> | null {
  if (goalStatusOf(task) === next) return null
  switch (next) {
    case 'completed':
      // Leave the bucket alone: a completed goal stays on its period's list,
      // which is what the look-back reads.
      return { completed: true }
    case 'archived':
      return { completed: false, bucket: 'someday' }
    default:
      return { completed: false, bucket: periodBucket }
  }
}
