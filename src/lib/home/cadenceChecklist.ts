// Where you are in the planning rhythm (Scott, 2026-10-17): for each horizon,
// two steps — the period before reviewed (the review by hand, PeriodReview)
// and this period planned ("I'm happy with …") — read from planning_sessions.
// A review is `notes.periodReview` on the reviewed period's row; planned is
// `notes.savedAt` on this period's row. Each open step links to where it is
// done: the review by hand, or planning by hand (PeriodPlan).

import type { SessionHorizon } from '@/hooks/usePlanningSession'
import { monthToken, weekToken, yearToken } from '@/hooks/usePlanningSession'
import { seasonToken, type Seasons } from '@/lib/cadence/seasons'
import { localYmd, weekStartAnchor, type WeekStart } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { deckWeekUrl } from '@/lib/planning/deck'
import { periodBounds, type PeriodBounds } from '@/lib/planning/periodPage'
import { REVIEW_WINDOW_DAYS, reviewTarget } from '@/lib/planning/periodReview'

export type ChecklistLevel = 'year' | 'season' | 'month' | 'week'

export interface ChecklistStep {
  /** "Reviewed week 42" once done, "Review week 42" until then. */
  label: string
  done: boolean
  /** The dates, when the name alone doesn't carry them ("Oct 10 – 16"). */
  dates?: string
  to: string
}
/** Which step the period's own page has due now (its one button), if any. */
export type DueStep = 'review' | 'plan'
export interface ChecklistRow { review: ChecklistStep; plan: ChecklistStep; due?: DueStep }

interface Slot { horizon: SessionHorizon; token: string; word: string; dates?: string; to: string }
export interface ChecklistSlots { review: Slot; plan: Slot; due?: DueStep }

const md = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const weekDates = (start: Date) => {
  const last = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  return start.getMonth() === last.getMonth() ? `${md(start)} – ${last.getDate()}` : `${md(start)} – ${md(last)}`
}
const word = (label: string) => label.replace(/\s\d{4}$/, '')

/** The period before and this one, for each horizon, as of `today`. */
export function checklistSlots(today: Date, weekStartsOn: WeekStart, seasons: Seasons): Record<ChecklistLevel, ChecklistSlots> {
  const week = weekStartAnchor(today, weekStartsOn)
  const lastWeek = new Date(week.getFullYear(), week.getMonth(), week.getDate() - 7)
  // Last week is reviewed by the deck opened on THIS week: the deck on week W
  // looks back at W − 1 and records W − 1's review (the token read here).
  const weekSlot = (start: Date, review: boolean): Slot => ({
    horizon: 'weekly', token: weekToken(start), word: `week ${weekOfYear(start, weekStartsOn)}`, dates: weekDates(start),
    to: review ? deckWeekUrl(week) : '/week?view=alongside&plan=1',
  })
  const month = periodBounds('month', today, seasons)
  const season = periodBounds('season', today, seasons)
  const year = today.getFullYear()
  // Month, Season and Year say what their own page's one button says
  // (reviewed design, 2026-10-20). Under way: last period reviewed, this one
  // planned, and planning is due until it is. In the period's last days
  // (REVIEW_WINDOW_DAYS): this period reviewed, the next one planned, and the
  // review is due — "Review October" walks on into planning November. Year is
  // reference: its plan is due only Jan 1–14.
  const closing = (b: PeriodBounds, days: number) => reviewTarget(b, today, days) === 'this'
  const path = { monthly: '/month', seasonal: '/season', annual: '/year' } as const
  const slot = (horizon: keyof typeof path, start: Date, token: string, label: string, step: 'review' | 'plan'): Slot => ({
    horizon, token, word: word(label), to: `${path[horizon]}?start=${localYmd(start)}&${step}=1`,
  })
  const monthClosing = closing(month, REVIEW_WINDOW_DAYS.month)
  const monthPrev = periodBounds('month', month.prev, seasons), monthNext = periodBounds('month', month.next, seasons)
  const seasonClosing = closing(season, REVIEW_WINDOW_DAYS.season)
  const seasonPrev = periodBounds('season', season.prev, seasons), seasonNext = periodBounds('season', season.next, seasons)
  const yearClosing = closing(periodBounds('year', today, seasons), REVIEW_WINDOW_DAYS.year)
  const yearWindow = today.getMonth() === 0 && today.getDate() <= 14
  const monthSlot = (b: PeriodBounds, step: 'review' | 'plan') => slot('monthly', b.start, monthToken(b.start), b.label, step)
  const seasonSlot = (b: PeriodBounds, step: 'review' | 'plan') => slot('seasonal', b.start, seasonToken(b.start, seasons), b.label, step)
  const yearSlot = (y: number, step: 'review' | 'plan') => slot('annual', new Date(y, 0, 1), yearToken(y), String(y), step)
  return {
    week: { review: weekSlot(lastWeek, true), plan: weekSlot(week, false) },
    month: monthClosing
      ? { review: monthSlot(month, 'review'), plan: monthSlot(monthNext, 'plan'), due: 'review' }
      : { review: monthSlot(monthPrev, 'review'), plan: monthSlot(month, 'plan'), due: 'plan' },
    season: seasonClosing
      ? { review: seasonSlot(season, 'review'), plan: seasonSlot(seasonNext, 'plan'), due: 'review' }
      : { review: seasonSlot(seasonPrev, 'review'), plan: seasonSlot(season, 'plan'), due: 'plan' },
    year: yearClosing
      ? { review: yearSlot(year, 'review'), plan: yearSlot(year + 1, 'plan'), due: 'review' }
      : { review: yearSlot(year - 1, 'review'), plan: yearSlot(year, 'plan'), ...(yearWindow ? { due: 'plan' as const } : {}) },
  }
}

export type SessionRow = { horizon: string; period_token: string; notes?: { savedAt?: string; periodReview?: { at?: string } } | null }

/** Each horizon's two steps, from the household's planning_sessions rows. */
export function checklistRows(slots: Record<ChecklistLevel, ChecklistSlots>, rows: readonly SessionRow[]): Record<ChecklistLevel, ChecklistRow> {
  const on = (s: Slot) => rows.filter((r) => r.horizon === s.horizon && r.period_token === s.token)
  const step = (s: Slot, done: boolean, verb: 'Review' | 'Plan'): ChecklistStep => ({
    label: `${done ? (verb === 'Review' ? 'Reviewed' : 'Planned') : verb} ${s.word}`, done, to: s.to, ...(s.dates ? { dates: s.dates } : {}),
  })
  const row = (x: ChecklistSlots): ChecklistRow => ({
    review: step(x.review, on(x.review).some((r) => !!r.notes?.periodReview?.at), 'Review'),
    plan: step(x.plan, on(x.plan).some((r) => !!r.notes?.savedAt), 'Plan'),
    ...(x.due ? { due: x.due } : {}),
  })
  return { year: row(slots.year), season: row(slots.season), month: row(slots.month), week: row(slots.week) }
}

/** Every token the checklist reads, for one query. */
export function checklistTokens(slots: Record<ChecklistLevel, ChecklistSlots>): string[] {
  return [...new Set(Object.values(slots).flatMap((x) => [x.review.token, x.plan.token]))]
}
