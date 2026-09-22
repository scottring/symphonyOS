// src/lib/planning/nudges.ts
//
// "Which period should I plan next?" — decided once, in one pure function, so
// Today, and anything else that wants to ask, all get the same quiet answer.
//
// Guidance only. A nudge navigates; it never writes. One nudge at a time,
// highest level first (year → season → month → week), and only inside that
// level's window: planning is guided, not required, so outside the windows the
// answer is null. No counts, no scores, no "weeks late".
//
// Completion comes from the household's saved planning_sessions, as a set of
// `${horizon}:${period_token}` strings. Both vocabularies are accepted — the
// planning_sessions horizon ('annual' | 'seasonal' | 'monthly' | 'weekly') and
// the cadence SessionHorizon ('year' | 'season' | 'month' | 'week') that
// `completedCadenceTokens` prefixes with — so a caller cannot wire it up wrong.

import type { WeekStart } from '@/lib/cadence/config'
import { weekStartAnchor, localYmd } from '@/lib/cadence/config'
import {
  seasonEndFor,
  seasonLabel,
  seasonStartFor,
  seasonToken,
  type Seasons,
} from '@/lib/cadence/seasons'
import { formatWeekRangeShort } from '@/lib/dateHelpers'

export type NudgeKind = 'first-use' | 'week' | 'month' | 'season' | 'year'

export interface PlanningNudgeResult {
  kind: NudgeKind
  /** The period token a dismissal is scoped to. */
  token: string
  text: string
  cta: string
  to: string
}

export interface PlanningNudgeInput {
  now: Date
  seasons: Seasons
  weekStartsOn: WeekStart
  /** `${horizon}:${period_token}` for every saved session in the household. */
  completed: ReadonlySet<string>
  /** true when the household has never saved a session (any horizon). */
  neverPlanned: boolean
  dismissedToken: string | null
  /** Restrict to one kind: Today asks only for the week (Scott via Codex,
   *  2026-09-22), so a year or season candidate above it in precedence is
   *  not the answer there. The first-use nudge counts as not-the-week. */
  only?: Exclude<NudgeKind, 'first-use'>
}

const DAY_MS = 86_400_000

/** The two prefixes a saved session can arrive under, per level. */
const PREFIXES: Record<Exclude<NudgeKind, 'first-use'>, readonly [string, string]> = {
  year: ['annual', 'year'],
  season: ['seasonal', 'season'],
  month: ['monthly', 'month'],
  week: ['weekly', 'week'],
}

function midnight(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/** Whole days from `a` to `b`, both taken at local midnight. */
function daysBetween(a: Date, b: Date): number {
  return Math.round((midnight(b).getTime() - midnight(a).getTime()) / DAY_MS)
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function monthTokenOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}`
}

function weekTokenOf(anchor: Date): string {
  return `${anchor.getFullYear()}-${anchor.getMonth() + 1}-${anchor.getDate()}`
}

/** Planned by anyone in the household, under either token vocabulary. */
function isPlanned(
  completed: ReadonlySet<string>,
  kind: Exclude<NudgeKind, 'first-use'>,
  token: string,
): boolean {
  return PREFIXES[kind].some((prefix) => completed.has(`${prefix}:${token}`))
}

/** The one nudge to show right now, or null. */
export function planningNudge(input: PlanningNudgeInput): PlanningNudgeResult | null {
  const { now, seasons, weekStartsOn, completed, neverPlanned, dismissedToken, only } = input

  // A dismissed first-use nudge falls through to the ordinary candidates
  // below rather than reappearing forever — "Not now" has to stay dismissed
  // here too, the same as any other token.
  if (!only && neverPlanned && dismissedToken !== 'first-use') {
    const year = now.getFullYear()
    return {
      kind: 'first-use',
      token: 'first-use',
      text: `Start with the year: plan ${year}, then the season, the month and the week.`,
      cta: `Plan ${year} →`,
      to: '/year',
    }
  }

  const candidates = [
    yearCandidate(now),
    seasonCandidate(now, seasons),
    monthCandidate(now),
    weekCandidate(now, weekStartsOn),
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    if (only && candidate.kind !== only) continue
    if (isPlanned(completed, candidate.kind, candidate.token)) continue
    if (dismissedToken !== null && dismissedToken === candidate.token) continue
    return candidate
  }
  return null
}

type Candidate = PlanningNudgeResult & { kind: Exclude<NudgeKind, 'first-use'> }

/**
 * From Nov 20 through Dec 31 the year to plan is NEXT year; Jan 1–14 it is the
 * year that has just started. Outside those two windows, nothing.
 */
function yearCandidate(now: Date): Candidate | null {
  const month = now.getMonth()
  const day = now.getDate()
  let target: number | null = null
  if (month === 11 || (month === 10 && day >= 20)) target = now.getFullYear() + 1
  else if (month === 0 && day <= 14) target = now.getFullYear()
  if (target === null) return null

  const token = String(target)
  return {
    kind: 'year',
    token,
    text: `${token} isn't planned yet.`,
    cta: `Plan ${token} →`,
    to: `/year?start=${token}-01-01`,
  }
}

/**
 * Within 14 days BEFORE the next boundary → the season about to start; within
 * 14 days AFTER a boundary → the season just started.
 */
function seasonCandidate(now: Date, seasons: Seasons): Candidate | null {
  const nextStart = seasonEndFor(now, seasons)
  const thisStart = seasonStartFor(now, seasons)

  let anchor: Date | null = null
  if (daysBetween(now, nextStart) <= 14) anchor = nextStart
  else if (daysBetween(thisStart, now) <= 14) anchor = thisStart
  if (!anchor) return null

  const label = seasonLabel(anchor, seasons)
  return {
    kind: 'season',
    token: seasonToken(anchor, seasons),
    text: `${label} isn't planned yet.`,
    cta: `Plan ${label} →`,
    to: '/season',
  }
}

/** Last 6 days of a month → next month; first 7 days → this month. */
function monthCandidate(now: Date): Candidate | null {
  const day = now.getDate()
  const total = daysInMonth(now.getFullYear(), now.getMonth())

  let anchor: Date | null = null
  if (day > total - 6) anchor = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  else if (day <= 7) anchor = new Date(now.getFullYear(), now.getMonth(), 1)
  if (!anchor) return null

  const label = anchor.toLocaleDateString('en-US', { month: 'long' })
  return {
    kind: 'month',
    token: monthTokenOf(anchor),
    text: `${label} isn't planned yet.`,
    cta: `Plan ${label} →`,
    to: '/month',
  }
}

/** Saturday/Sunday → the coming week; Monday/Tuesday → the week just started. */
function weekCandidate(now: Date, weekStartsOn: WeekStart): Candidate | null {
  const dow = now.getDay()
  let anchor: Date | null = null
  if (dow === 6 || dow === 0) {
    anchor = weekStartAnchor(new Date(now.getTime() + 7 * DAY_MS), weekStartsOn)
  } else if (dow === 1 || dow === 2) {
    anchor = weekStartAnchor(now, weekStartsOn)
  }
  if (!anchor) return null

  // The page opens on the current week, so a week that is not the current one
  // has to say which.
  const current = weekStartAnchor(now, weekStartsOn)
  const to = anchor.getTime() === current.getTime() ? '/week' : `/week?start=${localYmd(anchor)}`

  return {
    kind: 'week',
    token: weekTokenOf(anchor),
    text: `The week of ${formatWeekRangeShort(anchor)} isn't planned yet.`,
    cta: 'Plan the week →',
    to,
  }
}
