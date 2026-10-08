// src/lib/voiceOnboarding/periods.ts
//
// The explicit periods a voice plan is written into — this year, this
// season (the household's own boundaries), this month, this week (the
// household's week start) and today — and their names for the cards.

import { seasonLabel, seasonStartFor, type Seasons } from '@/lib/cadence/seasons'
import { weekStartAnchor, type WeekStart } from '@/lib/cadence/config'
import { monthStartOf } from '@/lib/planning/periodPlacement'
import type { DraftPeriods, PeriodLabels } from './flow'
import { parseLocalYmd } from '@/lib/cadence/config'

export interface PlanPeriods {
  year: number
  seasonStart: Date
  monthStart: Date
  weekStart: Date
  today: Date
  labels: PeriodLabels
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function planPeriods(now: Date, seasons: Seasons, weekStartsOn: WeekStart): PlanPeriods {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = weekStartAnchor(today, weekStartsOn)
  return {
    year: today.getFullYear(),
    seasonStart: seasonStartFor(today, seasons),
    monthStart: monthStartOf(today),
    weekStart,
    today,
    labels: {
      year: String(today.getFullYear()),
      season: seasonLabel(today, seasons).split(' ')[0],
      month: MONTHS[today.getMonth()],
      week: weekRange(weekStart),
      today: DAYS[today.getDay()],
    },
  }
}

/** "Oct 4 – 10", or "Sep 28 – Oct 4" across a month. */
function weekRange(start: Date): string {
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  const head = `${SHORT[start.getMonth()]} ${start.getDate()}`
  return start.getMonth() === end.getMonth() ? `${head} – ${end.getDate()}` : `${head} – ${SHORT[end.getMonth()]} ${end.getDate()}`
}

/** The names of a session's FIXED periods (draft.periods), so a session
 *  resumed later still names — and writes — what it planned. */
export function labelsForPeriods(p: DraftPeriods, seasons: Seasons): PeriodLabels {
  const season = parseLocalYmd(p.seasonStart)
  const month = parseLocalYmd(p.monthStart)
  const week = parseLocalYmd(p.weekStart)
  const today = parseLocalYmd(p.today)
  return {
    year: String(p.year),
    season: seasonLabel(season, seasons).split(' ')[0],
    month: MONTHS[month.getMonth()],
    week: weekRange(week),
    today: DAYS[today.getDay()],
  }
}
