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

import type { Task, TaskBucket } from '@/types/task'
import { localYmd } from '@/lib/cadence/config'

/**
 * The week a bucket change implies. Entering the week bucket means THIS week;
 * every other bucket has no week at all.
 *
 * Extracted because the "no week" half and the "this week" half were each a bug
 * waiting to happen. Without the stamp, "carry it forward" on a move left behind
 * by an earlier week was a NO-OP — the task was already `bucket='week'`, so the
 * write changed nothing and the item came back marked late, forever, from the one
 * control meant to resolve it. Without the clear, something sent to the month
 * kept a secret week and would reappear as a stale placement later.
 */
export function weekStartForBucket(bucket: TaskBucket, currentWeekStart: Date): Date | undefined {
  return bucket === 'week' ? currentWeekStart : undefined
}

/**
 * Where a task sits relative to the week you're looking at.
 *
 * - `this-week`   — explicitly placed on the viewed week.
 * - `later`       — explicitly placed on a week still ahead.
 * - `left-behind` — placed on a week that has already passed, and it never got
 *                   a day. This is the state the weekly carry-over exists for.
 * - `unplaced`    — in the week bucket with no week of its own (`week_start`
 *                   NULL): every row that predates the placement cascade, plus
 *                   anything added straight to "this week" before the stamp
 *                   existed. Its old, implicit meaning was "the current week".
 * - `not-week`    — not a `bucket='week'` task at all (or completed).
 *
 * Every question below is a slice of this one answer, and they differ in how
 * they treat `unplaced` — which is exactly where the bugs live, so each
 * predicate says which slice it takes and why.
 */
export type WeekPlacementState = 'this-week' | 'later' | 'left-behind' | 'unplaced' | 'not-week'

export function weekPlacementState(
  task: Pick<Task, 'weekStart' | 'bucket' | 'completed'>,
  viewedWeekStart: Date,
): WeekPlacementState {
  if (task.completed || task.bucket !== 'week') return 'not-week'
  if (!task.weekStart) return 'unplaced'
  const own = localYmd(task.weekStart)
  const viewed = localYmd(viewedWeekStart)
  if (own === viewed) return 'this-week'
  return own < viewed ? 'left-behind' : 'later'
}

/**
 * Does `task` belong to the week starting `weekStart`? — the POOL question.
 *
 * `unplaced` counts: those rows' old meaning was the implicit "the current
 * week", and scoping them to one week would make an existing week plan vanish
 * from every other week's view. Nothing disappears; only explicitly placed
 * items are week-scoped.
 *
 * Deliberately answers no for `left-behind`: a stranded placement is surfaced
 * as carry-over instead (see `isStaleWeekPlacement`), not silently mixed into
 * whatever week you happen to open.
 *
 * Takes only `weekStart` for callers that have already filtered on bucket and
 * completion themselves.
 */
export function belongsToWeek(task: Pick<Task, 'weekStart'>, weekStart: Date): boolean {
  if (!task.weekStart) return true
  return localYmd(task.weekStart) === localYmd(weekStart)
}

/**
 * Was `task` explicitly PLACED on the week starting `weekStart`? — the
 * MEMBERSHIP question, and the strict twin of `belongsToWeek`.
 *
 * `unplaced` does NOT count. A surface that renders one row per week — the
 * month grid — must not treat a task with no week of its own as a member, or
 * it repeats in all six rows of the month.
 */
export function isPlacedOnWeek(task: Pick<Task, 'weekStart'>, weekStart: Date): boolean {
  if (!task.weekStart) return false
  return localYmd(task.weekStart) === localYmd(weekStart)
}

/**
 * Was `task` left behind by a week that has already passed? — the CARRY-OVER
 * question.
 *
 * A move placed on a week that never got a day. Nothing rolls it forward on its
 * own (that was the explicit decision: no silent movement), so it would sit on
 * a past week no one will ever open again — the week pool won't show it, and
 * the month row it came from has moved on. This is what puts it back in front
 * of you, marked, on the current week.
 *
 * `unplaced` does NOT count: with no week of its own, it isn't late — it's
 * still in the current week's pool, right where it has always been.
 */
export function isStaleWeekPlacement(
  task: Pick<Task, 'weekStart' | 'bucket' | 'completed'>,
  viewedWeekStart: Date,
): boolean {
  return weekPlacementState(task, viewedWeekStart) === 'left-behind'
}

/**
 * Must the weekly review ask about `task`? — the VERDICT question.
 *
 * "Last week's list" means everything in the week bucket that has no explicit
 * claim on the week being planned: the `left-behind` placements AND the
 * `unplaced` rows, which have been sitting in the bucket without ever being
 * given a week. Both need a fate; neither gets to just linger.
 *
 * Excludes `this-week` and `later` — those were deliberately placed for the
 * week being planned or one after it, so asking "carry forward or let go?"
 * about them is noise. Before the cascade this filter was simply
 * `bucket === 'week'`, which now means the month's future placements would show
 * up under "last week's list".
 */
export function needsWeekVerdict(
  task: Pick<Task, 'weekStart' | 'bucket' | 'completed'>,
  viewedWeekStart: Date,
): boolean {
  const state = weekPlacementState(task, viewedWeekStart)
  return state === 'left-behind' || state === 'unplaced'
}
