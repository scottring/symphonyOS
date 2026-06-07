// src/lib/today/comingUp.ts
//
// The "coming up" peek selector (W4) — the quiet sliver Scott chose ("b").
// Operates on an ALREADY-FILTERED task list (the caller applies domain/assignee
// scoping), so it stays a pure summary with no matcher plumbing. It answers:
// what's dated in the next few days, how many sit in the week pool, and how many
// are still unsorted in the inbox.

import type { Task } from '@/types/task'

export interface ComingUpDay {
  date: Date
  count: number
}

export interface ComingUpSummary {
  /** Dated days AFTER today within the horizon, each with a task count. */
  nextDays: ComingUpDay[]
  /** Incomplete tasks parked in the `week` pool. */
  weekCount: number
  /** Incomplete tasks still in the inbox (to sort). */
  inboxCount: number
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/**
 * Summarise what's coming up from a pre-filtered task list. `horizonDays` bounds
 * the dated peek (default 7 = the rest of the week-ish). Overdue and today's
 * items are intentionally excluded — Today already shows those.
 */
export function selectComingUp(tasks: Task[], now: Date, horizonDays = 7): ComingUpSummary {
  const startOfTomorrow = new Date(now)
  startOfTomorrow.setHours(0, 0, 0, 0)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)

  const horizonEnd = new Date(startOfTomorrow)
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays)

  const byDay = new Map<string, ComingUpDay>()
  let weekCount = 0
  let inboxCount = 0

  for (const task of tasks) {
    if (task.completed) continue
    if (task.bucket === 'week') weekCount++
    else if (task.bucket === 'inbox') inboxCount++

    if (task.bucket === 'timed' && task.scheduledFor) {
      const d = new Date(task.scheduledFor)
      if (d >= startOfTomorrow && d < horizonEnd) {
        const midnight = new Date(d)
        midnight.setHours(0, 0, 0, 0)
        const key = dayKey(midnight)
        const existing = byDay.get(key)
        if (existing) existing.count++
        else byDay.set(key, { date: midnight, count: 1 })
      }
    }
  }

  const nextDays = [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
  return { nextDays, weekCount, inboxCount }
}
