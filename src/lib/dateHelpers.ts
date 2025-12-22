/**
 * Shared date utility functions for date/time pickers
 * Consolidates duplicated logic across WhenPicker, DeferPicker, SchedulePopover, PushDropdown
 */

/**
 * Get a date N days from now at midnight
 */
export function getBaseDate(daysFromNow: number): Date {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  date.setHours(0, 0, 0, 0)
  return date
}

/**
 * Get next Saturday at midnight
 */
export function getNextWeekend(): Date {
  const today = new Date()
  const dayOfWeek = today.getDay()
  // If today is Sunday (0), go to next Saturday (6 days)
  // Otherwise, calculate days until next Saturday
  const daysUntilSaturday = dayOfWeek === 0 ? 6 : 6 - dayOfWeek
  const nextSaturday = new Date(today)
  nextSaturday.setDate(today.getDate() + daysUntilSaturday)
  nextSaturday.setHours(0, 0, 0, 0)
  return nextSaturday
}

/**
 * Get next Monday at midnight
 */
export function getNextMonday(): Date {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  const nextMonday = new Date(today)
  nextMonday.setDate(today.getDate() + daysUntilMonday)
  nextMonday.setHours(0, 0, 0, 0)
  return nextMonday
}

/**
 * Get a time N hours from now, rounded to nearest 30-minute interval
 */
export function getHoursFromNow(hours: number): Date {
  const date = new Date()
  date.setHours(date.getHours() + hours)
  // Round to nearest 30 minutes
  date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30, 0, 0)
  return date
}

/**
 * Get today at 6pm (18:00)
 */
export function getThisEvening(): Date {
  const date = new Date()
  date.setHours(18, 0, 0, 0)
  return date
}

/**
 * Check if current time is before 6pm
 */
export function isBeforeEvening(): boolean {
  const now = new Date()
  return now.getHours() < 18
}

/**
 * Format date for native input[type="date"] (YYYY-MM-DD)
 */
export function formatDateForInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Format time for native input[type="time"] (HH:MM)
 */
export function formatTimeForInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Parse YYYY-MM-DD string to Date at midnight
 */
export function parseDateInput(dateString: string): Date | null {
  if (!dateString) return null
  const [year, month, day] = dateString.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day, 0, 0, 0)
}

/**
 * Parse HH:MM string and apply to given date
 */
export function parseTimeInput(timeString: string, baseDate: Date = new Date()): Date | null {
  if (!timeString) return null
  const [hours, minutes] = timeString.split(':').map(Number)
  if (hours === undefined || minutes === undefined) return null
  const date = new Date(baseDate)
  date.setHours(hours, minutes, 0, 0)
  return date
}

/**
 * Format a date as a user-friendly label (Today, Tomorrow, or short date)
 */
export function formatDateLabel(date: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const compareDate = new Date(date)
  compareDate.setHours(0, 0, 0, 0)

  if (compareDate.getTime() === today.getTime()) return 'Today'
  if (compareDate.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Format time in compact style (e.g., "2p", "2:30p")
 */
export function formatTimeCompact(date: Date): string {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const period = hours >= 12 ? 'p' : 'a'
  const displayHour = hours % 12 || 12
  if (minutes === 0) return `${displayHour}${period}`
  return `${displayHour}:${minutes.toString().padStart(2, '0')}${period}`
}
