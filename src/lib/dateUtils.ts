/**
 * Date Utility Functions
 *
 * Centralized date string conversion and manipulation utilities.
 * These were previously scattered across useActionableInstances.ts,
 * App.tsx, and various components.
 */

/**
 * Convert a Date object to a YYYY-MM-DD string (local timezone)
 *
 * This is the standard format used throughout the app for date strings
 * and database storage.
 */
export function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parse a YYYY-MM-DD string into a Date object (local timezone)
 */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Get today's date as a YYYY-MM-DD string
 */
export function getTodayString(): string {
  return toDateString(new Date())
}

/**
 * Get tomorrow's date as a YYYY-MM-DD string
 */
export function getTomorrowString(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return toDateString(tomorrow)
}

/**
 * Get a date N days from today as a YYYY-MM-DD string
 */
export function getDateStringFromToday(daysOffset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + daysOffset)
  return toDateString(date)
}

/**
 * Check if a date string represents today
 */
export function isToday(dateString: string): boolean {
  return dateString === getTodayString()
}

/**
 * Check if a date string represents a past date
 */
export function isPastDate(dateString: string): boolean {
  return dateString < getTodayString()
}

/**
 * Check if a date string represents a future date
 */
export function isFutureDate(dateString: string): boolean {
  return dateString > getTodayString()
}

/**
 * Check if two Date objects represent the same calendar day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

/**
 * Get the start of day (midnight) for a Date object
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

/**
 * Get the end of day (23:59:59.999) for a Date object
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

/**
 * Calculate the difference in days between two dates
 */
export function differenceInDays(dateLeft: Date, dateRight: Date): number {
  const diffTime = dateLeft.getTime() - dateRight.getTime()
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Subtract days from a date
 */
export function subtractDays(date: Date, days: number): Date {
  return addDays(date, -days)
}

/**
 * Get the day of week name (e.g., 'monday', 'tuesday')
 */
export function getDayOfWeek(date: Date): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return days[date.getDay()]
}

/**
 * Get the short day of week name (e.g., 'sun', 'mon')
 */
export function getShortDayOfWeek(date: Date): string {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return days[date.getDay()]
}

/**
 * Check if a date falls on a weekend
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

/**
 * Get the start of the week (Sunday) for a given date
 */
export function startOfWeek(date: Date): Date {
  const result = new Date(date)
  const day = result.getDay()
  result.setDate(result.getDate() - day)
  result.setHours(0, 0, 0, 0)
  return result
}

/**
 * Get an array of dates for the week containing the given date
 */
export function getWeekDates(date: Date): Date[] {
  const weekStart = startOfWeek(date)
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}
