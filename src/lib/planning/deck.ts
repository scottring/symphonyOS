// Who's in the deck: every task without a home this week, closest first
// (this week, then last week's leftovers, then the Inbox). Facts only — no
// recommendation. The first matching group wins, so a task is never dealt twice.

import type { Task } from '@/types/task'
import { weekReviewState } from './periodReview'

export type DeckSource = 'this-week' | 'last-week' | 'inbox'

export interface DeckCard {
  key: string
  task: Task
  source: DeckSource
  facts: string
  serves?: string
}

export const HAND_SIZE = 5

/** How many weeks a task has been carried on (week commitments marked carried). */
export function carriedWeeks(task: Task): number {
  return (task.commitments ?? []).filter((c) => c.level === 'week' && c.status === 'carried').length
}

const weekday = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long' })

function factsFor(task: Task, source: DeckSource): string {
  if (source === 'this-week') return 'On this week · no day yet'
  if (source === 'last-week') {
    const n = carriedWeeks(task)
    return n >= 1 ? `Not done · carried ${n} ${n === 1 ? 'week' : 'weeks'}` : 'Not done'
  }
  return `Captured ${weekday(task.createdAt)}`
}

export function buildDeck(input: {
  tasks: Task[]
  weekStart: Date
  lastWeekStart: Date
  isCurrent: boolean
  servesOf?: (t: Task) => string | undefined
  only?: DeckSource
}): DeckCard[] {
  const { tasks, weekStart, lastWeekStart, isCurrent, servesOf, only } = input
  const groups: Record<DeckSource, Task[]> = { 'this-week': [], 'last-week': [], inbox: [] }
  for (const t of tasks) {
    if (t.completed || t.isGoal) continue
    if (!t.scheduledFor && weekReviewState(t, weekStart, { isCurrent }) === 'open') groups['this-week'].push(t)
    else if (weekReviewState(t, lastWeekStart, { isCurrent: false }) === 'open') groups['last-week'].push(t)
    else if (t.bucket === 'inbox') groups.inbox.push(t)
  }
  groups.inbox.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const order: DeckSource[] = ['this-week', 'last-week', 'inbox']
  return order
    .filter((s) => !only || s === only)
    .flatMap((source) => groups[source].map((task): DeckCard => {
      const serves = servesOf?.(task)
      return { key: task.id, task, source, facts: factsFor(task, source), ...(serves ? { serves } : {}) }
    }))
}
