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

/** Format a Date as YYYY-MM-DD using local time. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}
