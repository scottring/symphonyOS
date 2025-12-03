/**
 * Natural language date/time parser for quick task entry.
 * Extracts date/time expressions from task titles.
 *
 * Examples:
 * - "Call mom tomorrow" → tomorrow at current time
 * - "Meeting at 3pm" → today at 3pm
 * - "Dentist Monday 9am" → next Monday at 9am
 * - "Buy groceries in 2 days" → 2 days from now
 */

export interface ParseResult {
  cleanedTitle: string
  scheduledFor: Date
}

// Time patterns: 3pm, 3:00pm, 3:00, at 3, at 3pm
const TIME_PATTERN = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i

// Day names for matching
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const DAYS_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/**
 * Parse a time string and return hours/minutes in 24h format
 */
function parseTime(match: RegExpMatchArray): { hours: number; minutes: number } | null {
  const [, hourStr, minuteStr, meridiem] = match
  let hours = parseInt(hourStr, 10)
  const minutes = minuteStr ? parseInt(minuteStr, 10) : 0

  if (hours < 1 || hours > 12 && meridiem) return null
  if (hours > 23) return null
  if (minutes > 59) return null

  // Handle AM/PM
  if (meridiem) {
    const isPM = meridiem.toLowerCase() === 'pm'
    if (isPM && hours !== 12) hours += 12
    if (!isPM && hours === 12) hours = 0
  } else if (hours <= 12) {
    // No meridiem - assume PM for hours 1-6, AM for 7-12
    // This is a reasonable default for task scheduling
    if (hours >= 1 && hours <= 6) hours += 12
  }

  return { hours, minutes }
}

/**
 * Get the next occurrence of a specific day of week
 */
function getNextDayOfWeek(dayIndex: number, referenceDate: Date = new Date()): Date {
  const result = new Date(referenceDate)
  result.setHours(9, 0, 0, 0) // Default to 9am

  const currentDay = result.getDay()
  let daysUntil = dayIndex - currentDay

  // If today is that day, go to next week
  if (daysUntil <= 0) daysUntil += 7

  result.setDate(result.getDate() + daysUntil)
  return result
}

/**
 * Parse natural language date/time from a task title.
 * Returns the cleaned title and scheduled date, or null if no date found.
 */
export function parseNaturalDate(input: string): ParseResult | null {
  const now = new Date()
  let scheduledFor: Date | null = null
  let cleanedTitle = input.trim()
  let timeMatch: RegExpMatchArray | null = null
  let parsedTime: { hours: number; minutes: number } | null = null

  // First, extract any time component
  timeMatch = cleanedTitle.match(TIME_PATTERN)
  if (timeMatch) {
    parsedTime = parseTime(timeMatch)
  }

  // Pattern: "today"
  const todayMatch = cleanedTitle.match(/\btoday\b/i)
  if (todayMatch) {
    scheduledFor = new Date(now)
    scheduledFor.setHours(9, 0, 0, 0)
    cleanedTitle = cleanedTitle.replace(/\btoday\b/i, '').trim()
  }

  // Pattern: "tomorrow"
  const tomorrowMatch = cleanedTitle.match(/\btomorrow\b/i)
  if (tomorrowMatch) {
    scheduledFor = new Date(now)
    scheduledFor.setDate(scheduledFor.getDate() + 1)
    scheduledFor.setHours(9, 0, 0, 0)
    cleanedTitle = cleanedTitle.replace(/\btomorrow\b/i, '').trim()
  }

  // Pattern: "yesterday" (for logging past tasks)
  const yesterdayMatch = cleanedTitle.match(/\byesterday\b/i)
  if (yesterdayMatch) {
    scheduledFor = new Date(now)
    scheduledFor.setDate(scheduledFor.getDate() - 1)
    scheduledFor.setHours(9, 0, 0, 0)
    cleanedTitle = cleanedTitle.replace(/\byesterday\b/i, '').trim()
  }

  // Pattern: "next Monday", "this Friday", or just "Monday"
  const dayPattern = new RegExp(`\\b(?:(next|this)\\s+)?(${DAYS.join('|')}|${DAYS_SHORT.join('|')})\\b`, 'i')
  const dayMatch = cleanedTitle.match(dayPattern)
  if (dayMatch && !scheduledFor) {
    const [fullMatch, modifier, dayName] = dayMatch
    const dayLower = dayName.toLowerCase()

    // Find the day index
    let dayIndex = DAYS.findIndex(d => d.startsWith(dayLower))
    if (dayIndex === -1) {
      dayIndex = DAYS_SHORT.findIndex(d => d === dayLower)
    }

    if (dayIndex !== -1) {
      scheduledFor = getNextDayOfWeek(dayIndex, now)

      // "next" modifier means skip this week
      if (modifier?.toLowerCase() === 'next') {
        const currentDay = now.getDay()
        if (dayIndex > currentDay) {
          scheduledFor.setDate(scheduledFor.getDate() + 7)
        }
      }

      cleanedTitle = cleanedTitle.replace(fullMatch, '').trim()
    }
  }

  // Pattern: "in X days/weeks"
  const relativePattern = /\bin\s+(\d+)\s+(day|days|week|weeks)\b/i
  const relativeMatch = cleanedTitle.match(relativePattern)
  if (relativeMatch && !scheduledFor) {
    const [fullMatch, numStr, unit] = relativeMatch
    const num = parseInt(numStr, 10)

    scheduledFor = new Date(now)
    scheduledFor.setHours(9, 0, 0, 0)

    if (unit.toLowerCase().startsWith('week')) {
      scheduledFor.setDate(scheduledFor.getDate() + num * 7)
    } else {
      scheduledFor.setDate(scheduledFor.getDate() + num)
    }

    cleanedTitle = cleanedTitle.replace(fullMatch, '').trim()
  }

  // Pattern: "next week" (without specific day)
  const nextWeekMatch = cleanedTitle.match(/\bnext\s+week\b/i)
  if (nextWeekMatch && !scheduledFor) {
    scheduledFor = new Date(now)
    scheduledFor.setDate(scheduledFor.getDate() + 7)
    scheduledFor.setHours(9, 0, 0, 0)
    cleanedTitle = cleanedTitle.replace(/\bnext\s+week\b/i, '').trim()
  }

  // If we have a time but no date, assume today
  if (parsedTime && !scheduledFor) {
    scheduledFor = new Date(now)
    scheduledFor.setHours(parsedTime.hours, parsedTime.minutes, 0, 0)

    // If the time has already passed today, schedule for tomorrow
    if (scheduledFor <= now) {
      scheduledFor.setDate(scheduledFor.getDate() + 1)
    }
  }

  // Apply parsed time to scheduled date
  if (parsedTime && scheduledFor) {
    scheduledFor.setHours(parsedTime.hours, parsedTime.minutes, 0, 0)
  }

  // Remove time from cleaned title
  if (timeMatch) {
    cleanedTitle = cleanedTitle.replace(TIME_PATTERN, '').trim()
  }

  // Clean up extra whitespace and trailing/leading punctuation
  cleanedTitle = cleanedTitle
    .replace(/\s+/g, ' ')
    .replace(/^\s*[,\-]\s*/, '')
    .replace(/\s*[,\-]\s*$/, '')
    .trim()

  if (!scheduledFor) return null

  return {
    cleanedTitle: cleanedTitle || input.trim(), // Fall back to original if cleaned is empty
    scheduledFor,
  }
}

/**
 * Format a date for display as a preview chip
 */
export function formatDatePreview(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: date.getMinutes() > 0 ? '2-digit' : undefined,
    hour12: true,
  }).toLowerCase()

  if (diffDays === 0) return `Today ${timeStr}`
  if (diffDays === 1) return `Tomorrow ${timeStr}`
  if (diffDays === -1) return `Yesterday ${timeStr}`

  if (diffDays > 1 && diffDays <= 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
    return `${dayName} ${timeStr}`
  }

  // For dates further out, show month/day
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${dateStr} ${timeStr}`
}
