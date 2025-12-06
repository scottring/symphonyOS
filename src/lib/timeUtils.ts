import type { TimelineItem, TimeSection } from '@/types/timeline'

export type TimeOfDay = 'morning' | 'afternoon' | 'evening'
export type DaySection = 'allday' | TimeOfDay | 'unscheduled'

/**
 * Get the current time. Exported for testing (can be mocked).
 */
export function getCurrentTime(): Date {
  return new Date()
}

/**
 * Check if a time is within the "now" window (current hour).
 */
export function isNow(time: Date, now: Date = getCurrentTime()): boolean {
  const hourStart = new Date(now)
  hourStart.setMinutes(0, 0, 0)

  const hourEnd = new Date(hourStart)
  hourEnd.setHours(hourEnd.getHours() + 1)

  return time >= hourStart && time < hourEnd
}

/**
 * Check if a time is "soon" (within the next 3 hours, but not now).
 */
export function isSoon(time: Date, now: Date = getCurrentTime()): boolean {
  if (isNow(time, now)) return false

  const hourStart = new Date(now)
  hourStart.setMinutes(0, 0, 0)
  hourStart.setHours(hourStart.getHours() + 1)

  const soonEnd = new Date(now)
  soonEnd.setHours(soonEnd.getHours() + 3)

  return time >= hourStart && time < soonEnd
}

/**
 * Check if a time is "later today" (after "soon" but still today).
 */
export function isLaterToday(time: Date, now: Date = getCurrentTime()): boolean {
  if (isNow(time, now) || isSoon(time, now)) return false

  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  return time <= todayEnd && time > now
}

/**
 * Check if a time is in the past.
 */
export function isPast(time: Date, now: Date = getCurrentTime()): boolean {
  const hourStart = new Date(now)
  hourStart.setMinutes(0, 0, 0)

  return time < hourStart
}

/**
 * Categorize a timeline item into a time section.
 */
export function getTimeSection(item: TimelineItem, now: Date = getCurrentTime()): TimeSection {
  if (!item.startTime) {
    return 'unscheduled'
  }

  if (isNow(item.startTime, now)) {
    return 'now'
  }

  if (isSoon(item.startTime, now)) {
    return 'soon'
  }

  if (isLaterToday(item.startTime, now)) {
    return 'later'
  }

  // Past items or future items (not today) — treat as "later" for now
  return 'later'
}

/**
 * Group timeline items by time section.
 */
export function groupByTimeSection(
  items: TimelineItem[],
  now: Date = getCurrentTime()
): Record<TimeSection, TimelineItem[]> {
  const groups: Record<TimeSection, TimelineItem[]> = {
    now: [],
    soon: [],
    later: [],
    unscheduled: [],
  }

  for (const item of items) {
    const section = getTimeSection(item, now)
    groups[section].push(item)
  }

  // Sort scheduled sections by start time
  groups.now.sort((a, b) => (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0))
  groups.soon.sort((a, b) => (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0))
  groups.later.sort((a, b) => (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0))

  return groups
}

/**
 * Check if a Date object is valid.
 */
export function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime())
}

/**
 * Format a time for display in compact format (e.g., "9:30a", "7p").
 * Omits minutes if they're :00.
 */
export function formatTime(date: Date): string {
  if (!isValidDate(date)) return ''
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const period = hours >= 12 ? 'p' : 'a'
  const displayHour = hours % 12 || 12

  if (minutes === 0) {
    return `${displayHour}${period}`
  }
  return `${displayHour}:${minutes.toString().padStart(2, '0')}${period}`
}

/**
 * Format a time range for display.
 * Returns { start, end } for stacked display, or { display } for single-line.
 */
export function formatTimeRange(start: Date, end: Date, allDay?: boolean): string {
  if (allDay) return 'All day'
  if (!isValidDate(start) || !isValidDate(end)) return ''
  return `${formatTime(start)}|${formatTime(end)}`
}

/**
 * Get the time of day for a given date.
 * Morning: before 12pm
 * Afternoon: 12pm - 5pm
 * Evening: 5pm onwards
 */
export function getTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

/**
 * Get the day section for a timeline item.
 */
export function getDaySection(item: TimelineItem): DaySection {
  if (!item.startTime) return 'unscheduled'
  if (item.allDay) return 'allday'
  return getTimeOfDay(item.startTime)
}

/**
 * Group timeline items by time of day (All Day/Morning/Afternoon/Evening).
 */
export function groupByDaySection(
  items: TimelineItem[]
): Record<DaySection, TimelineItem[]> {
  const groups: Record<DaySection, TimelineItem[]> = {
    allday: [],
    morning: [],
    afternoon: [],
    evening: [],
    unscheduled: [],
  }

  for (const item of items) {
    const section = getDaySection(item)
    groups[section].push(item)
  }

  // Sort each section by start time (except allday which has no meaningful time)
  const sortByTime = (a: TimelineItem, b: TimelineItem) =>
    (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0)

  // Sort allday events alphabetically by title
  groups.allday.sort((a, b) => a.title.localeCompare(b.title))
  groups.morning.sort(sortByTime)
  groups.afternoon.sort(sortByTime)
  groups.evening.sort(sortByTime)

  return groups
}

/**
 * Get display label for a day section.
 */
export function getDaySectionLabel(section: DaySection): string {
  switch (section) {
    case 'allday': return 'All Day'
    case 'morning': return 'Morning'
    case 'afternoon': return 'Afternoon'
    case 'evening': return 'Evening'
    case 'unscheduled': return 'Unscheduled'
  }
}

/**
 * Format an overdue date for display.
 * Returns "Yesterday", "X days ago", "Last week", or a short date.
 */
export function formatOverdueDate(date: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const taskDate = new Date(date)
  taskDate.setHours(0, 0, 0, 0)

  const diffMs = today.getTime() - taskDate.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return 'Last week'
  return taskDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Calculate days overdue for a task.
 * Returns 0 if not overdue.
 */
export function getDaysOverdue(date: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const taskDate = new Date(date)
  taskDate.setHours(0, 0, 0, 0)

  const diffMs = today.getTime() - taskDate.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}
