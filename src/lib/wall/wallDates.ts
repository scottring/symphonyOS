// How the wall names dates. PURE.
//
// The kitchen wall is read from across the room by people deciding where
// something goes, so a day is never a bare weekday ("Sat" — which one?) and a
// week is never just "this week": every day carries its date and every week
// its two ends, counted from the household's week start (Saturday for us).

import type { Task } from '@/types/task'
import type { PushPreset } from '@/components/wall-v2/WallV2ItemActionSheet'
import { localYmd, weekStartAnchor, type WeekStart } from '@/lib/cadence/config'

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const plusDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** "Sat, Oct 24". */
export function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "Today", "Tomorrow", else "Sat, Oct 24". */
export function dayLabel(d: Date, today: Date): string {
  const ymd = localYmd(d)
  if (ymd === localYmd(today)) return 'Today'
  if (ymd === localYmd(plusDays(today, 1))) return 'Tomorrow'
  return shortDate(d)
}

/** "Sat, Oct 24 – Fri, Oct 30": the week starting `start`. */
export function weekSpan(start: Date): string {
  return `${shortDate(start)} – ${shortDate(plusDays(start, 6))}`
}

/** The Saturday a weekend preset lands on: this one (today, on a Saturday;
 *  the coming one, on a Sunday), or the one after. */
function saturday(now: Date, next: boolean): Date {
  const dow = now.getDay()
  return plusDays(midnight(now), (dow === 0 ? 6 : 6 - dow) + (next ? 7 : 0))
}

export interface PushTarget {
  /** The date line under the button. */
  sub: string
  updates: Partial<Task>
  /** What the wall says once it moved. */
  flash: string
}

/** Where each "move to" button on the wall puts a task, and how it says so. */
export function pushTargets(now: Date, weekStartsOn: WeekStart): Record<PushPreset, PushTarget> {
  const thisWeek = weekStartAnchor(now, weekStartsOn)
  const nextWeek = plusDays(thisWeek, 7)
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const monthName = nextMonth.toLocaleDateString('en-US', { month: 'long' })
  const loose = { scheduledFor: undefined, isSomeday: false, weekDeferredAt: undefined } as const
  const week = (start: Date, said: string): PushTarget => ({
    sub: weekSpan(start),
    updates: { ...loose, bucket: 'week', weekStart: start },
    flash: `Moved to ${said} · ${weekSpan(start)}`,
  })
  const weekend = (sat: Date, said: string): PushTarget => ({
    sub: shortDate(sat),
    updates: { scheduledFor: sat, isAllDay: true, bucket: 'timed', isSomeday: false, weekDeferredAt: undefined },
    flash: `Moved to ${said} · ${shortDate(sat)}`,
  })
  return {
    'this-week': week(thisWeek, 'this week'),
    'next-week': week(nextWeek, 'next week'),
    'this-weekend': weekend(saturday(now, false), 'this weekend'),
    'next-weekend': weekend(saturday(now, true), 'next weekend'),
    'next-month': {
      sub: monthName,
      updates: { ...loose, bucket: 'month', monthStart: nextMonth },
      flash: `Moved to next month · ${monthName}`,
    },
    someday: {
      sub: 'No date',
      updates: { ...loose, bucket: 'quarter' },
      flash: 'Moved to Someday',
    },
  }
}

export interface PlanWeek {
  /** The planned week's first day. */
  start: Date
  /** The first day still to plan: today, or the week's start. */
  from: Date
  /** The days still to plan, `from` through the week's last day. */
  days: Date[]
  /** "Wed, Oct 21 – Fri, Oct 23". */
  label: string
  /** What the wall says to Symphony to start. */
  opening: string
}

/** The week "Plan the week" means right now: the rest of this one, or the
 *  next one on this week's last day (the desktop Week page's own rule). */
export function planWeek(now: Date, weekStartsOn: WeekStart): PlanWeek {
  const anchor = weekStartAnchor(now, weekStartsOn)
  const today = midnight(now)
  const lastDay = localYmd(today) === localYmd(plusDays(anchor, 6))
  const start = lastDay ? plusDays(anchor, 7) : anchor
  const from = lastDay ? start : today
  const end = plusDays(start, 6)
  const days: Date[] = []
  for (let d = from; d <= end; d = plusDays(d, 1)) days.push(d)
  const label = `${shortDate(from)} – ${shortDate(end)}`
  const whole = localYmd(from) === localYmd(start)
  return {
    start, from, days, label,
    opening: whole ? `Help me plan the week of ${label}.` : `Help me plan the rest of this week, ${label}.`,
  }
}
