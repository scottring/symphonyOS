// src/lib/planning/planSchedule.ts
//
// When the Month, Season and Year conversations come to you (spec
// 2026-10-14, "The schedule"; mockup frame "After 2"):
//
//   Plan {Month}   3 days before the month starts → day 7 of the month
//   Plan {Season}  7 days before the season starts → day 14 of the season
//                  (the household's seasons, households.seasons)
//   Plan {Year}    Dec 25 → Jan 14
//
// A talk is due only while the coming period's list is still empty, and not
// while it is put off: "Later" until tomorrow, "Not this time" until the
// next period (per browser — a viewer's preference, localStorage). When
// several are due, they come one at a time: Year, then Season, then Month.
// Nothing here renders or writes to the database.

import type { Task } from '@/types/task'
import type { Seasons } from '@/lib/cadence/seasons'
import { seasonStartFor, nextSeasonStart, seasonEndFor, seasonLabel } from '@/lib/cadence/seasons'
import { localYmd } from '@/lib/cadence/config'
import { selectPeriodTasks } from './periodPage'

export type TalkLevel = 'year' | 'season' | 'month'

export interface PlanTalk {
  level: TalkLevel
  /** The period the talk plans: its first day (midnight) and exclusive end. */
  start: Date
  end: Date
  /** "November", "Winter", "2027". */
  name: string
  /** "month:2026-11-01" — what a dismissal is scoped to. */
  key: string
  /** The chip ("Plan November") and what it sends ("Plan November."). */
  label: string
  message: string
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** Year first, then the season, then the month (spec: one at a time). */
export const TALK_ORDER: readonly TalkLevel[] = ['year', 'season', 'month']

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

function talk(level: TalkLevel, start: Date, end: Date, name: string): PlanTalk {
  return { level, start, end, name, key: `${level}:${localYmd(start)}`, label: `Plan ${name}`, message: `Plan ${name}.` }
}

/** The talk whose window `today` falls in, at one level, or null. */
export function talkFor(level: TalkLevel, today: Date, seasons: Seasons): PlanTalk | null {
  const d = midnight(today)
  if (level === 'month') {
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const cur = new Date(d.getFullYear(), d.getMonth(), 1)
    // From 3 days before it starts, through day 7.
    const start = d >= addDays(next, -3) ? next : d < addDays(cur, 7) ? cur : null
    return start ? talk('month', start, new Date(start.getFullYear(), start.getMonth() + 1, 1), MONTHS[start.getMonth()]) : null
  }
  if (level === 'season') {
    const next = nextSeasonStart(d, seasons)
    const cur = seasonStartFor(d, seasons)
    // From 7 days before it starts, through day 14.
    const start = d >= addDays(next, -7) ? next : d < addDays(cur, 14) ? cur : null
    return start ? talk('season', start, seasonEndFor(start, seasons), seasonLabel(start, seasons).replace(/\s\d{4}$/, '')) : null
  }
  // Dec 25 through Jan 14.
  const year = d.getMonth() === 11 && d.getDate() >= 25 ? d.getFullYear() + 1
    : d.getMonth() === 0 && d.getDate() <= 14 ? d.getFullYear() : null
  return year === null ? null : talk('year', new Date(year, 0, 1), new Date(year + 1, 0, 1), String(year))
}

// ---- Putting it off (per browser) -----------------------------------------

export interface TalkDismissals {
  /** key → the local day "Later" was said; hidden for the rest of that day. */
  later: Record<string, string>
  /** key → put off for that whole period ("Not this time"). */
  skipped: Record<string, true>
}

const STORAGE_KEY = 'symphony.planTalk.dismissed'
/** Fired after a dismissal, so another chip on screen hides too. */
export const TALK_DISMISSED_EVENT = 'symphony:plan-talk-dismissed'

export function readDismissals(): TalkDismissals {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (raw && typeof raw === 'object') {
      return {
        later: raw.later && typeof raw.later === 'object' ? raw.later : {},
        skipped: raw.skipped && typeof raw.skipped === 'object' ? raw.skipped : {},
      }
    }
  } catch { /* private window, or junk: nothing is put off */ }
  return { later: {}, skipped: {} }
}

function writeDismissals(next: TalkDismissals) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(TALK_DISMISSED_EVENT))
  } catch { /* the chip still hides for this visit */ }
}

/** "Later": hidden until tomorrow. */
export function putOffUntilTomorrow(t: PlanTalk, today: Date): void {
  const d = readDismissals()
  writeDismissals({ ...d, later: { ...d.later, [t.key]: localYmd(today) } })
}

/** "Not this time": hidden until the next period (another key). */
export function skipThisTime(t: PlanTalk): void {
  const d = readDismissals()
  writeDismissals({ ...d, skipped: { ...d.skipped, [t.key]: true } })
}

export function isPutOff(t: PlanTalk, today: Date, d: TalkDismissals): boolean {
  return !!d.skipped[t.key] || d.later[t.key] === localYmd(today)
}

// ---- What is due -------------------------------------------------------------

/** Every talk due today, Year → Season → Month. `isEmpty` says whether the
 *  talk's period has nothing on its list yet. */
export function dueTalks(today: Date, seasons: Seasons, isEmpty: (t: PlanTalk) => boolean, dismissals: TalkDismissals): PlanTalk[] {
  return TALK_ORDER
    .map((level) => talkFor(level, today, seasons))
    .filter((t): t is PlanTalk => !!t && isEmpty(t) && !isPutOff(t, today, dismissals))
}

export interface ListSources {
  tasks: readonly Task[]
  /** Year goals (goals rows); only their year and status are read. */
  goals: readonly { year: number; status: string }[]
  /** The signed-in member: month and season lists are scoped to them, as the
   *  pages are with nobody chosen in the people filter. */
  meId: string | null
  seasons: Seasons
  today: Date
}

/** Whether the talk's period has nothing on its list (open or done). */
export function listIsEmpty(t: PlanTalk, src: ListSources): boolean {
  if (t.level === 'year') return !src.goals.some((g) => g.year === t.start.getFullYear() && g.status !== 'archived')
  const isCurrent = src.today >= t.start && src.today < t.end
  return selectPeriodTasks(src.tasks, t.level, t.start, isCurrent, src.meId, src.seasons).length === 0
}

/** "November starts Sunday", "Winter starts tomorrow", "November has begun". */
export function talkLead(t: PlanTalk, today: Date): string {
  const days = Math.round((t.start.getTime() - midnight(today).getTime()) / 86_400_000)
  if (days < 0) return `${t.name} has begun`
  if (days === 0) return `${t.name} starts today`
  if (days === 1) return `${t.name} starts tomorrow`
  return `${t.name} starts ${t.start.toLocaleDateString('en-US', { weekday: 'long' })}`
}
