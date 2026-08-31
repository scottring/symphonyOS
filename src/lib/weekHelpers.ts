const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** Returns the Sunday at the start of the week containing the given date.
 *
 *  Convention: 0=Sun, 1=Mon, ..., 6=Sat — matches `Date.getDay()` directly,
 *  no offset arithmetic. */
export function sundayOfWeek(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  date.setDate(date.getDate() - day)
  date.setHours(0, 0, 0, 0)
  return date
}

export function dayLabelFor(dayOfWeek: number): string {
  return DAY_LABELS[dayOfWeek] ?? '?'
}

export function isToday(d: Date): boolean {
  const today = new Date()
  return d.getFullYear() === today.getFullYear()
    && d.getMonth() === today.getMonth()
    && d.getDate() === today.getDate()
}

export function formatDateMonthDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function dateForDayOfWeek(weekStart: Date, dayOfWeek: number): Date {
  const result = new Date(weekStart)
  result.setDate(result.getDate() + dayOfWeek)
  return result
}

export interface ActiveDayRange {
  firstDay: number
  lastDay: number
}

/** Day-of-week bounds (0=Sun..6=Sat) of a plan's active range within its week.
 *  `startsOn`/`endsOn` are ISO dates (YYYY-MM-DD) or null; null = unbounded on
 *  that side, so (null, null) is the full week. Out-of-week dates clamp into
 *  0..6 and an inverted range collapses to a single day, so a malformed row
 *  can never produce an empty or negative grid. */
export function activeDayRange(weekStart: Date, startsOn: string | null, endsOn: string | null): ActiveDayRange {
  const firstDay = startsOn ? dayIndexInWeek(weekStart, startsOn) : 0
  const lastDay = endsOn ? dayIndexInWeek(weekStart, endsOn) : 6
  return lastDay < firstDay ? { firstDay, lastDay: firstDay } : { firstDay, lastDay }
}

function dayIndexInWeek(weekStart: Date, iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const start = new Date(weekStart)
  start.setHours(0, 0, 0, 0)
  // Math.round absorbs the one-hour DST drift inside a week.
  const diff = Math.round((date.getTime() - start.getTime()) / 86400000)
  return Math.min(6, Math.max(0, diff))
}

/** Format a Date as YYYY-MM-DD using local time. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Calendar-fetch span for the Week bench (`/week`): the whole week containing
 *  `d`, wide enough for either anchor in play — HomeView seeds `weekStart` to
 *  Monday, week nav normalizes it to Sunday. Sunday 00:00 through the following
 *  Sunday 23:59 covers both. A day of slack is harmless: every week surface
 *  re-filters events to its own visible days. */
export function weekEventSpan(d: Date): { start: Date; end: Date } {
  const start = sundayOfWeek(d)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}
