const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export function mondayOfWeek(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay() // 0=Sun, 1=Mon, …
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
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
