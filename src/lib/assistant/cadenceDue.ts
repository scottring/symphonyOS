// "Which planning ritual is overdue, and by how much" — the state-aware successor
// to getDueSession's day-of-week check.
//
// getDueSession (lib/cadence/config.ts) answers "is today the anchor day". That
// fires on Sunday whether or not last Sunday's session ever happened, and it has
// no idea a month was skipped. This answers the question the assistant actually
// needs: is the CURRENT period's ritual undone, and how late is it?
//
// Completion comes from planning_sessions rows, keyed `${horizon}:${period_token}`.
// Token formats must match lib/cadence/config.ts exactly — that module is
// canonical for them.

import type { CadenceConfig, SessionHorizon } from '@/lib/cadence/config'
import { weekStartAnchor, weekToken } from '@/lib/cadence/config'

export interface CadenceOverdue {
  kind: SessionHorizon
  token: string
  /** Human label for the CTA, matching DueSession.label wording. */
  label: string
  /** Whole weeks between the period's anchor and now. 0 = due, not yet late. */
  weeksLate: number
}

const WEEK_MS = 7 * 86_400_000

function wholeWeeksSince(anchor: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / WEEK_MS))
}

/**
 * Meteorological season index + its start date. Token format mirrors
 * config.ts's seasonToken (Dec→S0, keeping Dec with Jan/Feb).
 */
function seasonAnchor(now: Date): { token: string; start: Date } {
  const s = Math.floor(((now.getMonth() + 1) % 12) / 3)
  const startMonth = [11, 2, 5, 8][s]
  // A December date belongs to a season that started that same December; a
  // Jan/Feb date belongs to one that started the PREVIOUS December.
  const year = startMonth === 11 && now.getMonth() !== 11
    ? now.getFullYear() - 1
    : now.getFullYear()
  return { token: `${now.getFullYear()}-S${s}`, start: new Date(year, startMonth, 1) }
}

/**
 * Priority year → season → month → week, so the bigger unplanned ritual wins —
 * matching getDueSession's precedence. Returns null when every ritual for the
 * current periods is already recorded.
 */
export function computeCadenceOverdue(
  config: CadenceConfig,
  now: Date,
  completedTokens: Set<string>,
): CadenceOverdue | null {
  const yearToken = `${now.getFullYear()}`
  if (!completedTokens.has(`year:${yearToken}`)) {
    // Annual anchor is September 1 (see config.ts getDueSession). Before it, the
    // year's ritual isn't yet owed.
    const anchor = new Date(now.getFullYear(), 8, 1)
    if (now >= anchor) {
      return {
        kind: 'year', token: yearToken, label: 'the year',
        weeksLate: wholeWeeksSince(anchor, now),
      }
    }
  }

  const season = seasonAnchor(now)
  if (!completedTokens.has(`season:${season.token}`)) {
    return {
      kind: 'season', token: season.token, label: 'the season',
      weeksLate: wholeWeeksSince(season.start, now),
    }
  }

  const monthToken = `${now.getFullYear()}-${now.getMonth() + 1}`
  if (!completedTokens.has(`month:${monthToken}`)) {
    return {
      kind: 'month', token: monthToken, label: 'the month',
      weeksLate: wholeWeeksSince(new Date(now.getFullYear(), now.getMonth(), 1), now),
    }
  }

  if (config.weeklyNudgeEnabled) {
    const wToken = weekToken(now, config.weekStartsOn)
    if (!completedTokens.has(`week:${wToken}`)) {
      return {
        kind: 'week', token: wToken, label: 'the week',
        weeksLate: wholeWeeksSince(weekStartAnchor(now, config.weekStartsOn), now),
      }
    }
  }

  return null
}
