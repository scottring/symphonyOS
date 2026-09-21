// src/lib/planning/goalSteps.ts
//
// A goal holds the work that serves it. `goal_task_id` names the is_goal row a
// task belongs under; this module is the only place that reads it, so the
// pages stay presentational and the rule lives in one testable spot.
//
// One level only. A step under a step is a hierarchy nobody asked for — the
// planning cadence already has altitudes — so a goalTaskId pointing at a
// non-goal row is ignored and the row stays loose.

import type { Task } from '@/types/task'
import { placementFateOf, type PlacementLevel } from '@/lib/placement/model'

const byCreation = (a: Task, b: Task) => a.createdAt.getTime() - b.createdAt.getTime()

/**
 * Split one period's rows into the three things a plan page draws: its goals,
 * the steps filed under each, and the loose tasks serving no goal.
 *
 * A step renders ONCE — under its goal, never also in the loose list. A step
 * whose goal is not on this list (deleted, carried forward ahead of it, or
 * filtered away by RLS) falls back to loose rather than vanishing: losing
 * sight of a goal must never lose the work under it.
 *
 * Completed steps stay under their goal. The list is the period's record, and
 * the look-back needs to see what got done, not just what didn't.
 */
export function splitGoalRows(rows: readonly Task[]): {
  goals: Task[]
  stepsByGoal: Map<string, Task[]>
  loose: Task[]
} {
  const goals = rows.filter((r) => r.isGoal === true).sort(byCreation)
  const goalIds = new Set(goals.map((g) => g.id))
  const stepsByGoal = new Map<string, Task[]>(goals.map((g) => [g.id, []]))
  const loose: Task[] = []
  for (const row of rows) {
    if (row.isGoal === true) continue
    const parent = row.goalTaskId
    if (parent && goalIds.has(parent)) stepsByGoal.get(parent)!.push(row)
    else loose.push(row)
  }
  for (const steps of stepsByGoal.values()) steps.sort(byCreation)
  loose.sort(byCreation)
  return { goals, stepsByGoal, loose }
}

/**
 * The steps that travel with a goal when it is kept into the next period.
 *
 * Open work only. A finished step is this period's record and stays where it
 * was done; a step already placed lower (on a week, or a day) is carrying on
 * on its own list and is not re-decided here. `level` is the goal's level —
 * "placed lower" is judged from there.
 */
export function stepsThatCarryForward(goalId: string, tasks: readonly Task[], level: PlacementLevel = 'month'): Task[] {
  return tasks
    .filter((t) => t.goalTaskId === goalId && !t.completed && placementFateOf(t, level) === 'open')
    .sort(byCreation)
}

/**
 * Goal id → title, for the quiet line Today and /week draw under a step.
 *
 * Built from the caller's OWN task list, which RLS has already filtered: a
 * goal the reader may not see is simply absent from the map, so its title
 * cannot leak through a step that is shared. Only is_goal rows go in — the
 * same rule splitGoalRows applies, in the same module, so the two cannot drift.
 */
export function goalTitleMap(tasks: readonly Task[]): Map<string, string> {
  return new Map(
    tasks.filter((t) => t.isGoal === true).map((t) => [t.id, t.title] as const),
  )
}
