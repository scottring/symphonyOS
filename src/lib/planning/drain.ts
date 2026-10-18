// The default that drains: untouched inbox/week tasks go to Later on their own.
// `updatedAt` is stamped by the database on every write, so it is the "touched" signal.

import type { Task } from '@/types/task'
import type { DeckCard } from './deck'

export const DRAIN_AFTER_DAYS = 21

const DAY_MS = 86_400_000

export function staleForDrain(tasks: Task[], now: Date, afterDays = DRAIN_AFTER_DAYS): Task[] {
  const cutoff = now.getTime() - afterDays * DAY_MS
  return tasks.filter((t) => {
    if (t.completed || t.isGoal) return false
    if (t.scheduledFor && t.scheduledFor.getTime() > now.getTime()) return false
    if (t.updatedAt.getTime() >= cutoff) return false
    if (t.bucket === 'inbox') return true
    if (t.bucket === 'week') return !(t.commitments ?? []).some((c) => c.level === 'week' && c.status === 'open')
    return false
  })
}

/** Last week's cards the hand never decided. Inbox and this-week cards are never returned. */
export function undealtLastWeek(cards: DeckCard[], decided: ReadonlySet<string>): Task[] {
  return cards.filter((c) => c.source === 'last-week' && !decided.has(c.key)).map((c) => c.task)
}
