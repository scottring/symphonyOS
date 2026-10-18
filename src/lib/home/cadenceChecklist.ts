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
import { periodBounds } from '@/lib/planning/periodPage'

export type ChecklistLevel = 'year' | 'season' | 'month' | 'week'

export interface ChecklistStep {
  /** "Reviewed week 42" once done, "Review week 42" until then. */
  label: string
  done: boolean
  /** The dates, when the name alone doesn't carry them ("Oct 10 – 16"). */
  dates?: string
  to: string
}
export interface ChecklistRow { review: ChecklistStep; plan: ChecklistStep }

interface Slot { horizon: SessionHorizon; token: string; word: string; dates?: string; to: string }
export interface ChecklistSlots { review: Slot; plan: Slot }

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
  const month = periodBounds('month', today, seasons), lastMonth = periodBounds('month', month.prev, seasons)
  const season = periodBounds('season', today, seasons), lastSeason = periodBounds('season', season.prev, seasons)
  const year = today.getFullYear()
  return {
    week: { review: weekSlot(lastWeek, true), plan: weekSlot(week, false) },
    month: {
      review: { horizon: 'monthly', token: monthToken(lastMonth.start), word: word(lastMonth.label), to: `/month?start=${localYmd(lastMonth.start)}&review=1` },
      plan: { horizon: 'monthly', token: monthToken(month.start), word: word(month.label), to: '/month?plan=1' },
    },
    season: {
      review: { horizon: 'seasonal', token: seasonToken(lastSeason.start, seasons), word: word(lastSeason.label), to: `/season?start=${localYmd(lastSeason.start)}&review=1` },
      plan: { horizon: 'seasonal', token: seasonToken(season.start, seasons), word: word(season.label), to: '/season?plan=1' },
    },
    year: {
      review: { horizon: 'annual', token: yearToken(year - 1), word: String(year - 1), to: `/year?start=${year - 1}-01-01&review=1` },
      plan: { horizon: 'annual', token: yearToken(year), word: String(year), to: '/year?plan=1' },
    },
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
  })
  return { year: row(slots.year), season: row(slots.season), month: row(slots.month), week: row(slots.week) }
}

/** Every token the checklist reads, for one query. */
export function checklistTokens(slots: Record<ChecklistLevel, ChecklistSlots>): string[] {
  return [...new Set(Object.values(slots).flatMap((x) => [x.review.token, x.plan.token]))]
}
