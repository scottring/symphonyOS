// src/lib/cadence/guidingGoals.ts
//
// The "guiding goals" strip on the Month/Season rungs shows this season's goal
// moves. Raw, that's a wall of rows that drowns the page — so we group moves
// under their goal and detect which are already IN MOTION in this horizon's
// pool (via the move's linked project, or a task created straight from the
// move). In-motion moves show progress instead of asking to be planned again.

import type { Goal, GoalAction } from '@/types/goal'
import type { Task } from '@/types/task'

export interface GuidingMove {
  action: GoalAction
  /** Open tasks in this horizon's pool that already serve this move. */
  inMotion: number
}

export interface GuidingGoalGroup {
  goal: Goal
  moves: GuidingMove[]
}

/** Group season goal-actions by their goal, tagging each with how many open
 *  pool tasks already serve it (same linked project, or a task titled after
 *  the move — what "Plan it" creates). */
export function groupGuidingGoals(
  pairs: Array<{ action: GoalAction; goal: Goal }>,
  pool: Task[],
): GuidingGoalGroup[] {
  const groups = new Map<string, GuidingGoalGroup>()
  for (const { action, goal } of pairs) {
    const inMotion = pool.filter(
      (t) =>
        !t.completed &&
        ((action.projectId && t.projectId === action.projectId) || t.title === action.description),
    ).length
    const g = groups.get(goal.id) ?? { goal, moves: [] }
    g.moves.push({ action, inMotion })
    groups.set(goal.id, g)
  }
  return [...groups.values()]
}

/** Summary counts for the collapsed strip header. */
export function guidingGoalsSummary(groups: GuidingGoalGroup[]): {
  goals: number
  moves: number
  inMotion: number
} {
  const moves = groups.flatMap((g) => g.moves)
  return {
    goals: groups.length,
    moves: moves.length,
    inMotion: moves.filter((m) => m.inMotion > 0).length,
  }
}
