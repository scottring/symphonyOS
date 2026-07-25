import type { TimelineItem, TimeSection } from '@/types/timeline'

/** Ambience only ("This Morning" in FocusMode). Deliberately NOT widened:
 *  wallBackground.ts already keeps its own richer local time-of-day type,
 *  because "what does the sky look like" is a different question from
 *  "which band does this item render in". */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening'

export type DaySection =
  | 'allday'
  | 'earlyMorning'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'unscheduled'

export interface DaySectionBound {
  section: DaySection
  /** Inclusive. */
  startHour: number
  /** Inclusive. */
  endHour: number
  label: string
  /** Human window shown in the header. Must describe startHour..endHour truthfully. */
  range: string
}

/**
 * THE single source of truth for both bucketing and displayed labels.
 *
 * Before this table, `getTimeOfDay` and `daySectionMeta.RANGE` disagreed on
 * every band: Morning's header read "6:00 AM" while the code took everything
 * under hour 12; Afternoon claimed to end at 5 but ran to 17:59; Evening was
 * wrong at both ends. Derive both from here so they cannot drift again.
 *
 * Bands do not wrap midnight — a 2 AM item belongs at the TOP of a
 * chronological page, not the bottom.
 */
export const DAY_SECTION_BOUNDS: DaySectionBound[] = [
  { section: 'earlyMorning', startHour: 0,  endHour: 7,  label: 'Early morning', range: 'Before 8:00 AM' },
  { section: 'morning',      startHour: 8,  endHour: 11, label: 'Morning',       range: '8:00 AM – 12:00 PM' },
  { section: 'afternoon',    startHour: 12, endHour: 16, label: 'Afternoon',     range: '12:00 PM – 5:00 PM' },
  { section: 'evening',      startHour: 17, endHour: 20, label: 'Evening',       range: '5:00 PM – 9:00 PM' },
  { section: 'night',        startHour: 21, endHour: 23, label: 'Night',         range: 'After 9:00 PM' },
]

export function getSectionForHour(hour: number): DaySection {
  const bound = DAY_SECTION_BOUNDS.find(b => hour >= b.startHour && hour <= b.endHour)
  return bound ? bound.section : 'earlyMorning'
}

/**
 * Every section that owns a clock window, chronological. DERIVED — never
 * hand-write this list. A consumer that iterates a literal
 * `['morning','afternoon','evening']` silently drops 00:00–07:59 and
 * 21:00–23:59; that regression is exactly what this constant exists to stop.
 * Use `SECTIONS_ORDER` (lib/today/types) when you also want allday/unscheduled.
 */
export const TIMED_SECTIONS: DaySection[] = DAY_SECTION_BOUNDS.map(b => b.section)

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
 * Format a time for display in long form: "1:00 PM" / "5:30 PM".
 * Use for surfaces that want calm, calendar-app typography.
 * For compact lists/badges, prefer `formatTime` ("1p" / "5:30p").
 */
export function formatTimeLong(date: Date): string {
  if (!isValidDate(date)) return ''
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`
}

/**
 * Long-form range formatter. Returns "All day" / "1:00 PM|2:00 PM".
 * The pipe separator matches `formatTimeRange` so callers can `.split('|')` identically.
 */
export function formatTimeRangeLong(start: Date, end: Date, allDay?: boolean): string {
  if (allDay) return 'All day'
  if (!isValidDate(start) || !isValidDate(end)) return ''
  return `${formatTimeLong(start)}|${formatTimeLong(end)}`
}

/**
 * Format a time range with date context for display.
 * Shows relative context like formatTimeWithDate but for ranges:
 * - "Today 1p|3p"
 * - "Tomorrow 9a|12p"
 * - "Mon 2p|4p" (for this week)
 * - "Dec 15 1p|3p" (for further out)
 */
export function formatTimeRangeWithDate(start: Date, end: Date, allDay?: boolean): string {
  if (allDay) return 'All day'
  if (!isValidDate(start) || !isValidDate(end)) return ''

  const now = getCurrentTime()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const dateStart = new Date(start)
  dateStart.setHours(0, 0, 0, 0)

  const timeRange = `${formatTime(start)}|${formatTime(end)}`

  // Today
  if (dateStart.getTime() === today.getTime()) {
    return `Today ${timeRange}`
  }

  // Tomorrow
  if (dateStart.getTime() === tomorrow.getTime()) {
    return `Tomorrow ${timeRange}`
  }

  // Calculate days difference
  const diffMs = dateStart.getTime() - today.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  // Within this week (next 6 days) - show day name
  if (diffDays > 0 && diffDays <= 6) {
    const dayName = start.toLocaleDateString('en-US', { weekday: 'short' })
    return `${dayName} ${timeRange}`
  }

  // Past or further out - show short date
  const shortDate = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${shortDate} ${timeRange}`
}

/**
 * Coarse 3-valued ambience band for a date ("This Morning" in FocusMode).
 *
 * Boundaries are DERIVED from DAY_SECTION_BOUNDS rather than re-hardcoded, so
 * this can never disagree with where Today actually files the item. It used to:
 * `hour < 18 → afternoon` meant 17:30 read "This Afternoon" while Today filed
 * it under Evening.
 *
 * Stays 3-valued on purpose — ambience wants a coarse label, not the five
 * display bands. earlyMorning folds into morning, night into evening.
 */
const SECTION_TO_TIME_OF_DAY: Record<string, TimeOfDay> = {
  earlyMorning: 'morning',
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'evening',
}

export function getTimeOfDay(date: Date): TimeOfDay {
  return SECTION_TO_TIME_OF_DAY[getSectionForHour(date.getHours())] ?? 'morning'
}

/**
 * Meal keywords and their inferred times.
 * All-day events with these keywords get placed in the appropriate time section.
 */
const MEAL_TIME_INFERENCE: { keywords: string[]; section: TimeOfDay; hour: number; minute: number }[] = [
  { keywords: ['dinner', 'supper'], section: 'evening', hour: 18, minute: 30 },
  { keywords: ['lunch'], section: 'afternoon', hour: 12, minute: 0 },
  { keywords: ['breakfast', 'brunch'], section: 'morning', hour: 8, minute: 0 },
]

/**
 * Infer a time section and sort time for an all-day event based on meal keywords.
 * Returns null if no meal keyword is found.
 */
export function inferMealTime(title: string): { section: TimeOfDay; hour: number; minute: number } | null {
  const lowerTitle = title.toLowerCase()
  for (const meal of MEAL_TIME_INFERENCE) {
    if (meal.keywords.some(kw => lowerTitle.includes(kw))) {
      return { section: meal.section, hour: meal.hour, minute: meal.minute }
    }
  }
  return null
}

/**
 * Get the day section for a timeline item.
 * For all-day events with meal keywords (dinner, lunch, breakfast),
 * places them in the appropriate time section instead of "All Day".
 */
export function getDaySection(item: TimelineItem): DaySection {
  if (!item.startTime) return 'unscheduled'

  // For all-day events, check if it's a meal event that should be placed in a time section
  if (item.allDay) {
    const inferred = inferMealTime(item.title)
    if (inferred) {
      return inferred.section
    }
    return 'allday'
  }

  return getSectionForHour(item.startTime.getHours())
}

/**
 * Get a sortable time for an item, considering inferred meal times.
 * For all-day meal events, returns the inferred time; otherwise uses startTime.
 */
function getSortTime(item: TimelineItem): number {
  if (item.allDay && item.startTime) {
    const inferred = inferMealTime(item.title)
    if (inferred) {
      // Create a time on the same day as startTime but at the inferred hour/minute
      const sortDate = new Date(item.startTime)
      sortDate.setHours(inferred.hour, inferred.minute, 0, 0)
      return sortDate.getTime()
    }
  }
  return item.startTime?.getTime() ?? 0
}

/**
 * Group timeline items by time of day (All Day/Morning/Afternoon/Evening).
 */
export function groupByDaySection(
  items: TimelineItem[]
): Record<DaySection, TimelineItem[]> {
  const groups: Record<DaySection, TimelineItem[]> = {
    allday: [],
    earlyMorning: [],
    morning: [],
    afternoon: [],
    evening: [],
    night: [],
    unscheduled: [],
  }

  for (const item of items) {
    const section = getDaySection(item)
    groups[section].push(item)
  }

  // Sort each section by time (using inferred time for meal events)
  const sortByTime = (a: TimelineItem, b: TimelineItem) =>
    getSortTime(a) - getSortTime(b)

  // All-day has no times to sort by, so it reads alphabetically.
  groups.allday.sort((a, b) => a.title.localeCompare(b.title))
  for (const { section } of DAY_SECTION_BOUNDS) groups[section].sort(sortByTime)

  return groups
}

/**
 * Get display label for a day section.
 */
export function getDaySectionLabel(section: DaySection): string {
  switch (section) {
    case 'allday': return 'All Day'
    case 'unscheduled': return 'Unscheduled'
    default: {
      const bound = DAY_SECTION_BOUNDS.find(b => b.section === section)
      return bound ? bound.label : 'Unscheduled'
    }
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

/**
 * Format a date relative to now (e.g., "Just now", "5m ago", "2h ago", "Yesterday").
 */
export function formatRelativeTime(date: Date): string {
  const now = getCurrentTime()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Format a time with date context for display.
 * Shows relative context:
 * - "Today 3pm"
 * - "Tomorrow 3pm"
 * - "Mon 3pm" (for this week)
 * - "Dec 15 3pm" (for further out)
 * - "3pm" if skipDateForToday is true and date is today
 */
export function formatTimeWithDate(date: Date, options?: { skipDateForToday?: boolean }): string {
  if (!isValidDate(date)) return ''

  const now = getCurrentTime()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const dateStart = new Date(date)
  dateStart.setHours(0, 0, 0, 0)

  const time = formatTime(date)

  // Today
  if (dateStart.getTime() === today.getTime()) {
    if (options?.skipDateForToday) {
      return time
    }
    return `Today ${time}`
  }

  // Tomorrow
  if (dateStart.getTime() === tomorrow.getTime()) {
    return `Tomorrow ${time}`
  }

  // Calculate days difference
  const diffMs = dateStart.getTime() - today.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  // Within this week (next 6 days) - show day name
  if (diffDays > 0 && diffDays <= 6) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
    return `${dayName} ${time}`
  }

  // Past or further out - show short date
  const shortDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${shortDate} ${time}`
}
