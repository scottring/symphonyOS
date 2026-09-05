// src/lib/planning/periodPlacement.ts
//
// Does this bucket='month' (or 'quarter') task belong to the month (season)
// I'm looking at? The twin of lib/today/weekPlacement.ts, and it carries the
// same warning: two predicates that differ only on the NULL row, and mixing
// them up is the bug.
//
// Before this, bucket='month' meant "the current month" and nothing more, so a
// September look-back was impossible — nothing knew what was September's.

import type { Task, TaskBucket } from '@/types/task'
import { localYmd } from '@/lib/cadence/config'
import { readSeasons, seasonStartFor } from '@/lib/cadence/seasons'

/** The 1st of `date`'s month, midnight. */
export function monthStartOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/**
 * Does `task` belong to the month starting `monthStart`? — the POOL question.
 * A row with no month of its own (every row that predates this column) counts:
 * its old meaning was "the current month", and scoping it to one month would
 * make an existing month plan vanish.
 */
export function belongsToMonth(task: { monthStart?: Date }, monthStart: Date): boolean {
  if (!task.monthStart) return true
  return localYmd(task.monthStart) === localYmd(monthStart)
}

/**
 * Was `task` explicitly PLACED on that month? — the MEMBERSHIP question, for
 * surfaces with one row per month (the /plans navigator on a past month). A
 * NULL row is NOT a member, or it repeats in every month you page to.
 */
export function isPlacedOnMonth(task: { monthStart?: Date }, monthStart: Date): boolean {
  if (!task.monthStart) return false
  return localYmd(task.monthStart) === localYmd(monthStart)
}

export function belongsToSeason(task: { seasonStart?: Date }, seasonStart: Date): boolean {
  if (!task.seasonStart) return true
  return localYmd(task.seasonStart) === localYmd(seasonStart)
}

export function isPlacedOnSeason(task: { seasonStart?: Date }, seasonStart: Date): boolean {
  if (!task.seasonStart) return false
  return localYmd(task.seasonStart) === localYmd(seasonStart)
}

/**
 * The month a bucket change implies. Entering the month bucket means THIS
 * month; every other bucket has no month at all. The clear is as important as
 * the stamp — a task sent from the month to the week that kept its month_start
 * would come back in that month's look-back as still open.
 */
export function monthStartForBucket(bucket: TaskBucket, now: Date): Date | undefined {
  return bucket === 'month' ? monthStartOf(now) : undefined
}

/** Same, for the season bucket, from the household's configured boundaries. */
export function seasonStartForBucket(bucket: TaskBucket, now: Date): Date | undefined {
  return bucket === 'quarter' ? seasonStartFor(now, readSeasons()) : undefined
}

/** Does this write move the task in time? The question the is_goal refusal asks. */
export function isPlacement(updates: Partial<Task>): boolean {
  return 'bucket' in updates || 'scheduledFor' in updates || 'weekStart' in updates
    || 'monthStart' in updates || 'seasonStart' in updates
}
