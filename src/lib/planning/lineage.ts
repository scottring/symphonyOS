// src/lib/planning/lineage.ts
//
// An upper-list row's fate, read from its copy. Placing a month or season TASK
// lower COPIES it (the original stays, so the period's look-back sees the whole
// list); the copy carries source_id. Nothing is stored on the original — its
// state is derived here, at read time, from whatever copy exists. Invisible
// linking, not the sub-goal alignment refused in July.

import type { Task, TaskBucket } from '@/types/task'
import { formatWeekRange } from '@/lib/dateHelpers'

export type PlacementFate = 'open' | 'placed-open' | 'placed-done' | 'done'

/** The newest row copied down from `task`. Paper plans and "Keep" can both
 *  copy the same row; the most recent copy is the one the original reflects. */
export function placedCopyOf(task: Task, tasks: readonly Task[]): Task | undefined {
  let best: Task | undefined
  for (const t of tasks) {
    if (t.id === task.id || t.sourceId !== task.id) continue
    if (!best || t.createdAt.getTime() > best.createdAt.getTime()) best = t
  }
  return best
}

/** The LIVE copy a placement should re-place instead of duplicating.
 *
 *  Placing a month row into a week copies it. Placing it AGAIN — dragged to a
 *  different day, dropped on a different week, the pool chip clicked twice —
 *  used to copy it again, and again: ten rows of "Maybe plan a block potluck
 *  on the porch" landed in twenty seconds on 2026-09-10, each with its own
 *  twin of the note. An original has at most ONE open copy in flight; a
 *  finished copy is history, so a later placement is a genuinely new one. */
export function livePlacedCopyOf(task: Task, tasks: readonly Task[]): Task | undefined {
  let best: Task | undefined
  for (const t of tasks) {
    if (t.id === task.id || t.sourceId !== task.id) continue
    if (t.completed) continue
    if (!isDescent(task.bucket, t.bucket)) continue
    // source_id says "came from", which is not always "is a copy of": a
    // season goal threads its own month steps this way, and those are four
    // DIFFERENT tasks ("Look up music lessons" under "Tried 3 things
    // together"). copyDown carries the title over verbatim, so the title is
    // what separates a copy of this row from a child of it.
    if (t.title !== task.title) continue
    if (!best || t.createdAt.getTime() > best.createdAt.getTime()) best = t
  }
  return best
}

/** Ticking the original is the stronger statement and wins over its copy. */
export function placementFate(task: Task, tasks: readonly Task[]): PlacementFate {
  if (task.completed) return 'done'
  const copy = placedCopyOf(task, tasks)
  if (!copy) return 'open'
  return copy.completed ? 'placed-done' : 'placed-open'
}

const RANK: Partial<Record<TaskBucket, number>> = { quarter: 3, month: 2, week: 1, timed: 0 }

/** A descent is a step DOWN the ladder from a reference list: month → week or
 *  a day; season → month, week or a day. Week → day is a move (the week list
 *  is a checklist, not a reference list); anything sideways or upward is a move. */
export function isDescent(from: TaskBucket | undefined, to: TaskBucket | undefined): boolean {
  if (from !== 'month' && from !== 'quarter') return false
  if (to === undefined) return false
  const f = RANK[from]
  const t = RANK[to]
  return f !== undefined && t !== undefined && t < f
}

/** The rows a pool BADGE should count: untouched ones. A placed original is
 *  still on the list (with its mark) but is no longer asking for a decision. */
export function openPool(pool: readonly Task[], tasks: readonly Task[]): Task[] {
  return pool.filter((t) => placementFate(t, tasks) === 'open')
}

/** Where an upper-list row's copy now lives, for the ONE status a placed row
 *  shows. Two annotations ("→ placed" AND "→ done") read as competing
 *  statuses (Scott, 2026-09-13: "it's unclear whether the checkbox or the
 *  annotation is authoritative"), so the row says one thing — where the work
 *  went — and the tick says whether it's finished. Null when nothing was
 *  copied down. */
export function placedWhere(task: Task, tasks: readonly Task[]): { label: string; id: string; kind: 'week' | 'date' | 'done' | 'placed' } | null {
  const copy = placedCopyOf(task, tasks)
  if (!copy) return null
  // A finished copy says only that it is finished. `tasks` stores no
  // completion time — only a boolean — so "done Sep 15" would be dressing a
  // SCHEDULED date up as the day the work happened (caught in review
  // 2026-09-13). The row links to the copy; the date lives there, correctly
  // labelled. Until tasks carry `completed_at`, this says nothing it can't
  // support.
  if (copy.completed) return { label: 'done', id: copy.id, kind: 'done' }
  if (copy.scheduledFor) {
    return { label: copy.scheduledFor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), id: copy.id, kind: 'date' }
  }
  if (copy.bucket === 'week') {
    return { label: copy.weekStart ? formatWeekRange(copy.weekStart) : 'This week', id: copy.id, kind: 'week' }
  }
  return { label: 'placed', id: copy.id, kind: 'placed' }
}
