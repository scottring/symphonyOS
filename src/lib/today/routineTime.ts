import type { ActionableInstance } from '@/types/actionable'

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
  // Moved to another day: it is not on THIS day at all, so the rule time must
  // not stand in as a fallback — that would leave a ghost on the day it left.
  if (instance?.status === 'deferred' && instance.deferred_to) {
    const deferred = new Date(instance.deferred_to)
    return isSameLocalDay(deferred, viewedDate) ? deferred : null
  }

  const override = resolveOverride(instance, viewedDate)
  if (override) return override

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

  if (instance.status === 'pending') return deferred
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
