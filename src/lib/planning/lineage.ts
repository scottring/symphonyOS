// src/lib/planning/lineage.ts
//
// Pure helpers for the planning-cascade thread (2026-07-15_task_lineage).
// Copy-down duplicates a row by design; these functions make the duplicates
// legible: what to stamp on a copy, where an item came from, and how a goal's
// progress rolls up from every task that serves it.

import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'

/** What a copy inherits from the row it was copied down from: the source link
 *  itself, plus the goal thread (so roll-up stays a flat filter — a week task
 *  three copies deep still carries the year goal's id). */
export function inheritedLineage(source: Pick<Task, 'id' | 'goalId'>): { sourceId: string; goalId?: string } {
  return { sourceId: source.id, goalId: source.goalId }
}

/** Walk sourceId upward (bounded, cycle-safe) and return ancestor titles,
 *  nearest first, ending with the goal name when the thread reaches one.
 *  Empty array = no lineage recorded (all pre-migration tasks). */
export function lineageTrail(
  task: Pick<Task, 'sourceId' | 'goalId'>,
  tasksById: Map<string, Task>,
  goalsById: Map<string, Goal>,
  maxHops = 4,
): string[] {
  const trail: string[] = []
  const seen = new Set<string>()
  let cursor = task.sourceId
  let goalId = task.goalId
  while (cursor && trail.length < maxHops && !seen.has(cursor)) {
    seen.add(cursor)
    const parent = tasksById.get(cursor)
    if (!parent) break
    // Copy-down carries the same title down each rung — collapse consecutive
    // repeats so a chain never renders "← X ← X".
    if (trail[trail.length - 1] !== parent.title) trail.push(parent.title)
    goalId = goalId ?? parent.goalId
    cursor = parent.sourceId
  }
  if (goalId) {
    const goal = goalsById.get(goalId)
    // Skip the goal name when it duplicates the nearest ancestor title (a
    // promoted goal's season task shares its name — "← X ← X" reads broken).
    if (goal && trail[trail.length - 1] !== goal.name) trail.push(goal.name)
  }
  return trail
}

/** One quiet breadcrumb string ("← Ship auth layer ← Firebase rebuild"),
 *  or null when there is no thread to show. */
export function lineageLabel(
  task: Pick<Task, 'sourceId' | 'goalId'>,
  tasksById: Map<string, Task>,
  goalsById: Map<string, Goal>,
): string | null {
  const trail = lineageTrail(task, tasksById, goalsById)
  return trail.length > 0 ? '← ' + trail.join(' ← ') : null
}

export interface GoalRollup {
  /** LEAF tasks serving this goal — the most concrete copy of each thread. */
  total: number
  done: number
}

/** Leaf-altitude roll-up: every task stamped with this goal's id that has NOT
 *  been copied further down. Copy-down duplicates by design (a season pick, its
 *  month move, its week copy all carry the goal id), so counting every altitude
 *  inflated the denominator once per descent — finish the one real action and
 *  the year page read "1 of 2 moves done". A task some other task points at via
 *  sourceId is a rung of the descent, not a move of its own; the leaf carries
 *  the truth. Deliberately NOT completion propagation: a pick isn't done
 *  because one errand under it is — it simply doesn't count as a second move.
 *  (Set-aside clears the copy's sourceId, so an abandoned descent hands the
 *  count back to the parent.) */
export function goalRollup(goalId: string, tasks: readonly Task[]): GoalRollup {
  const copiedDown = new Set<string>()
  for (const t of tasks) {
    if (t.sourceId) copiedDown.add(t.sourceId)
  }
  let total = 0
  let done = 0
  for (const t of tasks) {
    if (t.goalId !== goalId) continue
    if (copiedDown.has(t.id)) continue
    total += 1
    if (t.completed) done += 1
  }
  return { total, done }
}

/** Goals with no task serving them in the given bucket (the seasonal coach's
 *  "which year goals has this season not touched" read). */
export function goalsWithoutMoves(
  goals: readonly Goal[],
  tasks: readonly Task[],
  bucket: Task['bucket'],
): Goal[] {
  const covered = new Set<string>()
  for (const t of tasks) {
    if (t.goalId && t.bucket === bucket) covered.add(t.goalId)
  }
  return goals.filter((g) => g.status === 'active' && !covered.has(g.id))
}
