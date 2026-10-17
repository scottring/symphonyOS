// The review by hand (Scott, 2026-10-17): a period's list gone through one
// open line at a time — Done, Move on, Someday, Let go — with two short notes
// and one Finish, no conversation. The same verbs as the rows' quick triage
// (2026-10-16) and the same writes; this file only reads where each line
// stands, from the data, so an Undo anywhere puts the line back in "Still open".
//
// A review is not a plan: it is stored as `notes.periodReview` on the REVIEWED
// period's planning_sessions row (usePeriodReview), never `savedAt`, so it
// never marks a period planned.

import type { Task, PlacementLevel } from '@/types/task'
import type { Goal } from '@/types/goal'
import type { Seasons } from '@/lib/cadence/seasons'
import { committedTo } from '@/lib/placement/model'

/** open: still to decide · done · moved: carried on to a later period. */
export type ReviewState = 'open' | 'done' | 'moved'

/** Where a task on a week, month or season list stands. Undefined: it is not
 *  on the list any more (removed from the period, or sent to Someday). */
export function taskReviewState(
  task: Task, level: PlacementLevel, start: Date, opts: { isCurrent: boolean; seasons?: Seasons },
): ReviewState | undefined {
  const c = committedTo(task, level, start, opts)
  if (!c) return undefined
  if (task.completed || (c !== 'legacy' && c.status === 'done')) return 'done'
  if (c !== 'legacy' && c.status === 'carried') return 'moved'
  return 'open'
}

/** A year goal: met, carried into next year (a copy that remembers it), or
 *  open. Archived is the year's let-go: off the list. */
export function yearGoalReviewState(goal: Goal, nextYearGoals: readonly Goal[]): ReviewState | undefined {
  if (goal.status === 'archived') return undefined
  if (goal.status === 'completed') return 'done'
  if (nextYearGoals.some((g) => g.carriedFrom === goal.id && g.status !== 'archived')) return 'moved'
  return 'open'
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const count = (n: number) => (n < WORDS.length ? WORDS[n] : String(n))

/** The review's one line: "Three still open. Five done, one moved on." */
export function reviewSentence(c: { open: number; done: number; moved: number; letGo: number }): string {
  const first = c.open === 0 ? 'Nothing left open.' : `${count(c.open)} still open.`
  const rest = [
    c.done ? `${count(c.done).toLowerCase()} done` : '',
    c.moved ? `${count(c.moved).toLowerCase()} moved on` : '',
    c.letGo ? `${count(c.letGo).toLowerCase()} let go` : '',
  ].filter(Boolean)
  if (!rest.length) return first
  const joined = rest.length === 1 ? rest[0] : `${rest.slice(0, -1).join(', ')} and ${rest[rest.length - 1]}`
  return `${first} ${joined[0].toUpperCase()}${joined.slice(1)}.`
}
