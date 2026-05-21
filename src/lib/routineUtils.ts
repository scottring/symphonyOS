import type { Routine, RecurrencePattern } from '@/types/actionable'

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const

/**
 * True when a routine effectively recurs at least every weekday (>= 5x/week).
 * Covers:
 *   - `daily` (7x/week)
 *   - `weekly` whose selected days cover all five weekdays (Mon–Fri),
 *     which is how NL-parsed "weekdays" routines are persisted (`type:'weekly'`
 *     + `days:['mon','tue','wed','thu','fri']`).
 *   - `specific_days` whose days cover all five weekdays (defensive — same
 *     practical frequency).
 *
 * The visibility toggle (Show daily / Hide daily) controls these specifically;
 * lower-frequency routines (weekend-only `weekly`, ordinary `weekly`,
 * `monthly`, `quarterly`, etc.) are always visible.
 */
export function isEverydayRoutine(rp?: RecurrencePattern | null): boolean {
  if (!rp) return false
  if (rp.type === 'daily') return true
  if ((rp.type === 'weekly' || rp.type === 'specific_days') && rp.days) {
    const set = new Set(rp.days.map(d => d.toLowerCase()))
    return WEEKDAYS.every(d => set.has(d))
  }
  return false
}

/**
 * Format a date as YYYY-MM-DD in local timezone.
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Map of routineId → most recent completion date. Used by 'since_last'
 * recurrence to compute the next due date.
 */
export type LastCompletionMap = Map<string, Date>

/**
 * Check if a routine's recurrence pattern matches a given date.
 * Pure function — no React dependencies.
 *
 * @param lastCompletedAt only required for 'since_last' routines. Pass the
 *        most recent completion timestamp; null/undefined means "never done"
 *        which surfaces the routine immediately.
 */
export function matchesRecurrenceForDate(
  routine: Routine,
  date: Date,
  lastCompletedAt?: Date | null,
): boolean {
  const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()]
  const dayOfMonth = date.getDate()
  const month = date.getMonth() + 1 // 1-12
  const dateStr = formatDateString(date)
  const pattern = routine.recurrence_pattern

  switch (pattern.type) {
    case 'daily': {
      if (pattern.interval && pattern.interval > 1 && pattern.start_date) {
        const startDate = new Date(pattern.start_date)
        const diffTime = date.getTime() - startDate.getTime()
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
        return diffDays >= 0 && diffDays % pattern.interval === 0
      }
      return true
    }
    case 'weekly': {
      if (pattern.interval && pattern.interval > 1 && pattern.start_date) {
        const startDate = new Date(pattern.start_date)
        const diffTime = date.getTime() - startDate.getTime()
        const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7))
        if (diffWeeks < 0 || diffWeeks % pattern.interval !== 0) {
          return false
        }
      }
      return pattern.days?.includes(dayOfWeek) ?? false
    }
    case 'monthly':
      return pattern.day_of_month === dayOfMonth
    case 'quarterly': {
      const quarterMonths = [1, 4, 7, 10]
      if (!quarterMonths.includes(month)) return false
      const targetDay = pattern.day_of_month || 1
      return dayOfMonth === targetDay
    }
    case 'yearly': {
      const targetMonth = pattern.month_of_year || 1
      const targetDay = pattern.day_of_month || 1
      return month === targetMonth && dayOfMonth === targetDay
    }
    case 'specific_days':
      return pattern.dates?.includes(dateStr) ?? false
    case 'since_last': {
      // Surface once N units have passed since the last completion (or
      // immediately if never completed). Stays surfaced every day until
      // the next completion resets the timer — the user requested
      // "show until you check it off."
      if (!lastCompletedAt) return true
      const interval = pattern.interval ?? 1
      const unit = pattern.unit ?? 'weeks'
      const due = new Date(lastCompletedAt)
      if (unit === 'days') due.setDate(due.getDate() + interval)
      else if (unit === 'weeks') due.setDate(due.getDate() + interval * 7)
      else if (unit === 'months') due.setMonth(due.getMonth() + interval)
      return startOfDay(date).getTime() >= startOfDay(due).getTime()
    }
    default:
      return false
  }
}

/**
 * Filter routines that match a given date.
 *
 * @param lastCompletionByRoutine optional map for 'since_last' lookups; if
 *        omitted, since_last routines are treated as never-completed (always due).
 */
export function getRoutinesForDatePure(
  routines: Routine[],
  date: Date,
  lastCompletionByRoutine?: LastCompletionMap,
): Routine[] {
  return routines.filter(r =>
    matchesRecurrenceForDate(r, date, lastCompletionByRoutine?.get(r.id) ?? null),
  )
}
