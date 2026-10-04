import type { ActionableInstance } from '@/types/actionable'
import { isDayOnlyMove } from './deferredRoutines'

/**
 * The time a routine actually occupies on a given day, or null if it has none.
 *
 * A drag writes a ONE-DAY override to `actionable_instances.deferred_to` rather
 * than rewriting `recurrence_pattern` — one drag must not move every future
 * occurrence. So `routine.time_of_day` is the RULE, not the answer, and any
 * reader that consults it alone silently ignores every drag the user made.
 *
 * Null means untimed for this day: the routine belongs in an unscheduled lane,
 * not at some invented position on the grid.
 *
 * This is deliberately the one place that resolution lives. Two copies is how
 * the Today timeline and the time-block grid ended up disagreeing about where a
 * dropped routine goes.
 */
export function resolveRoutineTime(
  routine: { time_of_day?: string | null },
  instance: ActionableInstance | undefined,
  viewedDate: Date,
): Date | null {
  // Moved to a day without a time: untimed wherever it is, including the day
  // it landed on (whose midnight `deferred_to` is a day, not 12:00 AM).
  if (isDayOnlyMove(instance)) return null

  // The same move written without its marker (a bare date from a "push"
  // menu or a bulk All-day schedule): a deferral to ANOTHER day at local
  // midnight is a day, not 12:00 AM — unless midnight is the routine's own
  // time (2026-10-04: Saturday's routines drawn at "12a" on Sunday). A
  // midnight on its own day is a time placed on the grid, and stays.
  if (instance?.status === 'deferred' && instance.deferred_to && isLocalMidnight(new Date(instance.deferred_to))
    && localYmdOf(new Date(instance.deferred_to)) !== instance.date && !atMidnight(routine.time_of_day)) return null

  // Moved to another day: it is not on THIS day at all, so the rule time must
  // not stand in as a fallback — that would leave a ghost on the day it left.
  if (instance?.status === 'deferred' && instance.deferred_to) {
    const deferred = new Date(instance.deferred_to)
    return isSameLocalDay(deferred, viewedDate) ? deferred : null
  }

  const override = resolveOverride(instance, viewedDate)
  if (override) return override

  // An untimed routine placed at a time on this day has no rule slot to fall
  // back to: once it is done (or skipped), the placed time is still the only
  // place it has. Dropping it made a ticked occurrence vanish from Today —
  // untimed and unchosen, it left the main list (2026-09-23).
  if (!routine.time_of_day && instance?.deferred_to && (instance.status === 'completed' || instance.status === 'skipped')) {
    const placed = new Date(instance.deferred_to)
    if (isSameLocalDay(placed, viewedDate)) return placed
  }

  if (routine.time_of_day) {
    // Postgres `time` columns arrive as "19:30:00"; extra parts are ignored.
    const [hours, minutes] = routine.time_of_day.split(':').map(Number)
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      const start = new Date(viewedDate)
      start.setHours(hours, minutes, 0, 0)
      return start
    }
  }

  return null
}

/**
 * A `deferred_to` timestamp counts as this day's time when the instance is
 * still pending (a same-day retime), or when it was deferred onto the day being
 * viewed. A completed or skipped instance keeps its original slot — its
 * `deferred_to` is history, not intent.
 */
function resolveOverride(
  instance: ActionableInstance | undefined,
  viewedDate: Date,
): Date | null {
  if (!instance?.deferred_to) return null
  const deferred = new Date(instance.deferred_to)

  if (instance.status === 'pending' && isSameLocalDay(deferred, viewedDate)) return deferred
  if (instance.status === 'deferred' && isSameLocalDay(deferred, viewedDate)) return deferred
  return null
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isLocalMidnight(d: Date): boolean {
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0
}

function atMidnight(timeOfDay: string | null | undefined): boolean {
  if (!timeOfDay) return false
  const [h, m] = timeOfDay.split(':').map(Number)
  return h === 0 && m === 0
}

function localYmdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
