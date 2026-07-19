// src/components/planning/guided/periods.ts
//
// Period token + label + date-range per horizon, plus the threshold rule for
// which period a session should actually plan. TOKENS MUST MATCH the rows
// already in planning_sessions: annual '2026', seasonal '2026-S2', monthly
// '2026-7'. Weekly moved from Monday-ISO `isoWeekId` to the cadence-config
// week anchor's date (the same string `weekToken` produces) in the
// week-boundary unification — see docs/superpowers/specs/
// 2026-07-19-week-boundary-and-midperiod-planning-spec.md; that one-time
// legacy-row orphaning is deliberate. Daily is ISO date.

import type { PlanningHorizon } from '@/hooks/usePlanningSession'
import { MONTH_NAMES, SEASON_NAMES, seasonIndex, seasonStart, seasonEnd } from '@/lib/cadence/periods'
import { readCadenceConfig, weekStartAnchor, weekToken } from '@/lib/cadence/config'

export interface GuidedPeriod {
  token: string
  label: string
  start: Date
  end: Date
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
      const weekStartsOn = readCadenceConfig().weekStartsOn
      const start = weekStartAnchor(now, weekStartsOn)
      const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999)
      return {
        token: weekToken(now, weekStartsOn),
        label: `Week of ${MONTH_NAMES[start.getMonth()]} ${start.getDate()}`,
        start, end,
      }
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

// ── The threshold rule ──────────────────────────────────────────────────────
// A session late in its period should plan the NEXT period — a Saturday "plan
// the week" that targets the week ending tomorrow is dead on arrival. Cutoffs
// are in days remaining (counting today): weekly inside the last 3 days,
// monthly the last week, seasonal the last 3 weeks, annual from Nov 1.

export type PlanMode = 'fresh' | 'midstream' | 'next'

const NEXT_CUTOFF_DAYS: Partial<Record<PlanningHorizon, number>> = {
  weekly: 3, monthly: 7, seasonal: 21, annual: 61,
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days left in the period, counting today. Counts calendar days
 *  (midnight to midnight, rounded) so a DST hour never shifts the answer.
 *  Seasonal `end` is exclusive (midnight of the first day after) — the others
 *  end at 23:59 on their last day. */
export function daysRemainingIn(period: GuidedPeriod, now: Date = new Date()): number {
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const last = new Date(period.end)
  if (last.getHours() === 0 && last.getMinutes() === 0) last.setDate(last.getDate() - 1)
  last.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((last.getTime() - today.getTime()) / DAY_MS) + 1)
}

/** The period after the one containing `now` for this horizon. */
export function nextGuidedPeriod(horizon: PlanningHorizon, now: Date = new Date()): GuidedPeriod {
  const current = guidedPeriod(horizon, now)
  const after = new Date(current.end)
  after.setDate(after.getDate() + 1)
  after.setHours(12, 0, 0, 0)
  return guidedPeriod(horizon, after)
}

/** Which period a session started at `now` should plan, per the threshold
 *  rule. Daily always plans today. */
export function plannablePeriod(
  horizon: PlanningHorizon,
  now: Date = new Date(),
): { period: GuidedPeriod; mode: PlanMode } {
  const current = guidedPeriod(horizon, now)
  if (horizon === 'daily') return { period: current, mode: 'fresh' }
  const cutoff = NEXT_CUTOFF_DAYS[horizon]
  if (cutoff !== undefined && daysRemainingIn(current, now) <= cutoff) {
    return { period: nextGuidedPeriod(horizon, now), mode: 'next' }
  }
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const start = new Date(current.start); start.setHours(0, 0, 0, 0)
  return { period: current, mode: today.getTime() > start.getTime() ? 'midstream' : 'fresh' }
}

// ── Target resolution for the session shell ────────────────────────────────
// The shell defaults to the threshold rule ('auto') but the user can pin the
// other candidate — "plan the rest of this week instead" / "plan next month
// instead". `alt` is the flip the header offers (null when only one target
// makes sense: daily, or a fresh period-start session).

export type GuidedTargetChoice = 'auto' | 'current' | 'next'

export interface GuidedTarget {
  period: GuidedPeriod
  mode: PlanMode
  alt: { target: GuidedTargetChoice; label: string } | null
}

export function resolveGuidedTarget(
  horizon: PlanningHorizon,
  choice: GuidedTargetChoice,
  now: Date = new Date(),
): GuidedTarget {
  const current = guidedPeriod(horizon, now)
  if (horizon === 'daily') return { period: current, mode: 'fresh', alt: null }
  if (choice === 'current') {
    const { mode } = plannablePeriod(horizon, now)
    return {
      period: current,
      mode: mode === 'next' ? 'midstream' : mode,
      alt: { target: 'next', label: nextGuidedPeriod(horizon, now).label },
    }
  }
  if (choice === 'next') {
    return {
      period: nextGuidedPeriod(horizon, now), mode: 'next',
      alt: { target: 'current', label: current.label },
    }
  }
  const auto = plannablePeriod(horizon, now)
  if (auto.mode === 'next') return { ...auto, alt: { target: 'current', label: current.label } }
  if (auto.mode === 'midstream') return { ...auto, alt: { target: 'next', label: nextGuidedPeriod(horizon, now).label } }
  return { ...auto, alt: null }
}
