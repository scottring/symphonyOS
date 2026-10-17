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
import type { ActionableInstance } from '@/types/actionable'
import type { JournalDay } from '@/lib/week/journalDays'
import { committedTo } from '@/lib/placement/model'
import { weekRhythm } from '@/lib/week/weekRhythm'

/** open: still to decide · done · moved: carried on to a later period ·
 *  skipped: a routine's occurrence let pass. */
export type ReviewState = 'open' | 'done' | 'moved' | 'skipped'

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

/** A line moved on from this period: where to, when the record says. Null
 *  while it is still this period's (open or done here). */
export function movedOn(
  task: Task, level: PlacementLevel, start: Date, opts: { isCurrent: boolean; seasons?: Seasons },
): { to?: Date } | null {
  const c = committedTo(task, level, start, opts)
  if (!c || c === 'legacy' || c.status !== 'carried' || task.completed) return null
  return { to: c.carriedTo }
}

/** A week's line: a task committed to the week, or given a day in it (most
 *  week tasks have a day and no week commitment). */
export function weekReviewState(task: Task, weekStart: Date, opts: { isCurrent: boolean }): ReviewState | undefined {
  const committed = taskReviewState(task, 'week', weekStart, opts)
  if (committed) return committed
  const at = task.scheduledFor
  const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
  if (!at || at < weekStart || at >= end) return undefined
  return task.completed ? 'done' : 'open'
}

export interface RoutineOccurrence { routineId: string; title: string; date: Date; dayKey: string; state: ReviewState }

/**
 * The week's routine occurrences to review (Scott, 2026-10-17): weekly,
 * every-other-week, monthly and the like — every routine the week draws on
 * its days. One that runs every day, or every weekday, is the week's rhythm,
 * not something to decide: it is left out unless the page shows the daily
 * ones ("Show daily"). Only days up to today: a day still ahead has nothing
 * to look back on.
 */
export function weekRoutineOccurrences(
  days: readonly JournalDay[], instances: readonly ActionableInstance[], opts: { includeDaily: boolean; todayKey: string },
): RoutineOccurrence[] {
  const rhythm = weekRhythm([...days], opts.todayKey)
  const daily = new Set(opts.includeDaily ? [] : [...rhythm.everyDay, ...rhythm.weekdays].map((r) => r.routineId))
  const skipped = new Set(instances.filter((i) => i.entity_type === 'routine' && i.status === 'skipped').map((i) => `${i.entity_id}:${i.date}`))
  const out: RoutineOccurrence[] = []
  for (const d of days) {
    if (d.key > opts.todayKey) continue
    const seen = new Set<string>()
    for (const e of [...d.entries, ...d.foldedRoutines]) {
      if (e.kind !== 'routine' || !e.routineId || daily.has(e.routineId) || seen.has(e.routineId)) continue
      seen.add(e.routineId)
      const state: ReviewState = e.completed ? 'done' : skipped.has(`${e.routineId}:${d.key}`) ? 'skipped' : 'open'
      out.push({ routineId: e.routineId, title: e.title, date: d.date, dayKey: d.key, state })
    }
  }
  return out
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
export function reviewSentence(c: { open: number; done: number; moved: number; letGo: number; skipped?: number }): string {
  const first = c.open === 0 ? 'Nothing left open.' : `${count(c.open)} still open.`
  const rest = [
    c.done ? `${count(c.done).toLowerCase()} done` : '',
    c.moved ? `${count(c.moved).toLowerCase()} moved on` : '',
    c.skipped ? `${count(c.skipped).toLowerCase()} skipped` : '',
    c.letGo ? `${count(c.letGo).toLowerCase()} let go` : '',
  ].filter(Boolean)
  if (!rest.length) return first
  const joined = rest.length === 1 ? rest[0] : `${rest.slice(0, -1).join(', ')} and ${rest[rest.length - 1]}`
  return `${first} ${joined[0].toUpperCase()}${joined.slice(1)}.`
}
