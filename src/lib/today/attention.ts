/**
 * What needs attention, and why — Today's one bounded signal.
 *
 * Expiry (see `taskPools.ts`) gave DATED work a lifecycle: today, carried over,
 * slipped. Placed-but-undated work never had one. A task placed on a week that
 * passed, or captured to the inbox and forgotten, sat in a legitimate home that
 * no daily surface rendered — which is how three real tasks were believed lost
 * on 2026-08-04.
 *
 * This is the read-side answer, and it never writes. `week_start` is not
 * rolled forward and `scheduled_for` is not cleared: the stale value IS the age
 * signal, and a wrong filter is a one-line fix where a wrong migration against
 * the only copy of someone's life is not.
 *
 * Composed from the existing predicates rather than reimplementing them, so the
 * definitions cannot drift.
 */

import type { Task } from '@/types/task'
import { selectSlipped, type Match } from './taskPools'
import { isStaleWeekPlacement } from './weekPlacement'

export type AttentionReason = 'slipped' | 'stranded-week' | 'aging-month' | 'aging-inbox'

/**
 * How long capture may sit before it counts as rotting. Two weeks is long
 * enough that ordinary weekly triage never trips it, short enough that a
 * forgotten item surfaces while its context is still recoverable.
 */
export const AGING_INBOX_DAYS = 14

/**
 * The month bucket has no month.
 *
 * `tasks` carries exactly one period anchor, `week_start`, so a month-bucket
 * task cannot be "placed on a month that passed" — there is nothing to compare.
 * Rather than invent an anchor, this measures the honest thing: how long the
 * item has sat in the bucket. 45 days covers a full month plus slack, so a
 * genuine this-month placement never trips it.
 */
export const AGING_MONTH_DAYS = 45

export interface AttentionItem {
  task: Task
  reason: AttentionReason
  ageDays: number
}

/** Whole days between two instants, both floored to local midnight. */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from)
  a.setHours(0, 0, 0, 0)
  const b = new Date(to)
  b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/**
 * Age from `createdAt`, never `updatedAt`.
 *
 * `tasks` has no `updated_at` trigger (unlike contacts, projects, event_notes),
 * so that column is written only when app code happens to set it. Measuring
 * from it would under-report age on exactly the oldest items — the ones this
 * signal exists to catch.
 */
function ageDays(task: Task, now: Date): number {
  return daysBetween(task.createdAt, now)
}

export function selectNeedsAttention(
  tasks: Task[],
  match: Match,
  now: Date,
  weekStart: Date,
): AttentionItem[] {
  const out: AttentionItem[] = []
  const claimed = new Set<string>()

  const push = (task: Task, reason: AttentionReason, age: number) => {
    if (claimed.has(task.id)) return
    claimed.add(task.id)
    out.push({ task, reason, ageDays: age })
  }

  // Dated work past its grace window. `isToday` is true because attention is
  // only ever computed for the live day.
  for (const task of selectSlipped(tasks, true, match, now)) {
    if (task.completed) continue
    push(task, 'slipped', daysBetween(task.scheduledFor as Date, now))
  }

  for (const task of tasks) {
    if (task.completed) continue
    if (!match(task.assignedTo, task.assignedToAll)) continue

    if (task.bucket === 'week') {
      // NULL weekStart means "the current week" — not late. Future weeks are
      // deliberate. Only a week already passed is stranded.
      if (isStaleWeekPlacement(task, weekStart)) {
        push(task, 'stranded-week', ageDays(task, now))
      }
      continue
    }

    if (task.bucket === 'month') {
      const age = ageDays(task, now)
      if (age > AGING_MONTH_DAYS) push(task, 'aging-month', age)
      continue
    }

    if (task.bucket === 'inbox') {
      const age = ageDays(task, now)
      if (age > AGING_INBOX_DAYS) push(task, 'aging-inbox', age)
      continue
    }

    // 'someday' is deliberately absent. Someday means "no timeline"; aging it
    // would make the count un-drainable, which is the exact failure this
    // design exists to avoid.
  }

  return out
}
