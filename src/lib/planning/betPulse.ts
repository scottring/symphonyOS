//
// Pure derivations for the season-bets page (spec 2026-07-20). Bets are open
// bucket='quarter' tasks; the first BET_CAP by createdAt are the season's
// bets, the rest are overflow ("these aren't bets yet"). A bet's pulse is
// whether each season month has moves threading to it; a bet with nothing in
// the CURRENT month is starving.

import type { Task } from '@/types/task'
import { SEASON_NAMES, seasonIndex, seasonStart } from '@/lib/cadence/periods'

export const BET_CAP = 8

export function partitionBets(tasks: readonly Task[]): { bets: Task[]; overflow: Task[] } {
  const open = tasks
    .filter((t) => !t.completed && t.bucket === 'quarter')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return { bets: open.slice(0, BET_CAP), overflow: open.slice(BET_CAP) }
}

/** Completed bets from the CURRENT season only — a bet doesn't vanish from
 *  /season the moment it's won, it stays visible (with won styling) through
 *  the season it was won in. Scoped by createdAt's season, not completion
 *  date (bets don't carry a completedAt); a NaN createdAt (malformed row)
 *  is excluded rather than crashing the season-start comparison. */
export function wonBets(tasks: readonly Task[], now: Date = new Date()): Task[] {
  const currentSeason = seasonStart(now).getTime()
  return tasks.filter((t) => {
    if (!t.completed || t.bucket !== 'quarter') return false
    const created = new Date(t.createdAt)
    if (Number.isNaN(created.getTime())) return false
    return seasonStart(created).getTime() === currentSeason
  })
}

/** A task "threads to" a bet when it is its copy-down child (sourceId) or
 *  serves the same goal (goalId) — the same lineage stamps copy-down writes. */
export function threadsToBet(bet: Task, t: Task): boolean {
  if (t.id === bet.id) return false
  if (t.sourceId === bet.id) return true
  return !!bet.goalId && t.goalId === bet.goalId
}

function monthOf(d: Date | string): { y: number; m: number } {
  const dd = new Date(d)
  return { y: dd.getFullYear(), m: dd.getMonth() }
}

function movesInMonth(bet: Task, tasks: readonly Task[], y: number, m: number, isCurrent: boolean): Task[] {
  return tasks.filter((t) => {
    if (!threadsToBet(bet, t)) return false
    if (t.scheduledFor) {
      const s = monthOf(t.scheduledFor)
      return s.y === y && s.m === m
    }
    // The month bucket is "this month's list" — it has no date, so it counts
    // toward the current month only.
    return isCurrent && t.bucket === 'month'
  })
}

export function betPulse(bet: Task, tasks: readonly Task[], now: Date = new Date()) {
  const start = seasonStart(now)
  const months = [0, 1, 2].map((i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const isCurrent = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    const moves = movesInMonth(bet, tasks, d.getFullYear(), d.getMonth(), isCurrent)
    return {
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      hasMoves: moves.length > 0,
      hasDone: moves.some((t) => t.completed),
    }
  })
  const current = months[[0, 1, 2].findIndex((i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })]
  return { months, starving: !bet.completed && !!current && !current.hasMoves }
}

export function servingCount(tasks: readonly Task[], now: Date = new Date()): { serving: number; total: number } {
  const { bets } = partitionBets(tasks)
  const serving = bets.filter((b) => !betPulse(b, tasks, now).starving).length
  return { serving, total: bets.length }
}

export function goalChapters(goalId: string, tasks: readonly Task[]) {
  return tasks
    .filter((t) => t.bucket === 'quarter' && t.goalId === goalId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((bet) => {
      const created = new Date(bet.createdAt)
      return {
        label: `${SEASON_NAMES[seasonIndex(created)]} ${seasonStart(created).getFullYear()}`,
        bet,
        state: (bet.completed ? 'won' : 'open') as 'won' | 'open',
      }
    })
}
