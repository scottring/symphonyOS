// src/lib/planning/goalSupport.ts
//
// A goal can support the goal one rung above it: a month goal supports a
// season goal, a season goal supports a year goal. This module is the only
// place that reads those two links, so the pages stay presentational and the
// rules live in one testable spot — the same arrangement goalSteps.ts has for
// `goal_task_id`.
//
// Deliberately NOT goal_task_id. That says "is a step of", and a goal's open
// steps are carried along when the goal is kept forward. Support points UP,
// from child to parent, and no writer of a task ever touches it — so moving or
// carrying forward a task leaves every goal relationship exactly as it was.
//
//   month goal  → season goal   `supportsGoalTaskId` (a tasks row)
//   season goal → year goal     `goalId`             (a goals row)
//
// A link whose shape no longer holds — the parent is gone, or is not a goal,
// or is not the rung above — is IGNORED rather than drawn wrong. The stored
// value is left alone: it is a record of a decision, and a later repair can
// still read it.

import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { seasonLabel, type Seasons } from '@/lib/cadence/seasons'

export type GoalRung = 'month' | 'season' | 'year'

export interface SupportLink {
  id: string
  title: string
  /** The rung the linked goal sits on — what the label in front of it means. */
  rung: GoalRung
  /** "Fall 2026", "October" — where to find it. Absent when it has no period
   *  of its own (a year goal is named by its year in `title`'s context). */
  period?: string
}

const isMonthGoal = (t: Task) => t.isGoal === true && t.bucket === 'month'
const isSeasonGoal = (t: Task) => t.isGoal === true && t.bucket === 'quarter'

const monthName = (d: Date | undefined) =>
  d ? d.toLocaleDateString('en-US', { month: 'long' }) : undefined

/**
 * The goal this one supports, or null.
 *
 * `tasks` and `goals` are the caller's own lists, which RLS has already
 * filtered — a parent the reader may not see is simply absent, so its title
 * cannot leak through a child that is shared. Same rule goalTitleMap follows.
 */
export function supportedGoal(
  goal: Task,
  tasks: readonly Task[],
  goals: readonly Goal[],
  seasons: Seasons,
): SupportLink | null {
  if (goal.isGoal !== true) return null

  if (isMonthGoal(goal)) {
    const parentId = goal.supportsGoalTaskId
    if (!parentId || parentId === goal.id) return null
    const parent = tasks.find((t) => t.id === parentId)
    if (!parent || !isSeasonGoal(parent)) return null
    return {
      id: parent.id,
      title: parent.title,
      rung: 'season',
      period: parent.seasonStart ? seasonLabel(parent.seasonStart, seasons) : undefined,
    }
  }

  if (isSeasonGoal(goal)) {
    const parent = goal.goalId ? goals.find((g) => g.id === goal.goalId) : undefined
    if (!parent || parent.status === 'archived') return null
    return { id: parent.id, title: parent.name, rung: 'year', period: String(parent.year) }
  }

  return null
}

/** The month goals that support this season goal, oldest first. */
export function monthGoalsSupporting(seasonGoalId: string, tasks: readonly Task[]): SupportLink[] {
  return tasks
    .filter((t) => isMonthGoal(t) && t.supportsGoalTaskId === seasonGoalId && t.id !== seasonGoalId)
    .sort(byCreation)
    .map((t) => ({ id: t.id, title: t.title, rung: 'month' as const, period: monthName(t.monthStart) }))
}

/** The season goals that support this year goal, oldest first. */
export function seasonGoalsSupporting(
  yearGoalId: string,
  tasks: readonly Task[],
  seasons: Seasons,
): SupportLink[] {
  return tasks
    .filter((t) => isSeasonGoal(t) && t.goalId === yearGoalId)
    .sort(byCreation)
    .map((t) => ({
      id: t.id,
      title: t.title,
      rung: 'season' as const,
      period: t.seasonStart ? seasonLabel(t.seasonStart, seasons) : undefined,
    }))
}

/** The goals one rung down that support this one, whichever rung it is on.
 *  A month goal is a leaf — nothing plans below it — so it gets nothing. */
export function goalsSupporting(goal: Task, tasks: readonly Task[]): SupportLink[] {
  if (isSeasonGoal(goal)) return monthGoalsSupporting(goal.id, tasks)
  return []
}

function byCreation(a: Task, b: Task) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}
