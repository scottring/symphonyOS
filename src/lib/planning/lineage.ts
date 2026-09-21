// src/lib/planning/lineage.ts
//
// Compatibility surface for the one-enduring-action model (2026-09-21).
//
// This module used to read a row's fate off its COPY (source_id): placing a
// month or season task lower copied it, and the original's "→ placed" chip
// was derived from whatever copy existed. There are no copies any more — the
// row itself carries its commitments and its day — so these two functions now
// read the row and ignore the task list they are still handed. The real
// answers live in lib/placement/model; new code should call those directly.

import type { Task } from '@/types/task'
import { placementFateOf, lowerPlacement, levelForBucket, type PlacementFate } from '@/lib/placement/model'
import { localYmd } from '@/lib/cadence/config'

export type { PlacementFate }

/** The level a row is asked about: its cached bucket's level, else month. */
function levelOf(task: Task): 'season' | 'month' | 'week' {
  return levelForBucket(task.bucket) ?? (task.seasonStart && !task.monthStart ? 'season' : 'month')
}

/** Read off the row. 'placed-done' never occurs any more (one row: done is done). */
export function placementFate(task: Task, _tasks?: readonly Task[]): PlacementFate {
  return placementFateOf(task, levelOf(task))
}

/** Where the row's work has gone, for the ONE status a placed row shows. The
 *  id is the row's own — there is no copy to link to. */
export function placedWhere(task: Task, _tasks?: readonly Task[]): { label: string; id: string; kind: 'week' | 'date' | 'done' | 'placed' } | null {
  if (task.completed) return { label: 'done', id: task.id, kind: 'done' }
  const lower = lowerPlacement(task, levelOf(task))
  if (!lower) return null
  if (lower.kind === 'date') return { label: lower.label, id: task.id, kind: 'date' }
  if (lower.kind === 'week') return { label: lower.label, id: task.id, kind: 'week' }
  if (lower.kind === 'carried') return { label: lower.label, id: task.id, kind: 'placed' }
  return { label: lower.label, id: task.id, kind: 'placed' }
}

/** Kept for callers that still key on a day string. */
export function placedDayKey(task: Task): string | null {
  return task.scheduledFor ? localYmd(task.scheduledFor) : null
}
