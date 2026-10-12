// src/lib/triage/periods.ts
//
// Where each When lands — resolved against the ACTUAL today (never the week or
// day on screen), the household's week start and its own seasons.
//
// The shared week helpers in lib/dateHelpers (getNextMonday, getNextWeekend…)
// assume Monday weeks and are used by the kitchen wall, so they are left as
// they are; triage reads these instead. A weekend is always Saturday–Sunday
// (weekendStartFor — the app's one weekend definition, which counts a Sunday
// as the weekend in progress); `weekStartsOn` answers a different question.

import { readCadenceConfig, weekStartAnchor, type WeekStart } from '@/lib/cadence/config'
import { readSeasons, seasonStartFor, seasonEndFor, seasonLabel, type Seasons } from '@/lib/cadence/seasons'
import { weekendStartFor, weekendEnd } from '@/lib/planning/weekend'
import { WHEN_LABEL, type TriageWhen } from './contract'

export interface TriageClock {
  now: Date
  weekStartsOn: WeekStart
  seasons: Seasons
}

/** Today's clock, from the household's saved cadence and seasons. */
export function triageClock(now: Date = new Date()): TriageClock {
  return { now, weekStartsOn: readCadenceConfig().weekStartsOn, seasons: readSeasons() }
}

export type PeriodLevel = 'week' | 'month' | 'season'

export type WhenTarget =
  /** A day, at midnight. */
  | { kind: 'day'; date: Date }
  /** A day and a time (Tonight, 6 PM). */
  | { kind: 'time'; date: Date }
  /** Saturday and Sunday. */
  | { kind: 'weekend'; saturday: Date; sunday: Date }
  /** A period pool: `end` is exclusive. */
  | { kind: 'period'; level: PeriodLevel; start: Date; end: Date }
  | { kind: 'someday' }

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** The hour "Tonight" means. */
export const TONIGHT_HOUR = 18

export function resolveWhen(when: TriageWhen, clock: TriageClock = triageClock()): WhenTarget {
  const today = midnight(clock.now)
  switch (when) {
    case 'today': return { kind: 'day', date: today }
    case 'tonight': return { kind: 'time', date: new Date(today.getFullYear(), today.getMonth(), today.getDate(), TONIGHT_HOUR) }
    case 'tomorrow': return { kind: 'day', date: addDays(today, 1) }
    case 'this-week':
    case 'next-week': {
      const start = addDays(weekStartAnchor(today, clock.weekStartsOn), when === 'next-week' ? 7 : 0)
      return { kind: 'period', level: 'week', start, end: addDays(start, 7) }
    }
    case 'this-weekend':
    case 'next-weekend': {
      const saturday = addDays(weekendStartFor(today), when === 'next-weekend' ? 7 : 0)
      return { kind: 'weekend', saturday, sunday: weekendEnd(saturday) }
    }
    case 'this-month':
    case 'next-month': {
      const start = new Date(today.getFullYear(), today.getMonth() + (when === 'next-month' ? 1 : 0), 1)
      return { kind: 'period', level: 'month', start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) }
    }
    case 'this-season':
      return { kind: 'period', level: 'season', start: seasonStartFor(today, clock.seasons), end: seasonEndFor(today, clock.seasons) }
    case 'someday': return { kind: 'someday' }
  }
}

/** "Tue, Oct 13" — weekday included so a weekend reads as one. */
export function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "Oct 10–16", or "Oct 31 – Nov 6" across a month edge (end exclusive). */
export function rangeLabel(start: Date, endExclusive: Date): string {
  const last = addDays(endExclusive, -1)
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
  return start.getMonth() === last.getMonth()
    ? `${month(start)} ${start.getDate()}–${last.getDate()}`
    : `${month(start)} ${start.getDate()} – ${month(last)} ${last.getDate()}`
}

/**
 * The destination, said beside the When so nobody has to work out which
 * Saturday "next weekend" is, or which week "next week" is under Saturday
 * weeks: "Tue, Oct 13", "Oct 17–23", "November", "Fall 2026".
 */
export function whenDetail(when: TriageWhen, clock: TriageClock = triageClock()): string {
  const t = resolveWhen(when, clock)
  switch (t.kind) {
    case 'day': return dayLabel(t.date)
    case 'time': return `${dayLabel(t.date)}, ${t.date.toLocaleTimeString('en-US', { hour: 'numeric' })}`
    case 'weekend': return rangeLabel(t.saturday, addDays(t.sunday, 1))
    case 'period':
      if (t.level === 'week') return rangeLabel(t.start, t.end)
      if (t.level === 'month') return t.start.toLocaleDateString('en-US', { month: 'long', ...(t.start.getFullYear() !== clock.now.getFullYear() ? { year: 'numeric' } : {}) })
      return seasonLabel(t.start, clock.seasons)
    case 'someday': return 'No date'
  }
}

/** The days a When covers (a week, a weekend, a month), for a day picker. */
export function daysOf(when: TriageWhen, clock: TriageClock = triageClock()): Date[] {
  const t = resolveWhen(when, clock)
  if (t.kind === 'day' || t.kind === 'time') return [midnight(t.date)]
  if (t.kind === 'weekend') return [t.saturday, t.sunday]
  if (t.kind === 'someday') return []
  const out: Date[] = []
  for (let d = t.start; d < t.end; d = addDays(d, 1)) out.push(d)
  return out
}

/**
 * The confirmation after a move lands: "Moved to Tomorrow · Tue, Oct 13".
 * The destination is the same one the menu printed.
 */
export function describeWhen(when: TriageWhen, clock: TriageClock = triageClock()): string {
  return when === 'someday' ? 'Moved to Someday' : `Moved to ${WHEN_LABEL[when]} · ${whenDetail(when, clock)}`
}
