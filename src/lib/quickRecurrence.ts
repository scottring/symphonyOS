// Recurrence for quick capture ("boxing every tuesday and thurs").
//
// The grammar lives in parseRoutine — this file only decides WHEN a quick-add
// line is talking about recurrence at all, and turns the result into the
// three things a capture surface needs: the RecurrencePattern, the first
// occurrence, and an RRULE for a calendar series.
//
// The gate matters more than the grammar. parseRoutine will happily read a
// bare "tuesday" as a weekly routine, but in quick capture a bare weekday is
// a one-off date ("text Karen tuesday") — a real reported data-loss shape.
// Only an explicit cue ("every …", "daily", "on tuesdays") opens the door.

import { parseRoutine, parsedRoutineToDb } from './parseRoutine'
import type { RecurrencePattern } from '@/types/actionable'

export interface DetectedRecurrence {
  pattern: RecurrencePattern
  /** HH:MM when the phrase carried a clock time, else null. */
  time: string | null
  /** From a time range ("from 9am to 10:15am", "7-8am"); undefined otherwise. */
  durationMinutes?: number
  /** The recurrence phrase as typed, for the preview chip and for tests. */
  match: string
  /** The line with the recurrence phrase and any time removed. */
  rest: string
}

const DAY = '(?:sun|mon|tues?|wed(?:nes)?|thurs?|fri|sat(?:ur)?)'
const DAY_LIST = `${DAY}(?:day)?s?(?:\\s*(?:,|and|&)\\s*${DAY}(?:day)?s?)*`
const UNIT = '(?:day|days|weekday|weekdays|weekend|weekends|week|weeks|month|months|quarter|quarters|year|years|morning|afternoon|evening|night)'

// "every <unit|day list>", optionally "every other" / "every 2" / "every two",
// with a monthly date tail ("every month on the 15th").
const EVERY_RE = new RegExp(
  `\\bevery\\s+(?:other\\s+|\\d+\\s+|two\\s+|three\\s+)?(?:${UNIT}|${DAY_LIST})\\b(?:\\s+on\\s+the\\s+\\d{1,2}(?:st|nd|rd|th)?\\b)?`,
  'i',
)
// Bare adverbs.
const ADVERB_RE = /\b(daily|weekly|monthly|quarterly|yearly|weekdays|weekends)\b/i
// Plural weekdays, with or without "on": "tuesdays", "on tuesdays and thursdays".
const PLURAL_DAYS_RE = new RegExp(`\\b(?:on\\s+)?${DAY}days(?:\\s*(?:,|and|&)\\s*${DAY}days)*\\b`, 'i')

const ADVERB_TO_PHRASE: Record<string, string> = {
  daily: 'every day',
  weekly: 'every week',
  monthly: 'every month',
  quarterly: 'every quarter',
  yearly: 'every year',
  weekdays: 'every weekday',
  weekends: 'every weekend',
}

// A clock range: "from 9am to 10:15am", "7-8am", "11:30 to 1pm", "4–5:30pm".
// At least one meridiem is required so "2 to 3 chapters" stays words.
const RANGE_RE = /\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?\s*(?:-|–|—|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)?\b/i

interface ClockRange { time: string; durationMinutes?: number; match: string }

function to24(hour12: number, minutes: number, meridiem: string): number | null {
  if (hour12 < 1 || hour12 > 12 || minutes > 59) return null
  const pm = meridiem.toLowerCase().startsWith('p')
  const h = pm ? (hour12 === 12 ? 12 : hour12 + 12) : hour12 === 12 ? 0 : hour12
  return h * 60 + minutes
}

function hhmm(totalMinutes: number): string {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
}

function readClockRange(input: string): ClockRange | null {
  const m = input.match(RANGE_RE)
  if (!m || (!m[3] && !m[6])) return null
  const startHour = Number(m[1]), startMin = Number(m[2] ?? 0)
  const endHour = Number(m[4]), endMin = Number(m[5] ?? 0)
  const endMer = m[6] ?? m[3]!
  // "11:30 to 1pm": a start with no meridiem borrows the end's, unless that
  // would put it after the end — then it's the other half of the day.
  let startMer = m[3] ?? endMer
  if (!m[3] && startHour > endHour) startMer = endMer.toLowerCase().startsWith('p') ? 'am' : 'pm'
  const start = to24(startHour, startMin, startMer)
  const end = to24(endHour, endMin, endMer)
  if (start == null) return null
  return {
    time: hhmm(start),
    durationMinutes: end != null && end > start ? end - start : undefined,
    match: m[0],
  }
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const RRULE_DAYS: Record<string, string> = { sun: 'SU', mon: 'MO', tue: 'TU', wed: 'WE', thu: 'TH', fri: 'FR', sat: 'SA' }

export function detectRecurrence(input: string, now: Date = new Date()): DetectedRecurrence | null {
  const every = input.match(EVERY_RE)
  const adverb = every ? null : input.match(ADVERB_RE)
  const plural = every || adverb ? null : input.match(PLURAL_DAYS_RE)
  const cue = every ?? adverb ?? plural
  if (!cue) return null

  // A range goes first: parseRoutine reads one clock time, and its patterns
  // are ordered by shape, not position — "from 9am to 10:15am" would come
  // back as 10:15 with "from 9am to" still in the title.
  const range = readClockRange(input)
  let text = range ? input.replace(range.match, ' ') : input
  // parseRoutine speaks "every …"; hand it the adverb spelled out.
  if (adverb) text = text.replace(ADVERB_RE, (w) => ADVERB_TO_PHRASE[w.toLowerCase()])
  const parsed = parseRoutine(text)
  let pattern = parsedRoutineToDb(parsed).recurrence_pattern as RecurrencePattern

  // "every week" / "weekly" names no day — parseRoutine falls back to daily.
  // A weekly thing with no day named happens on the day it was captured.
  if (/^every\s+weeks?$/i.test(cue[0]) || /^weekly$/i.test(cue[0])) {
    pattern = { type: 'weekly', days: [DAY_KEYS[now.getDay()]] }
  }

  return {
    pattern,
    time: range?.time ?? parsed.time,
    durationMinutes: range?.durationMinutes,
    match: cue[0].trim(),
    // The phrase is gone but the preposition that led into it often isn't.
    rest: parsed.action
      .replace(/\s+/g, ' ')
      .replace(/^(?:from|at|on|by|to|until|till)\s+/i, '')
      .replace(/\s+(?:from|at|on|by|to|until|till)$/i, '')
      .trim(),
  }
}

/** Google Calendar `recurrence` lines, or null when the pattern has no RRULE shape. */
export function recurrenceToRRule(pattern: RecurrencePattern): string[] | null {
  const interval = pattern.interval && pattern.interval > 1 ? `;INTERVAL=${pattern.interval}` : ''
  switch (pattern.type) {
    case 'daily':
      return [`RRULE:FREQ=DAILY${interval}`]
    case 'weekly': {
      const days = (pattern.days ?? []).map((d) => RRULE_DAYS[d]).filter(Boolean)
      const byDay = days.length ? `;BYDAY=${days.join(',')}` : ''
      return [`RRULE:FREQ=WEEKLY${interval}${byDay}`]
    }
    case 'monthly': {
      const byMonthDay = pattern.day_of_month ? `;BYMONTHDAY=${pattern.day_of_month}` : ''
      return [`RRULE:FREQ=MONTHLY${interval}${byMonthDay}`]
    }
    case 'quarterly':
      return ['RRULE:FREQ=MONTHLY;INTERVAL=3']
    case 'yearly':
      return [`RRULE:FREQ=YEARLY${interval}`]
    default:
      return null
  }
}

function atTime(day: Date, time: string | null): Date {
  const d = new Date(day)
  if (time) {
    const [h, m] = time.split(':').map(Number)
    d.setHours(h, m, 0, 0)
  } else {
    d.setHours(0, 0, 0, 0)
  }
  return d
}

/**
 * The first day the pattern lands on, counting today — unless today's clock
 * time is already behind us, in which case the next one.
 */
export function nextOccurrence(pattern: RecurrencePattern, time: string | null, now: Date = new Date()): Date {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const stillAhead = (candidate: Date) => !time || candidate.getTime() > now.getTime()

  if (pattern.type === 'weekly' && pattern.days?.length) {
    const wanted = new Set(pattern.days.map((d) => DAY_KEYS.indexOf(d as typeof DAY_KEYS[number])))
    for (let offset = 0; offset < 8; offset++) {
      const day = new Date(today)
      day.setDate(today.getDate() + offset)
      if (!wanted.has(day.getDay())) continue
      const candidate = atTime(day, time)
      if (offset > 0 || stillAhead(candidate)) return candidate
    }
  }

  if (pattern.type === 'monthly' && pattern.day_of_month) {
    for (let months = 0; months < 2; months++) {
      const day = new Date(today.getFullYear(), today.getMonth() + months, pattern.day_of_month)
      if (day.getTime() < today.getTime()) continue
      const candidate = atTime(day, time)
      if (day.getTime() > today.getTime() || stillAhead(candidate)) return candidate
    }
  }

  const todayCandidate = atTime(today, time)
  if (stillAhead(todayCandidate)) return todayCandidate
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  return atTime(tomorrow, time)
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** Short label for the preview chip: "Every Tue, Thu", "Every other Mon". */
export function describeRecurrence(pattern: RecurrencePattern): string {
  const every = pattern.interval === 2 ? 'Every other' : pattern.interval && pattern.interval > 2 ? `Every ${pattern.interval}` : 'Every'
  switch (pattern.type) {
    case 'daily':
      return pattern.interval && pattern.interval > 1 ? `${every} days` : 'Every day'
    case 'weekly': {
      const days = pattern.days ?? []
      const key = [...days].sort((a, b) => DAY_KEYS.indexOf(a as never) - DAY_KEYS.indexOf(b as never)).join(',')
      if (!pattern.interval || pattern.interval === 1) {
        if (key === 'mon,tue,wed,thu,fri') return 'Weekdays'
        if (key === 'sun,sat') return 'Weekends'
        if (days.length === 7) return 'Every day'
      }
      if (days.length === 0) return pattern.interval && pattern.interval > 1 ? `${every} weeks` : 'Every week'
      const labels = key.split(',').map((d) => DAY_LABELS[DAY_KEYS.indexOf(d as never)])
      return `${every} ${labels.join(', ')}`
    }
    case 'monthly':
      return pattern.day_of_month ? `Monthly on the ${ordinal(pattern.day_of_month)}` : 'Every month'
    case 'quarterly':
      return 'Every quarter'
    case 'yearly':
      return 'Every year'
    default:
      return 'Repeats'
  }
}
