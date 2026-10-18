// The default that drains: untouched inbox/week tasks go to Later on their own.
// `updatedAt` is stamped by the database on every write, so it is the "touched" signal.

import type { Task } from '@/types/task'
import type { DeckCard } from './deck'
import { liveCommitments } from '@/lib/placement/model'
import { bootstrapCommitments } from '@/lib/placement/intentions'

export const DRAIN_AFTER_DAYS = 21

const DAY_MS = 86_400_000

/** Still on a week's list: an open week commitment, read the way every
 *  placement reader reads it — a row whose records are missing or did not
 *  load answers from its cached stamps (bootstrapCommitments). A legacy week
 *  row with no week of its own reads as the current week's (weekList), so it
 *  is on a list too. Such a task has a home; the drain leaves it alone. */
function onAWeek(t: Task): boolean {
  const live = liveCommitments({ commitments: bootstrapCommitments(t) })
  if (live.some((c) => c.level === 'week' && c.status === 'open')) return true
  // Judge "legacy" by the absence of stored records, not of bootstrapped ones:
  // a month/season stamp bootstraps a commitment, yet the Week page still shows
  // the row on the current week.
  return t.bucket === 'week' && !t.commitments?.length && !t.weekStart
}

export function staleForDrain(tasks: Task[], now: Date, afterDays = DRAIN_AFTER_DAYS): Task[] {
  const cutoff = now.getTime() - afterDays * DAY_MS
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return tasks.filter((t) => {
    if (t.completed || t.isGoal) return false
    // A day today or later is a home.
    if (t.scheduledFor && t.scheduledFor.getTime() >= today) return false
    if (t.updatedAt.getTime() >= cutoff) return false
    if (onAWeek(t)) return false
    return t.bucket === 'inbox' || t.bucket === 'week'
  })
}

/** Last week's cards the hand never decided. Inbox and this-week cards are
 *  never returned, nor is a task with a day today or later: it still has a home. */
export function undealtLastWeek(cards: DeckCard[], decided: ReadonlySet<string>, now: Date = new Date()): Task[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return cards
    .filter((c) => c.source === 'last-week' && !decided.has(c.key))
    .filter((c) => !c.task.scheduledFor || c.task.scheduledFor.getTime() < today)
    .map((c) => c.task)
}
