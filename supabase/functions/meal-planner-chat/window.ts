// The week the chat plans is the week the Meals page shows: seven days from
// the household's week start (2026-10-24; see src/lib/mealWeek.ts). Meals stay
// stored under the Sunday week of their date, so a Saturday-start week draws
// on two stored weeks. A weekday (0 = Sunday .. 6 = Saturday, Date.getDay())
// names exactly one date inside any seven-day window. All dates are
// YYYY-MM-DD and the math is UTC, so no timezone can drift a day.
//
// Dates and the stored week come from _shared/mealDays.ts, the same rules
// Symphony's own meal tools (symphony-agent/meals.ts) use.

import { addDays, parseIsoDate, weekOf } from '../_shared/mealDays.ts'

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const addDaysIso = addDays
export const weekdayOf = (iso: string) => weekOf(iso).dayOfWeek
/** The Sunday week a date is stored under. */
export const sundayOf = (iso: string) => weekOf(iso).weekStart

/** The date a weekday names in the window, and the Sunday week holding it. */
export function dayInWindow(windowStart: string, dayOfWeek: number): { date: string; week: string } {
  const date = addDaysIso(windowStart, (dayOfWeek - weekdayOf(windowStart) + 7) % 7)
  return { date, week: sundayOf(date) }
}

/** The stored weeks the window draws on, and the one holding most of its
 *  days, which carries the window's planned-days range. */
export function windowWeeks(windowStart: string): { weeks: string[]; anchor: string } {
  const weeks = [...new Set(Array.from({ length: 7 }, (_, i) => sundayOf(addDaysIso(windowStart, i))))]
  return { weeks, anchor: sundayOf(addDaysIso(windowStart, 3)) }
}

/** A stored meal's date, when it falls inside the window. */
export function dateInWindow(windowStart: string, week: string, dayOfWeek: number): string | null {
  const date = addDaysIso(week, dayOfWeek)
  return date >= windowStart && date <= addDaysIso(windowStart, 6) ? date : null
}

/** Strict day_of_week guard: only an actual integer number 0-6 passes.
 *  `Number(...)` coercion would silently accept `null` (-> 0), `true`
 *  (-> 1), `""` (-> 0), etc — reject those instead of miscoercing them. */
export function strictDayOfWeek(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 6) return null
  return v
}

/** The day a set_slot / clear_slot call means. `date` (YYYY-MM-DD) is the
 *  address, as in Symphony's meal tools; `day_of_week` is still taken from an
 *  older conversation. Either must land inside the week being planned. */
export function slotDay(windowStart: string, input: { date?: unknown; day_of_week?: unknown }):
  { date: string; week: string; dayOfWeek: number } | { error: string } {
  const windowEnd = addDaysIso(windowStart, 6)
  const hasDate = input.date !== undefined && input.date !== null && input.date !== ''
  const dow = input.day_of_week === undefined || input.day_of_week === null ? null : strictDayOfWeek(input.day_of_week)
  if (input.day_of_week !== undefined && input.day_of_week !== null && dow === null) {
    return { error: 'Error: day_of_week must be an integer 0-6 (0=Sunday..6=Saturday).' }
  }
  if (hasDate) {
    const date = parseIsoDate(input.date)
    if (!date) return { error: 'Error: date must be YYYY-MM-DD.' }
    if (date < windowStart || date > windowEnd) {
      return { error: `Error: ${date} is outside the week being planned (${windowStart} to ${windowEnd}).` }
    }
    const { weekStart, dayOfWeek } = weekOf(date)
    if (dow !== null && dow !== dayOfWeek) {
      return { error: `Error: ${date} is a ${DAY_NAMES[dayOfWeek]}, not day_of_week ${dow}. Send the date alone.` }
    }
    return { date, week: weekStart, dayOfWeek }
  }
  if (dow === null) return { error: 'Error: give the date (YYYY-MM-DD) inside the week being planned.' }
  const day = dayInWindow(windowStart, dow)
  return { ...day, dayOfWeek: dow }
}

/** "Saturday Oct 24". */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${DAY_NAMES[date.getUTCDay()]} ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
}
