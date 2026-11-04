// src/lib/planning/periodClaims.ts
//
// What claims a planning period: the one selector behind the calendar sheets
// folded beside Month, Season and Year (CalendarSheet) and the Month grid's
// dots.
//
// Those sheets listed every event the calendar held, so November read as
// "Specials — Ella: … · Kaleb: …" every school day and Boxing twice a week
// (Scott, 2026-11-04: "the calendar view needs to be smarter than this, the
// school Specials for Ella and Kaleb do not belong in this calendar review").
// The rule was already Scott's for month planning (2026-10-02, landmarksIn:
// "don't flood monthly planning with the entire calendar"), so it is reused
// here, not restated: SPECIALS and weeklySeries come from planV2.
//
//   LEFT OUT   the specials rotation; any series that comes round every week
//              or more often, all-day or timed (Boxing, Marta, an every-
//              school-day drop-off); cancelled events; completed tasks.
//   KEPT       all-day dates and stretches (shown once, as a range), one-off
//              timed events, dated tasks, monthly or yearly series.
//   RHYTHM     the weekly series left out, once, by title and weekday
//              ("Boxing Tue & Thu"), for the sheet's one quiet line. The
//              specials are not in it: they are the kids' rotation, read on
//              Today and Week.
//
// Year keeps only what shapes a year: all-day dates, stretches and monthly or
// yearly series, never a one-off timed event.

import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { localYmd, parseLocalYmd } from '@/lib/cadence/config'
import { eventDensityKey } from './weekDensity'
import { SPECIALS, weeklySeries } from './v2/planV2'

const HOUR = 3_600_000
/** A timed event this long or longer is a stretch, as landmarksIn reads it. */
const STRETCH_HOURS = 20

export interface Claim {
  id: string
  kind: 'event' | 'task'
  title: string
  /** When it starts (an all-day date at local midnight). A stretch that
   *  began before the period keeps its own start. */
  at: Date
  allDay: boolean
  /** The last day of a stretch (inclusive), when it runs past its first. */
  last?: Date
  /** An instance of a series (monthly or yearly: the weekly ones are left out). */
  recurring?: boolean
  /** Only for tasks. */
  taskId?: string
}

/** A weekly series left out of the list, named once: "Boxing" · "Tue & Thu". */
export interface Rhythm { title: string; days: string }

export interface PeriodClaims { claims: Claim[]; rhythm: Rhythm[] }

export type ClaimScope = 'month' | 'season' | 'year'

const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Monday first, the way a week of practice reads. */
const ORDER = [1, 2, 3, 4, 5, 6, 0]

function daysWord(days: Set<number>): string {
  if (days.size === 7) return 'daily'
  if (days.size === 5 && [1, 2, 3, 4, 5].every((d) => days.has(d))) return 'weekdays'
  const names = ORDER.filter((d) => days.has(d)).map((d) => WEEKDAY[d])
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/**
 * The claims on `[start, end)` and the weekly rhythm left out of them.
 * Day-ordered, all-day first within a day, then by time. One event on two
 * calendars is one claim (eventDensityKey, as periodCalendarEntries counts).
 */
export function claimsIn(
  events: readonly CalendarEvent[],
  tasks: readonly Task[],
  start: Date,
  end: Date,
  opts: { scope?: ClaimScope } = {},
): PeriodClaims {
  const year = opts.scope === 'year'
  const weekly = weeklySeries(events)
  const claims: Claim[] = []
  const seen = new Set<string>()
  // The left-out weekly series, by title: their weekdays, how often, and when first.
  const beats = new Map<string, { title: string; days: Set<number>; seen: Set<string>; first: number }>()

  for (const e of events) {
    if ((e as { status?: string }).status === 'cancelled') continue
    const title = (e.title ?? '').trim()
    if (SPECIALS.test(title)) continue
    const allDay = !!(e.all_day ?? e.allDay)
    // An all-day entry names a calendar DATE: read as a timestamp it is UTC
    // midnight, the evening before in any US zone (planV2's landmarksIn).
    const read = (raw?: string) => {
      if (!raw) return null
      const d = allDay || /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parseLocalYmd(raw.slice(0, 10)) : new Date(raw)
      return Number.isNaN(d.getTime()) ? null : d
    }
    const at = read(e.start_time ?? e.startTime)
    if (!at) continue
    const key = eventDensityKey(title, allDay ? null : at, localYmd(at))
    const series = e.recurring_event_id ?? e.recurringEventId

    if (series && weekly.has(series)) {
      if (at < start || at >= end) continue
      const name = title.toLowerCase()
      const beat = beats.get(name) ?? { title: title || '(no title)', days: new Set<number>(), seen: new Set<string>(), first: at.getTime() }
      beat.days.add(at.getDay())
      beat.seen.add(key)
      beat.first = Math.min(beat.first, at.getTime())
      beats.set(name, beat)
      continue
    }

    const rawEnd = read(e.end_time ?? e.endTime)
    // An all-day end is exclusive (Google): the last day is the day before.
    const lastDay = allDay
      ? (rawEnd && rawEnd > at ? dayOf(new Date(rawEnd.getTime() - 1)) : dayOf(at))
      : (rawEnd && rawEnd.getTime() - at.getTime() >= STRETCH_HOURS * HOUR ? dayOf(new Date(rawEnd.getTime() - 1)) : dayOf(at))
    const stretch = lastDay > dayOf(at)
    // A stretch claims every day it covers; anything else, the moment it starts.
    const inPeriod = stretch ? at < end && lastDay >= dayOf(start) : at >= start && at < end
    if (!inPeriod) continue
    if (year && !allDay && !stretch && !series) continue
    if (seen.has(key)) continue
    seen.add(key)
    claims.push({
      id: `event-${e.id}`, kind: 'event', title: title || '(no title)', at, allDay,
      ...(stretch ? { last: lastDay } : {}),
      ...(series ? { recurring: true } : {}),
    })
  }

  // A dated task is the user's own claim on a day; a year reads only landmarks.
  if (!year) {
    for (const t of tasks) {
      if (t.completed || !t.scheduledFor) continue
      if (t.scheduledFor < start || t.scheduledFor >= end) continue
      claims.push({ id: `task-${t.id}`, kind: 'task', title: t.title, at: t.scheduledFor, allDay: !!t.isAllDay, taskId: t.id })
    }
  }

  claims.sort((a, b) =>
    dayOf(a.at).getTime() - dayOf(b.at).getTime()
    || (a.allDay === b.allDay ? a.at.getTime() - b.at.getTime() : a.allDay ? -1 : 1))

  const rhythm = [...beats.values()]
    .sort((a, b) => b.seen.size - a.seen.size || a.first - b.first)
    .map((b) => ({ title: b.title, days: daysWord(b.days) }))

  return { claims, rhythm }
}

/** The days a claim covers inside `[start, end)`, as local YYYY-MM-DD: its
 *  own day, or each day of a stretch. What the Month grid dots count. */
export function claimDays(c: Claim, start: Date, end: Date): string[] {
  const out: string[] = []
  const last = c.last ?? dayOf(c.at)
  for (let d = dayOf(c.at); d <= last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (d >= dayOf(start) && d < end) out.push(localYmd(d))
  }
  return out
}

/** At most this many weekly series are named; the rest are counted. */
export const RHYTHM_MAX = 4

/** "Every week: Boxing Tue & Thu · Marta Tue · Coppermine Tue", or null when
 *  nothing weekly was left out. */
export function rhythmLine(rhythm: readonly Rhythm[], max = RHYTHM_MAX): string | null {
  if (rhythm.length === 0) return null
  const named = rhythm.slice(0, max).map((r) => `${r.title} ${r.days}`).join(' · ')
  const more = rhythm.length - Math.min(max, rhythm.length)
  return `Every week: ${named}${more > 0 ? ` and ${more} more` : ''}`
}
