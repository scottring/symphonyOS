// src/lib/planning/v2/planV2.ts
//
// Pure rules behind the v2 planning pages (docs/planning/2026-09-28-planning-v2.md).
// A plan page reads the SAME records v1 does — commitments, the completion flag,
// the someday bucket, planning_sessions — and only draws them differently.

import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { parseLocalYmd } from '@/lib/cadence/config'
import { timingRemoval } from '@/lib/planning/planActions'

const SWITCH_KEY = 'symphony-plan-v2'

/**
 * Is the v2 planning page on for this device? It is the default; `?plan=v1`
 * opts a device back to the old pages and `?plan=v2` returns it, both
 * remembered. A build with `VITE_PLAN_V2=false` turns it off everywhere.
 */
export function planV2Enabled(search: string = typeof location !== 'undefined' ? location.search : ''): boolean {
  const asked = new URLSearchParams(search).get('plan')
  try {
    if (asked === 'v2') localStorage.setItem(SWITCH_KEY, 'on')
    else if (asked === 'v1') localStorage.setItem(SWITCH_KEY, 'off')
    const stored = localStorage.getItem(SWITCH_KEY)
    if (stored === 'on') return true
    if (stored === 'off') return false
  } catch { /* storage blocked: fall through to the build default */ }
  if (asked === 'v2') return true
  // On for everyone (Scott, 2026-09-29: ship the redesign to the household);
  // ?plan=v1 still opts a device back to the old pages, and a build with
  // VITE_PLAN_V2=false turns it off everywhere.
  return import.meta.env.VITE_PLAN_V2 !== 'false'
}

/** Turn v2 off on this device (the page's "Back to the current page" link). */
export function leavePlanV2(): void {
  try { localStorage.setItem(SWITCH_KEY, 'off') } catch { /* nothing to remember it in */ }
}

/** The people on a row — a legacy single assignee reads as a one-person list. */
export function assigneesOf(t: Pick<Task, 'assignedToAll' | 'assignedTo'>): string[] {
  return t.assignedToAll ?? (t.assignedTo ? [t.assignedTo] : [])
}

export type PlanView = 'list' | 'ref' | 'focus'
export function readPlanView(level: string): PlanView {
  try {
    const v = localStorage.getItem(`symphony-plan-v2.view.${level}`)
    if (v === 'list' || v === 'ref' || v === 'focus') return v
  } catch { /* default */ }
  return 'list'
}
export function writePlanView(level: string, v: PlanView): void {
  try { localStorage.setItem(`symphony-plan-v2.view.${level}`, v) } catch { /* per-visit only */ }
}

/**
 * What became of a line on THIS period's plan. Read off the row's own records,
 * relative to the period on screen: a September line carried into October is
 * `carried` on September and `open` on October.
 */
export type LineFate = 'open' | 'done' | 'carried' | 'someday' | 'dropped'

function inPeriod(d: Date, start: Date, end: Date): boolean {
  return d.getTime() >= start.getTime() && d.getTime() < end.getTime()
}

export function lineFate(t: Task, level: 'month' | 'season', start: Date, end: Date): LineFate {
  if (t.completed) return 'done'
  const here = (t.commitments ?? []).filter((c) => c.level === level && inPeriod(c.periodStart, start, end))
  if (here.some((c) => c.status === 'open')) return t.bucket === 'someday' ? 'someday' : 'open'
  if (here.some((c) => c.status === 'carried')) return 'carried'
  // Someday ends the period's commitment too (the bucket write removes it), so
  // it is read before a removed commitment is taken to mean Dropped.
  if (t.bucket === 'someday') return 'someday'
  if (here.length > 0 && here.every((c) => c.status === 'removed')) return 'dropped'
  return 'open'
}

/**
 * Lines whose commitment to this period has ENDED — dropped, or parked for
 * someday. v1's list leaves them off (committedTo skips a removed commitment);
 * v2 keeps them as the period's record, and `lineFate` says which they are.
 */
export function endedIn(tasks: readonly Task[], level: 'month' | 'season', start: Date, end: Date): Task[] {
  return tasks.filter((t) => {
    const here = (t.commitments ?? []).filter((c) => c.level === level && inPeriod(c.periodStart, start, end))
    return here.length > 0 && here.every((c) => c.status === 'removed')
  })
}

/** The unfinished lines a close-out asks about: open, not done, not parked. */
export function closeOutCandidates(lines: readonly Task[], level: 'month' | 'season', start: Date, end: Date): Task[] {
  return lines.filter((t) => lineFate(t, level, start, end) === 'open')
}

/** A date we can't move: an all-day or multi-day calendar entry. Days are inclusive. */
export interface Landmark { id: string; title: string; start: Date; end: Date }

function dayOf(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function readTime(raw: string | undefined): Date | null {
  if (!raw) return null
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parseLocalYmd(raw) : new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** The school's specials rotation ("Specials — Ella: PE · Kaleb: Music"): a
 *  reminder for the bag, read on the wall and the week, never a fixed date. */
const SPECIALS = /^specials?\s*[—–:-]/i

/** All-day series that come round every week or more often ("Trash day"):
 *  the rhythm of the week, not a date in it. A monthly or yearly series
 *  (tuition due, a birthday) stays. */
function weeklySeries(events: readonly CalendarEvent[]): Set<string> {
  const days = new Map<string, number[]>()
  for (const e of events) {
    const series = e.recurring_event_id ?? e.recurringEventId
    const raw = e.start_time ?? e.startTime
    if (!series || !raw) continue
    const t = parseLocalYmd(raw.slice(0, 10)).getTime()
    if (!Number.isNaN(t)) days.set(series, [...(days.get(series) ?? []), t])
  }
  const out = new Set<string>()
  for (const [series, ts] of days) {
    const sorted = [...new Set(ts)].sort((a, b) => a - b)
    if (sorted.some((t, i) => i > 0 && t - sorted[i - 1] <= 7.5 * 86_400_000)) out.add(series)
  }
  return out
}

/**
 * The fixed shape of a period: closures, deadlines, stretches — all-day events,
 * and timed events that run 20 hours or more. An ordinary appointment is not a
 * landmark; it stays on Week and Today (the brief: "don't flood monthly
 * planning with the entire calendar"). Nor is a reminder that comes round
 * every week or every school day — the specials rotation, a weekly all-day
 * series (Scott, 2026-10-02: Ella's and Kaleb's specials filled October).
 */
export function landmarksIn(events: readonly CalendarEvent[], start: Date, end: Date): Landmark[] {
  const out: Landmark[] = []
  const seen = new Set<string>()
  const weekly = weeklySeries(events)
  for (const e of events) {
    if (SPECIALS.test((e.title ?? '').trim())) continue
    const series = e.recurring_event_id ?? e.recurringEventId
    if (series && weekly.has(series)) continue
    const allDay = !!(e.all_day ?? e.allDay)
    // An all-day entry names a calendar DATE. Read as a timestamp it is UTC
    // midnight — the evening before in any US zone — and Election Day drew
    // across Monday and Tuesday (seen on the demo account, 2026-09-28).
    const asDate = (raw: string | undefined) => (allDay && raw ? raw.slice(0, 10) : raw)
    const s = readTime(asDate(e.start_time ?? e.startTime))
    if (!s) continue
    let first: Date, last: Date
    const rawEnd = readTime(asDate(e.end_time ?? e.endTime))
    if (allDay) {
      first = dayOf(s)
      // An all-day end is exclusive (Google): the last day is the day before.
      last = rawEnd && rawEnd > s ? dayOf(new Date(rawEnd.getTime() - 1)) : first
    } else {
      if (!rawEnd || rawEnd.getTime() - s.getTime() < 20 * 3600_000) continue
      first = dayOf(s)
      last = dayOf(new Date(rawEnd.getTime() - 1))
    }
    if (last < start || first >= end) continue
    const key = `${(e.title ?? '').trim().toLowerCase()}|${first.getTime()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: e.id, title: e.title || '(no title)', start: first, end: last })
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime())
}

/**
 * The write for a line put down on a month's calendar, or back on its list.
 * A DAY dates it; a WEEK gives it that week (off its day, if it had one); the
 * LIST takes both away and leaves the month's own commitment.
 *
 * The week never rides with a stated commitment list: planPlacement honours
 * a stated list over the week the dialect names, so `{ commitments, bucket:
 * 'week', weekStart }` saved nothing (found live, 2026-09-28).
 */
export function lineDropUpdates(task: Task, target: { kind: 'day' | 'week'; at: Date } | { kind: 'list' }): Partial<Task> {
  if (target.kind === 'day') return { isAllDay: true, scheduledFor: target.at, bucket: 'timed' }
  if (target.kind === 'week') return { ...(task.scheduledFor ? timingRemoval(task, 'day').updates : {}), bucket: 'week', weekStart: target.at }
  return timingRemoval(task, 'all').updates
}

/**
 * Whether the period before is ready to be closed out. A look-back decides a
 * period's open work for good, so it waits until that period is in its last
 * stretch — a week's last day, a month's last week, a season's last two
 * weeks, a year's December — or over. Planning November on Oct 2 had carried
 * October's work out of October with three weeks still to run (walkthrough
 * 2026-10-02 #34). `prevEnd` is the period's exclusive end.
 */
export function lookBackOpen(level: 'week' | 'month' | 'season' | 'year', prevEnd: Date, today: Date): boolean {
  const window = { week: 1, month: 7, season: 14, year: 31 }[level]
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return prevEnd.getTime() - start <= window * 86_400_000
}

/**
 * A carried line whose words name the period it came from ("Come up with
 * October business plan", carried to November) — the same words with the new
 * period's name, offered as a rename; null when the title doesn't name it.
 */
export function renamedForPeriod(title: string, from: string, to: string): string | null {
  const re = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
  return from && from !== to && re.test(title) ? title.replace(re, to) : null
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * The day a week-list line names ("Talk to Tim on Monday"), inside the week
 * being planned — or null when it names none, or names a day already past.
 * Whole weekday names only, so "Sat down with…" isn't a Saturday. The words
 * stay in the title; only the day is read from them (walkthrough 2026-10-02
 * #20: the line landed under "Any day").
 */
export function dayNamedIn(title: string, weekStart: Date, today: Date): Date | null {
  const m = title.toLowerCase().match(new RegExp(`\\b(${WEEKDAYS.join('|')})\\b`))
  if (!m) return null
  const want = WEEKDAYS.indexOf(m[1])
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
    if (d.getDay() !== want) continue
    const day0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    return d < day0 ? null : d
  }
  return null
}
