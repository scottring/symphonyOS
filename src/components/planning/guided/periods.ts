// src/components/planning/guided/periods.ts
//
// Period token + label + date-range per horizon. TOKENS MUST MATCH the rows
// already in planning_sessions (written by CadenceSessions / the weekly
// session): annual '2026', seasonal '2026-S2', monthly '2026-7'. Weekly reuses
// the exact function the old weekly session used (verified in the plan's
// Task 1 Step 1). Daily is new: ISO date.

import type { PlanningHorizon } from '@/hooks/usePlanningSession'
import { MONTH_NAMES, SEASON_NAMES, seasonIndex, seasonStart, seasonEnd } from '@/lib/cadence/periods'
import { isoWeekId } from '../weekly/weeklyPlanning'

export interface GuidedPeriod {
  token: string
  label: string
  start: Date
  end: Date
}

function startOfWeek(now: Date): Date {
  const d = new Date(now); d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - ((day + 6) % 7)) // back to Monday
  return d
}

export function guidedPeriod(horizon: PlanningHorizon, now: Date = new Date()): GuidedPeriod {
  const y = now.getFullYear()
  switch (horizon) {
    case 'annual': {
      return {
        token: `${y}`, label: `${y}`,
        start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59),
      }
    }
    case 'seasonal': {
      const s = seasonIndex(now)
      return {
        token: `${y}-S${s}`, label: `${SEASON_NAMES[s]} ${y}`,
        start: seasonStart(now), end: seasonEnd(now),
      }
    }
    case 'monthly': {
      return {
        token: `${y}-${now.getMonth() + 1}`, label: `${MONTH_NAMES[now.getMonth()]} ${y}`,
        start: new Date(y, now.getMonth(), 1), end: new Date(y, now.getMonth() + 1, 0, 23, 59, 59),
      }
    }
    case 'weekly': {
      const start = startOfWeek(now)
      const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999)
      const token = isoWeekId(start)
      const label = `Week of ${MONTH_NAMES[start.getMonth()]} ${start.getDate()}`
      return { token, label, start, end }
    }
    case 'daily': {
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const start = new Date(now); start.setHours(0, 0, 0, 0)
      const end = new Date(now); end.setHours(23, 59, 59, 999)
      return {
        token: `${y}-${mm}-${dd}`,
        label: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        start, end,
      }
    }
  }
}
