import type { Routine } from '@/types/actionable'

/**
 * Format a date as YYYY-MM-DD in local timezone.
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Check if a routine's recurrence pattern matches a given date.
 * Pure function — no React dependencies.
 */
export function matchesRecurrenceForDate(routine: Routine, date: Date): boolean {
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
    default:
      return false
  }
}

/**
 * Filter routines that match a given date.
 */
export function getRoutinesForDatePure(routines: Routine[], date: Date): Routine[] {
  return routines.filter(r => matchesRecurrenceForDate(r, date))
}
