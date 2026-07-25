// src/lib/today/weekPlacement.ts
//
// One question, asked from six places: does this bucket='week' task belong to
// the week I'm looking at?
//
// Before the placement cascade, bucket='week' meant "the current week" and
// nothing more — so every surface that read it could assume there was only one
// week in play. Now a month move can be placed on a *specific* week, and each
// of those surfaces has to say which week it's showing. This is the predicate
// they all share, so they can't drift apart.

import type { Task } from '@/types/task'
import { localYmd } from '@/lib/cadence/config'

/**
 * Does `task` belong to the week starting `weekStart`?
 *
 * A task with no `weekStart` belongs to whatever week you're looking at. That's
 * every row planned before this shipped (week_start is NULL, no backfill), and
 * their old meaning was the implicit "the current week" — scoping them to one
 * week would make an existing week plan vanish from every other week's view.
 * Nothing disappears; only explicitly placed items are week-scoped.
 */
export function belongsToWeek(task: Pick<Task, 'weekStart'>, weekStart: Date): boolean {
  if (!task.weekStart) return true
  return localYmd(task.weekStart) === localYmd(weekStart)
}
