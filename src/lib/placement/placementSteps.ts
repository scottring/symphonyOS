// src/lib/placement/placementSteps.ts
//
// A placement save as ONE transaction — the client half of
// public.apply_task_placement (supabase/migrations/2026-09-25_apply_task_placement.sql,
// prepared for review, not applied).
//
// OFF BY DEFAULT. Nothing here is used unless the build sets
// VITE_PLACEMENT_RPC=true, and that must not happen before the migration is
// applied and reviewed (docs/planning/2026-09-25-transactional-placement-review.md).
// With the switch off every writer sends exactly the requests it sent before.
//
// The steps are the writes a saver would otherwise send one request at a
// time, in the saver's own order — so a successful save ends in the same
// state either way, and only a failure changes: rolled back, not split.

import { localYmd } from '@/lib/cadence/config'
import type { CommitmentOp, FocusOp } from './intentions'
import type { Task } from '@/types/task'

export type PlacementStep =
  | { t: 'row'; set: Record<string, unknown> }
  | { t: 'ensure' | 'remove'; level: string; period_start: string }
  | { t: 'carry'; level: string; period_start: string; to: string }
  | { t: 'focus_set'; user_id: string; date: string }
  | { t: 'focus_clear'; user_id: string; date: string | null }

/** The columns the function will write — keep in step with `allowed` in the migration. */
export const PLACEMENT_ROW_COLUMNS: readonly string[] = [
  'bucket', 'week_start', 'month_start', 'season_start', 'weekend_start',
  'scheduled_for', 'is_all_day', 'planned_on', 'defer_count', 'deferred_until', 'week_deferred_at',
]

/** The build switch. Read on every call so a test can flip it. */
export function placementRpcEnabled(): boolean {
  return import.meta.env.VITE_PLACEMENT_RPC === 'true'
}

/** A row write the function accepts: placement columns only, and at least one. */
export function isPlacementOnlyRow(dbRow: Record<string, unknown>): boolean {
  const keys = Object.keys(dbRow)
  return keys.length > 0 && keys.every((k) => PLACEMENT_ROW_COLUMNS.includes(k))
}

export function rowStep(dbRow: Record<string, unknown>): PlacementStep {
  return { t: 'row', set: dbRow }
}

export function commitmentStep(op: CommitmentOp): PlacementStep | null {
  const period_start = localYmd(op.periodStart)
  if (op.op === 'ensure' || op.op === 'remove') return { t: op.op, level: op.level, period_start }
  if (op.op === 'carry') return { t: 'carry', level: op.level, period_start, to: localYmd(op.to) }
  // 'done' / 'reopen' are the completion trigger's, never sent (writePlacementOps skips them too).
  return null
}

export function focusStep(op: FocusOp): PlacementStep {
  return op.op === 'set'
    ? { t: 'focus_set', user_id: op.userId, date: localYmd(op.date) }
    : { t: 'focus_clear', user_id: op.userId, date: op.date ? localYmd(op.date) : null }
}

export function commitmentSteps(ops: readonly CommitmentOp[]): PlacementStep[] {
  return ops.map(commitmentStep).filter((s): s is PlacementStep => s !== null)
}

/**
 * The open period records a plan was made from — the function refuses the
 * save (40001) if the database no longer holds exactly these. Null when the
 * task's records were never read: the caller must re-read before planning.
 */
export function expectedOpen(task: Task): Array<{ level: string; period_start: string }> | null {
  if (!task.commitments) return null
  return task.commitments
    .filter((c) => c.status === 'open')
    .map((c) => ({ level: c.level, period_start: localYmd(c.periodStart) }))
}

/** The outcome of one transactional save. `stale`: refused, nothing written,
 *  the plan was made from a state another save has replaced. `failed`: the
 *  outcome is not known for certain (an error, or a lost response after a
 *  commit) — the caller must re-read before trusting either state. */
export type AtomicOutcome = 'ok' | 'stale' | 'failed'

export const STALE_PLACEMENT_MESSAGE = 'This changed somewhere else — it has been refreshed. Try again.'
