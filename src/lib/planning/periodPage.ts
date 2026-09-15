// src/lib/planning/periodPage.ts
//
// The pure model behind the three planning pages — This Month, This Season,
// This Year. One shape, learned once (Scott, 2026-09-05): the level's own list,
// a rail with the level above, and a look-back at the period just ended.
// Nothing here renders; the pages ask these questions and draw the answers.

import type { Task } from '@/types/task'
import type { Seasons } from '@/lib/cadence/seasons'
import { seasonStartFor, seasonEndFor, seasonLabel, readSeasons } from '@/lib/cadence/seasons'
import { monthStartOf, belongsToMonth, isPlacedOnMonth, belongsToSeason, isPlacedOnSeason } from './periodPlacement'
import { doableBy } from './poolViews'
import type { PlacementFate } from './lineage'

export type PlanLevel = 'month' | 'season' | 'year'

export interface PeriodBounds {
  level: PlanLevel
  /** Inclusive start, midnight. */
  start: Date
  /** Exclusive end, midnight of the next period's first day. */
  end: Date
  label: string
  /** Start of the previous / next period — the navigator's arrows. */
  prev: Date
  next: Date
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The period containing `anchor`, at `level`. Seasons follow the household's
 *  configured boundaries; months and years are calendar. */
export function periodBounds(level: PlanLevel, anchor: Date, seasons: Seasons): PeriodBounds {
  if (level === 'month') {
    const start = monthStartOf(anchor)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    const prev = new Date(start.getFullYear(), start.getMonth() - 1, 1)
    return { level, start, end, label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`, prev, next: end }
  }
  if (level === 'season') {
    const start = seasonStartFor(anchor, seasons)
    const end = seasonEndFor(anchor, seasons)
    const dayBefore = new Date(start); dayBefore.setDate(dayBefore.getDate() - 1)
    const prev = seasonStartFor(dayBefore, seasons)
    return { level, start, end, label: seasonLabel(anchor, seasons), prev, next: end }
  }
  const start = new Date(anchor.getFullYear(), 0, 1)
  const end = new Date(anchor.getFullYear() + 1, 0, 1)
  return { level, start, end, label: `${start.getFullYear()}`, prev: new Date(anchor.getFullYear() - 1, 0, 1), next: end }
}

export function isCurrentPeriod(bounds: PeriodBounds, today: Date): boolean {
  return today >= bounds.start && today < bounds.end
}

export interface PlanningPeriodInput {
  level: PlanLevel
  today: Date
  seasons: Seasons
  explicitStart?: Date | null
  countFor: (start: Date) => number
}

/** The period a planning page should show first: an explicit start (from the
 *  URL) always wins; otherwise the current period — unless it is nearly over
 *  (≤14 days left for a season, ≤6 for a month) or already empty while the
 *  next period has a list, in which case the page opens on the coming period
 *  instead (demo run 2026-09-06: pages opened on the clock's period while the
 *  user's items sat on the next one). A year page never looks ahead. */
export function planningPeriod({ level, today, seasons, explicitStart, countFor }: PlanningPeriodInput): { start: Date; lookingAhead: boolean } {
  if (explicitStart) return { start: periodBounds(level, explicitStart, seasons).start, lookingAhead: false }
  const cur = periodBounds(level, today, seasons)
  if (level === 'year') return { start: cur.start, lookingAhead: false }
  const daysLeft = Math.round((cur.end.getTime() - today.getTime()) / 86_400_000)
  const threshold = level === 'season' ? 14 : 6
  const nextStart = cur.next
  if (daysLeft <= threshold) return { start: nextStart, lookingAhead: true }
  if (countFor(cur.start) === 0 && countFor(nextStart) > 0) return { start: nextStart, lookingAhead: true }
  return { start: cur.start, lookingAhead: false }
}

/**
 * The tasks on a month or season list. The CURRENT period is a pool question
 * (`belongsTo*` — a legacy NULL row is this period's); any other period is a
 * membership question (`isPlacedOn*` — or a NULL row would repeat in every
 * period you page to). Scoped to `meId` the way the week strip and the Month
 * rail are: unassigned and mine stay, someone else's goes. Completed and
 * placed rows are INCLUDED — the list is the record, and the look-back needs
 * them. Year lists are goals, not tasks; see the page.
 */
export function selectPeriodTasks(
  tasks: readonly Task[],
  level: 'month' | 'season',
  start: Date,
  isCurrent: boolean,
  meId: string | null,
  seasons: Seasons = readSeasons(),
): Task[] {
  const bucket = level === 'month' ? 'month' : 'quarter'
  return tasks
    .filter((t) => {
      if (t.bucket !== bucket) return false
      if (meId && !doableBy(t, meId)) return false
      if (level === 'month') return isCurrent ? belongsToMonth(t, start) : isPlacedOnMonth(t, start)
      return isCurrent ? belongsToSeason(t, start, seasons) : isPlacedOnSeason(t, start, seasons)
    })
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}

/**
 * Timed items landing inside the period — the ones that showed up on Today
 * but never appeared on the month/season page they were also inside (demo
 * run 2026-09-06: six dated September items were invisible on /month, which
 * only ever asked the pool question). Not completed, sorted chronologically
 * with an all-day item ranked before a timed one on the same day.
 */
export function selectDatedInPeriod(tasks: readonly Task[], bounds: PeriodBounds): Task[] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return tasks
    .filter((t): t is Task & { scheduledFor: Date } => !t.completed && !!t.scheduledFor && t.scheduledFor >= bounds.start && t.scheduledFor < bounds.end)
    .sort((a, b) => {
      const dayDiff = startOfDay(a.scheduledFor) - startOfDay(b.scheduledFor)
      if (dayDiff !== 0) return dayDiff
      if (!!a.isAllDay !== !!b.isAllDay) return a.isAllDay ? -1 : 1
      return a.scheduledFor.getTime() - b.scheduledFor.getTime()
    })
}

export type RowAction =
  | 'complete' | 'keep' | 'someday' | 'drop' | 'make-goal' | 'make-task'
  /** Take this row down a rung — month → this week, season → this month. The
   *  motion the whole cadence rests on (Scott: "we reference the monthly list
   *  to decide what to do for the week"), which the page had no way to do:
   *  the rail could pull DOWN into the page, but a row on the page itself
   *  could not go anywhere. */
  | 'to-lower'
  /** Straight onto today. An urgent thing shouldn't have to walk every rung. */
  | 'today'
  /** File a loose row under one of the period's goals. You write "call the
   *  roofer" and only then realise it is porch work. */
  | 'under-goal'

/**
 * The verbs a row offers.
 *
 * In the current period a TASK can be ticked, taken down a rung, taken
 * straight to today, converted, or dropped. Once the period is over it gets
 * its look-back fate instead: keep (copy forward), drop, Someday (tasks only
 * — a goal is an outcome, not a thing you postpone), or change kind.
 *
 * A GOAL is never placed. It is ticked, kept or dropped, and every placement
 * writer refuses it anyway (periodPlacement's is_goal refusal) — so offering
 * it a rung would be offering a no-op.
 *
 * Done rows are the win column and offer nothing. A row already placed lower
 * can still be kept or dropped in a look-back — its copy carries on
 * regardless — but it is not re-placed from here, which is what kept ten
 * copies of the same task from landing in twenty seconds.
 */
export function actionsFor(
  { fate, isGoal, isPast, level = 'month', hasGoals = false }:
  { fate: PlacementFate; isGoal: boolean; isPast: boolean; level?: PlanLevel; hasGoals?: boolean },
): RowAction[] {
  if (fate === 'done' || fate === 'placed-done') return []
  if (fate === 'placed-open') return isPast ? ['keep', 'drop'] : []
  const kind: RowAction = isGoal ? 'make-task' : 'make-goal'
  // A year row is a goal entity and has no rung below it on this page.
  const canDescend = !isGoal && level !== 'year'
  // Only a loose row, and only where there is a goal to file it under. A goal
  // never goes under a goal: one level, on purpose.
  const underGoal: RowAction[] = !isGoal && hasGoals ? ['under-goal'] : []
  if (!isPast) {
    return canDescend
      ? ['complete', 'to-lower', 'today', ...underGoal, kind, 'drop']
      : ['complete', ...underGoal, kind, 'drop']
  }
  return isGoal ? ['complete', 'keep', kind, 'drop'] : ['complete', 'keep', 'someday', kind, 'drop']
}

/** The rung a row drops into from this page. */
export function lowerLevel(level: PlanLevel): 'week' | 'month' | null {
  if (level === 'month') return 'week'
  if (level === 'season') return 'month'
  return null
}

/** The level a page looks at while it plans — the rung above. */
export function railLevel(level: PlanLevel): 'season' | 'year' | null {
  if (level === 'month') return 'season'
  if (level === 'season') return 'year'
  return null
}
