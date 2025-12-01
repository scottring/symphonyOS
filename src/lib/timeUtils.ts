import type { TimelineItem, TimeSection } from '@/types/timeline'

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
 * Check if two dates are on the same day.
 */
export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

/**
 * Group timeline items by time section for a specific viewed date.
 * If viewing today, uses normal time-based grouping.
 * If viewing another date, all scheduled items go into "later" (shows as chronological list).
 */
export function groupByTimeSectionForDate(
  items: TimelineItem[],
  viewedDate: Date,
  now: Date = getCurrentTime()
): Record<TimeSection, TimelineItem[]> {
  const isViewingToday = isSameDay(viewedDate, now)

  // If viewing today, use normal time-based grouping
  if (isViewingToday) {
    return groupByTimeSection(items, now)
  }

  // For other dates, put all scheduled items in "later" and unscheduled in "unscheduled"
  const groups: Record<TimeSection, TimelineItem[]> = {
    now: [],
    soon: [],
    later: [],
    unscheduled: [],
  }

  for (const item of items) {
    if (!item.startTime) {
      groups.unscheduled.push(item)
    } else {
      groups.later.push(item)
    }
  }

  // Sort by start time
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
 * Format a time for display (e.g., "9:30 AM").
 */
export function formatTime(date: Date): string {
  if (!isValidDate(date)) return ''
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Format a time range for display (e.g., "9:30 AM - 10:30 AM").
 */
export function formatTimeRange(start: Date, end: Date, allDay?: boolean): string {
  if (allDay) return 'All day'
  if (!isValidDate(start) || !isValidDate(end)) return ''
  return `${formatTime(start)} - ${formatTime(end)}`
}
