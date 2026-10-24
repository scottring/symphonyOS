// The week the chat plans is the week the Meals page shows: seven days from
// the household's week start (2026-10-24; see src/lib/mealWeek.ts). Meals stay
// stored under the Sunday week of their date, so a Saturday-start week draws
// on two stored weeks. A weekday (0 = Sunday .. 6 = Saturday, Date.getDay())
// names exactly one date inside any seven-day window. All dates are
// YYYY-MM-DD and the math is UTC, so no timezone can drift a day.

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
export const addDaysIso = (iso: string, days: number) => {
  const d = utc(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
export const weekdayOf = (iso: string) => utc(iso).getUTCDay()
/** The Sunday week a date is stored under. */
export const sundayOf = (iso: string) => addDaysIso(iso, -weekdayOf(iso))

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

/** "Saturday Oct 24". */
export function dayLabel(iso: string): string {
  const d = utc(iso)
  return `${DAY_NAMES[d.getUTCDay()]} ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
}
