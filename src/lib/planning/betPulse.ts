// src/lib/planning/betPulse.ts
//
// Pure derivations for the season page (spec 2026-07-20, revised 2026-07-21:
// UI word is "picks" and picking is EXPLICIT). A pick is an open
// bucket='quarter' task the user chose (pickedAt set); everything else in the
// quarter bucket sits on the shelf (pickedAt null). PICK_CAP is a soft cap —
// promoting at the cap goes through a swap. A pick's pulse is whether each
// season month has moves threading to it; a pick with nothing in the CURRENT
// month is starving.

import type { Task } from '@/types/task'
import { seasonNames, seasonIndex, seasonStart } from '@/lib/cadence/periods'

export const PICK_CAP = 10

/** Open-quarter partition: picks (chosen, by when they were picked) and the
 *  shelf (unchosen, oldest first — the order they piled up). */
export function partitionSeason(tasks: readonly Task[]): { picks: Task[]; shelf: Task[] } {
  const open = tasks.filter((t) => !t.completed && t.bucket === 'quarter')
  const picks = open
    .filter((t) => !!t.pickedAt)
    .sort((a, b) => new Date(a.pickedAt as Date).getTime() - new Date(b.pickedAt as Date).getTime())
  const shelf = open
    .filter((t) => !t.pickedAt)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return { picks, shelf }
}

/** Month-level partition, one altitude down: this month's open moves filed
 *  under the pick each one serves, plus the shelf (month items serving no
 *  pick). A move lands under exactly ONE pick even when picks share a goal —
 *  sourceId (precise attribution) wins, then the first pick with that goalId —
 *  so nothing renders twice. Pick order is the caller's (pickedAt). */
export function partitionMonth(
  picks: readonly Task[],
  tasks: readonly Task[],
): { byPick: Map<string, Task[]>; shelf: Task[] } {
  const byPick = new Map<string, Task[]>(picks.map((p) => [p.id, []]))
  const shelf: Task[] = []
  for (const t of tasks) {
    if (t.completed || t.bucket !== 'month') continue
    const owner =
      picks.find((p) => t.sourceId === p.id) ??
      picks.find((p) => !!p.goalId && t.goalId === p.goalId)
    if (owner) byPick.get(owner.id)!.push(t)
    else shelf.push(t)
  }
  return { byPick, shelf }
}

/** Completed picks from the CURRENT season only — a pick doesn't vanish from
 *  /season the moment it's won; it stays visible (won styling) through the
 *  season it was picked in. Scoped by pickedAt's season; a NaN date
 *  (malformed row) is excluded rather than crashing seasonStart. */
export function wonPicks(tasks: readonly Task[], now: Date = new Date()): Task[] {
  const currentSeason = seasonStart(now).getTime()
  return tasks.filter((t) => {
    if (!t.completed || t.bucket !== 'quarter' || !t.pickedAt) return false
    const picked = new Date(t.pickedAt)
    if (Number.isNaN(picked.getTime())) return false
    return seasonStart(picked).getTime() === currentSeason
  })
}

/** A task "threads to" a pick when it is its copy-down child (sourceId) or
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
  const { picks } = partitionSeason(tasks)
  const serving = picks.filter((b) => !betPulse(b, tasks, now).starving).length
  return { serving, total: picks.length }
}

/** The goal's story across seasons — one row per PICK that served it, labeled
 *  by the season it was picked in. Shelf items don't make the story: chapters
 *  are what you chose, not what you piled up. */
export function goalChapters(goalId: string, tasks: readonly Task[]) {
  return tasks
    // The NaN skip guards seasonStart, which never terminates on Invalid Date.
    .filter((t) => t.bucket === 'quarter' && t.goalId === goalId && !!t.pickedAt && !Number.isNaN(new Date(t.pickedAt).getTime()))
    .sort((a, b) => new Date(a.pickedAt as Date).getTime() - new Date(b.pickedAt as Date).getTime())
    .map((bet) => {
      const picked = new Date(bet.pickedAt as Date)
      return {
        label: `${seasonNames()[seasonIndex(picked)]} ${seasonStart(picked).getFullYear()}`,
        bet,
        state: (bet.completed ? 'won' : 'open') as 'won' | 'open',
      }
    })
}
