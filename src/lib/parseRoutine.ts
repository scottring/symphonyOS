// Natural Language Routine Parser

import type { Contact } from '@/types/contact'

export interface SemanticToken {
  text: string
  type: 'person' | 'action' | 'day-pattern' | 'time-of-day' | 'time' | 'plain'
}

export interface ParsedRoutine {
  raw: string
  assignee: string | null       // Contact ID if matched, null if self
  assigneeName: string | null   // Display name
  action: string                // The core action text
  recurrence: {
    type: 'daily' | 'weekdays' | 'weekends' | 'weekly'
    days?: number[]             // 0=Sun, 1=Mon, etc. for weekly
  }
  timeOfDay: 'morning' | 'afternoon' | 'evening' | null
  time: string | null           // HH:MM format
  tokens: SemanticToken[]
}

// Day name mappings
const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
}

// Time of day keywords
const TIME_OF_DAY_KEYWORDS = ['morning', 'afternoon', 'evening']

/**
 * Parse a natural language routine description
 */
export function parseRoutine(input: string, contacts: Contact[] = []): ParsedRoutine {
  const raw = input.trim()
  const normalized = raw.toLowerCase()

  let assignee: string | null = null
  let assigneeName: string | null = null
  let action = ''
  let recurrence: ParsedRoutine['recurrence'] = { type: 'daily' }
  let timeOfDay: ParsedRoutine['timeOfDay'] = null
  let time: string | null = null
  const tokens: SemanticToken[] = []

  // Track what we've extracted to build the action string
  const extractedRanges: Array<{ start: number; end: number; type: SemanticToken['type']; text: string }> = []

  // 1. Extract time (e.g., "at 7", "at 7am", "at 7:30pm", "at noon")
  const timePatterns = [
    // "at noon" / "at midnight"
    { regex: /\bat\s+noon\b/i, parse: () => '12:00' },
    { regex: /\bat\s+midnight\b/i, parse: () => '00:00' },
    // "at 7:30am" / "at 7:30 am" / "at 7:30pm"
    { regex: /\bat\s+(\d{1,2}):(\d{2})\s*(am|pm|a|p)\b/i, parse: (m: RegExpMatchArray) => {
      let hours = parseInt(m[1], 10)
      const minutes = parseInt(m[2], 10)
      const meridiem = m[3].toLowerCase()
      if (meridiem === 'pm' || meridiem === 'p') {
        if (hours !== 12) hours += 12
      } else if (hours === 12) {
        hours = 0
      }
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    }},
    // "at 7am" / "at 7 am" / "at 7pm"
    { regex: /\bat\s+(\d{1,2})\s*(am|pm|a|p)\b/i, parse: (m: RegExpMatchArray) => {
      let hours = parseInt(m[1], 10)
      const meridiem = m[2].toLowerCase()
      if (meridiem === 'pm' || meridiem === 'p') {
        if (hours !== 12) hours += 12
      } else if (hours === 12) {
        hours = 0
      }
      return `${hours.toString().padStart(2, '0')}:00`
    }},
    // "at 7" (assume AM if no meridiem, use 24h if > 12)
    { regex: /\bat\s+(\d{1,2})\b(?!\s*:)/i, parse: (m: RegExpMatchArray) => {
      const hours = parseInt(m[1], 10)
      return `${hours.toString().padStart(2, '0')}:00`
    }},
  ]

  for (const { regex, parse } of timePatterns) {
    const match = normalized.match(regex)
    if (match && match.index !== undefined) {
      time = parse(match)
      extractedRanges.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'time',
        text: formatTimeDisplay(time),
      })
      break
    }
  }

  // 2. Extract recurrence patterns
  const recurrencePatterns = [
    // Weekdays
    { regex: /\bevery\s+weekday\b/i, result: { type: 'weekdays' as const } },
    { regex: /\bweekdays\b/i, result: { type: 'weekdays' as const } },
    { regex: /\bmon(?:day)?\s*(?:-|through|to)\s*fri(?:day)?\b/i, result: { type: 'weekdays' as const } },
    { regex: /\bmonday\s+through\s+friday\b/i, result: { type: 'weekdays' as const } },
    // Weekends
    { regex: /\bevery\s+weekend\b/i, result: { type: 'weekends' as const } },
    { regex: /\bweekends\b/i, result: { type: 'weekends' as const } },
    { regex: /\bsaturday\s+and\s+sunday\b/i, result: { type: 'weekends' as const } },
    { regex: /\bsat(?:urday)?\s+and\s+sun(?:day)?\b/i, result: { type: 'weekends' as const } },
    // Daily
    { regex: /\bevery\s+day\b/i, result: { type: 'daily' as const } },
    { regex: /\bdaily\b/i, result: { type: 'daily' as const } },
    // "every morning/afternoon/evening" implies daily
    { regex: /\bevery\s+(?=morning|afternoon|evening)/i, result: { type: 'daily' as const } },
  ]

  let recurrenceFound = false
  for (const { regex, result } of recurrencePatterns) {
    const match = normalized.match(regex)
    if (match && match.index !== undefined) {
      recurrence = result
      extractedRanges.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'day-pattern',
        text: getRecurrenceDisplay(result),
      })
      recurrenceFound = true
      break
    }
  }

  // Check for specific days: "every monday", "every monday and wednesday"
  if (!recurrenceFound) {
    // Match "every <day>" or "every <day> and <day>"
    const everyDayRegex = /\bevery\s+((?:(?:sun|mon|tues?|wed(?:nes)?|thurs?|fri|sat)(?:day)?(?:\s*(?:,|and)\s*)?)+)\b/i
    const match = normalized.match(everyDayRegex)
    if (match && match.index !== undefined) {
      const daysText = match[1].toLowerCase()
      const days: number[] = []

      for (const [name, num] of Object.entries(DAY_NAMES)) {
        if (daysText.includes(name)) {
          if (!days.includes(num)) {
            days.push(num)
          }
        }
      }

      if (days.length > 0) {
        days.sort((a, b) => a - b)
        recurrence = { type: 'weekly', days }
        extractedRanges.push({
          start: match.index,
          end: match.index + match[0].length,
          type: 'day-pattern',
          text: getRecurrenceDisplay(recurrence),
        })
        recurrenceFound = true
      }
    }
  }

  // 3. Extract time of day
  for (const tod of TIME_OF_DAY_KEYWORDS) {
    const regex = new RegExp(`\\b${tod}\\b`, 'i')
    const match = normalized.match(regex)
    if (match && match.index !== undefined) {
      // Don't extract if it's already part of the time extraction (rare)
      const alreadyExtracted = extractedRanges.some(
        r => match.index! >= r.start && match.index! < r.end
      )
      if (!alreadyExtracted) {
        timeOfDay = tod as ParsedRoutine['timeOfDay']
        extractedRanges.push({
          start: match.index,
          end: match.index + match[0].length,
          type: 'time-of-day',
          text: tod.toUpperCase(),
        })
        break
      }
    }
  }

  // 4. Extract assignee (first word(s) matching a contact)
  if (contacts.length > 0) {
    // Sort contacts by name length (descending) to match longer names first
    const sortedContacts = [...contacts].sort((a, b) => b.name.length - a.name.length)

    for (const contact of sortedContacts) {
      const contactNameLower = contact.name.toLowerCase()
      // Check if input starts with contact name (case-insensitive)
      if (normalized.startsWith(contactNameLower + ' ') || normalized === contactNameLower) {
        assignee = contact.id
        assigneeName = contact.name
        extractedRanges.push({
          start: 0,
          end: contact.name.length,
          type: 'person',
          text: contact.name.toUpperCase(),
        })
        break
      }
    }
  }

  // 5. Build action string (everything not extracted)
  // Sort ranges by start position
  extractedRanges.sort((a, b) => a.start - b.start)

  let actionParts: string[] = []
  let lastEnd = 0

  for (const range of extractedRanges) {
    if (range.start > lastEnd) {
      actionParts.push(raw.slice(lastEnd, range.start))
    }
    lastEnd = range.end
  }
  if (lastEnd < raw.length) {
    actionParts.push(raw.slice(lastEnd))
  }

  action = actionParts.join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s*at\s*/i, '') // Remove leading "at" if present
    .trim()

  // 6. Build tokens array for display
  lastEnd = 0
  for (const range of extractedRanges) {
    // Add any text before this range as action/plain
    if (range.start > lastEnd) {
      const betweenText = raw.slice(lastEnd, range.start)
      if (betweenText.trim()) {
        tokens.push({ text: betweenText.trim(), type: 'action' })
      }
    }
    tokens.push({ text: range.text, type: range.type })
    lastEnd = range.end
  }
  // Add any remaining text
  if (lastEnd < raw.length) {
    const remainingText = raw.slice(lastEnd)
    if (remainingText.trim()) {
      tokens.push({ text: remainingText.trim(), type: 'action' })
    }
  }

  return {
    raw,
    assignee,
    assigneeName,
    action,
    recurrence,
    timeOfDay,
    time,
    tokens,
  }
}

/**
 * Format time for display (compact format like "7a", "2:30p")
 */
function formatTimeDisplay(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const h12 = hours % 12 || 12
  const meridiem = hours >= 12 ? 'p' : 'a'
  if (minutes === 0) {
    return `${h12}${meridiem}`
  }
  return `${h12}:${minutes.toString().padStart(2, '0')}${meridiem}`
}

/**
 * Get display text for recurrence pattern
 */
function getRecurrenceDisplay(recurrence: ParsedRoutine['recurrence']): string {
  switch (recurrence.type) {
    case 'daily':
      return 'DAILY'
    case 'weekdays':
      return 'WEEKDAYS'
    case 'weekends':
      return 'WEEKENDS'
    case 'weekly': {
      const days = recurrence.days || []
      const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
      if (days.length === 1) {
        return dayNames[days[0]]
      }
      return days.map(d => dayNames[d]).join(', ')
    }
    default:
      return 'DAILY'
  }
}

/**
 * Convert parsed routine to database format
 */
export function parsedRoutineToDb(parsed: ParsedRoutine): {
  name: string
  recurrence_pattern: { type: string; days?: string[] }
  time_of_day: string | null
  default_assignee: string | null
  raw_input: string
} {
  // Convert recurrence to DB format
  const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  let dbRecurrence: { type: string; days?: string[] }

  switch (parsed.recurrence.type) {
    case 'daily':
      dbRecurrence = { type: 'daily' }
      break
    case 'weekdays':
      dbRecurrence = { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] }
      break
    case 'weekends':
      dbRecurrence = { type: 'weekly', days: ['sat', 'sun'] }
      break
    case 'weekly':
      dbRecurrence = {
        type: 'weekly',
        days: (parsed.recurrence.days || []).map(d => dayMap[d])
      }
      break
    default:
      dbRecurrence = { type: 'daily' }
  }

  return {
    name: parsed.action,
    recurrence_pattern: dbRecurrence,
    time_of_day: parsed.time,
    default_assignee: parsed.assignee,
    raw_input: parsed.raw,
  }
}

/**
 * Check if a parsed routine is valid (has at least an action)
 */
export function isValidParsedRoutine(parsed: ParsedRoutine): boolean {
  return parsed.action.trim().length > 0
}
