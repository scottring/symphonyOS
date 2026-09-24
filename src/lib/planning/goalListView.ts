// src/lib/planning/goalListView.ts
//
// What a month's goals-and-steps list actually DRAWS, once there are more of
// them than fit on a screen.
//
// Scott approved the inline Month/review design and then asked for the part
// the mockup's two sample goals could not show: realistic long lists. This is
// that part, as one pure function, so the rules can be held by tests against
// 30 goals, 200 tasks and a goal with 60 steps rather than argued about in a
// component.
//
// The rules, and why each one is the way it is:
//
//   PARENT CONTEXT SURVIVES THE FILTER. A step that matches is never shown
//   orphaned: its goal comes with it. And a goal that matches keeps ALL its
//   steps, because the reader asked for that goal, not for a subset of it.
//
//   HIDING IS ALWAYS COUNTED. Every step or goal the filter, the completed
//   fold or the reveal bound removes is reported, so the list can say so.
//   Nothing is ever quietly dropped — that is the difference between a bound
//   and a cap.
//
//   COMPLETED WORK IS ALWAYS REACHABLE IN REVIEW. Outside review it folds
//   away if the reader says so; inside review it is part of what they are
//   reviewing, so it stays.
//
//   THE FILTER IS PRESENTATION ONLY. Nothing here is used to decide what a
//   save writes. A filtered review that saved only what was on screen would
//   lose work silently, which is the one failure this file must not enable.

import type { PlanRowModel } from '@/components/plan/PlanRow'
import { rowIsDone } from '@/components/plan/PlanRow'

/** How many steps a goal draws before it offers "Show all". */
export const STEP_REVEAL_LIMIT = 8

export interface StepCounts {
  open: number
  completed: number
  total: number
}

export function stepCounts(goal: Pick<PlanRowModel, 'steps'>): StepCounts {
  const steps = goal.steps ?? []
  let completed = 0
  for (const s of steps) if (rowIsDone(s.fate)) completed++
  return { open: steps.length - completed, completed, total: steps.length }
}

export interface GoalListOptions {
  /** What the reader typed. Empty means no filter at all. */
  query?: string
  /** Show completed steps outside review. Ignored in review, where they stay. */
  showCompleted?: boolean
  /** Goals whose steps are open. */
  expanded?: ReadonlySet<string>
  /** Goals the reader pressed "Show all steps" on. */
  revealed?: ReadonlySet<string>
  /** In review, completed work is always part of what is being reviewed. */
  inReview?: boolean
  /** Overridable for tests; the list never uses a different number in one run. */
  revealLimit?: number
}

export interface GoalView {
  row: PlanRowModel
  counts: StepCounts
  /** The steps to draw, in order, after every rule above. */
  steps: PlanRowModel[]
  /** True when the goal's own title matched, so its steps are all kept. */
  goalMatched: boolean
  expanded: boolean
  /** Steps this goal has that the QUERY removed. */
  hiddenByFilter: number
  /** Steps hidden only because completed work is folded away. */
  hiddenCompleted: number
  /** Steps past the reveal bound — offered behind "Show all", never dropped. */
  hiddenByReveal: number
  /** Steps that match and would be drawn if nothing were bounded. */
  matching: number
}

export interface GoalListView {
  goals: GoalView[]
  /** Loose rows (no goal) that survive the filter. */
  loose: PlanRowModel[]
  /** Goals the query removed entirely. */
  hiddenGoals: number
  /** Loose rows the query removed. */
  hiddenLoose: number
  /** Everything the QUERY is hiding, so one line can say so honestly. */
  hiddenByFilter: number
  /** True when a query is in force at all. */
  filtering: boolean
}

const norm = (s: string) => s.toLowerCase().trim()
const matches = (row: Pick<PlanRowModel, 'title'>, q: string) => norm(row.title).includes(q)

/**
 * Build the view. Never mutates its input and never drops a row without
 * counting it.
 */
export function goalListView(
  goals: readonly PlanRowModel[],
  loose: readonly PlanRowModel[],
  opts: GoalListOptions = {},
): GoalListView {
  const q = norm(opts.query ?? '')
  const filtering = q.length > 0
  const expanded = opts.expanded ?? new Set<string>()
  const revealed = opts.revealed ?? new Set<string>()
  const limit = opts.revealLimit ?? STEP_REVEAL_LIMIT
  const keepCompleted = !!opts.inReview || !!opts.showCompleted

  const views: GoalView[] = []
  let hiddenGoals = 0
  let hiddenByFilter = 0

  for (const row of goals) {
    const counts = stepCounts(row)
    const all = row.steps ?? []
    const goalMatched = !filtering || matches(row, q)

    // A matching goal keeps every step; otherwise only the matching ones —
    // and either way the goal itself stays, so a step is never orphaned.
    const byQuery = goalMatched ? all : all.filter((s) => matches(s, q))
    if (filtering && !goalMatched && byQuery.length === 0) {
      hiddenGoals++
      hiddenByFilter += 1 + all.length
      continue
    }
    const hiddenByFilterHere = all.length - byQuery.length
    hiddenByFilter += hiddenByFilterHere

    // Completed work folds away outside review, and only outside review.
    const byCompleted = keepCompleted ? byQuery : byQuery.filter((s) => !rowIsDone(s.fate))
    const hiddenCompleted = byQuery.length - byCompleted.length

    // The bound. A goal the reader opened out stays open.
    const bounded = revealed.has(row.id) ? byCompleted : byCompleted.slice(0, limit)

    views.push({
      row,
      counts,
      steps: bounded,
      goalMatched,
      expanded: expanded.has(row.id),
      hiddenByFilter: hiddenByFilterHere,
      hiddenCompleted,
      hiddenByReveal: byCompleted.length - bounded.length,
      matching: byCompleted.length,
    })
  }

  const looseKept = filtering ? loose.filter((r) => matches(r, q)) : [...loose]
  const hiddenLoose = loose.length - looseKept.length
  hiddenByFilter += hiddenLoose

  return { goals: views, loose: looseKept, hiddenGoals, hiddenLoose, hiddenByFilter, filtering }
}

/** "3 open · 2 done" — what a collapsed goal says about itself. */
export function countsLabel(c: StepCounts): string {
  if (c.total === 0) return 'No steps yet'
  const parts: string[] = []
  if (c.open > 0) parts.push(`${c.open} open`)
  if (c.completed > 0) parts.push(`${c.completed} done`)
  return parts.join(' · ')
}

/** One honest sentence about what a query is keeping off the screen. */
export function hiddenLabel(view: GoalListView): string | null {
  if (!view.filtering || view.hiddenByFilter === 0) return null
  const n = view.hiddenByFilter
  return `${n} ${n === 1 ? 'item is' : 'items are'} hidden by this filter`
}
