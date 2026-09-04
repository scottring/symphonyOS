// src/lib/today/spanPlacement.ts
//
// One question, asked from every surface that shows a span: does this task
// belong to the span I'm looking at, and does this day fall inside it?
//
// The direct mirror of weekPlacement.ts. That file exists because
// `bucket='week'` once meant "the current week" and every reader assumed there
// was only one week in play; the moment a task could be placed on a *specific*
// week, each reader had to say which. A span has the same shape and the same
// hazard, so it gets the same shared predicates rather than six local ones.

import type { Span } from '@/types/span'
import type { Task, TaskBucket } from '@/types/task'

/** Local midnight of a date, so day comparisons ignore the clock. */
function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/**
 * The span a bucket change implies. Entering the span bucket means the span
 * you are looking at; every other bucket has no span at all.
 *
 * The clearing half is the load-bearing one, and it is the same bug
 * weekStartForBucket exists to prevent: a task moved from a span out to the
 * month keeps a secret span_id, and reappears in that span's pool forever.
 */
export function spanIdForBucket(bucket: TaskBucket, spanId: string | null): string | null {
  return bucket === 'span' ? spanId : null
}

/** Both ends INCLUSIVE — a span is "Sat to Mon" the way a person means it. */
export function spanContainsDay(span: Span, day: Date): boolean {
  const d = startOfDay(day).getTime()
  return d >= startOfDay(span.startDate).getTime() && d <= startOfDay(span.endDate).getTime()
}

/** How many local days a span covers. "Sat to Mon" is 3, not 2. */
export function spanDayCount(span: Span): number {
  const from = startOfDay(span.startDate).getTime()
  const to = startOfDay(span.endDate).getTime()
  return Math.round((to - from) / 86_400_000) + 1
}

/** Is this task placed on this span? Completed rows never are. */
export function belongsToSpan(task: Task, span: Span): boolean {
  if (task.completed) return false
  if (task.bucket !== 'span') return false
  return task.spanId === span.id
}

/**
 * The span's pool: everything placed on it and not yet done.
 *
 * Deliberately NOT filtered by assignee, matching the week and month pools —
 * a pool is a full census of what is planned, not a view of the current
 * filter (Scott, 2026-08-19).
 */
export function selectSpanPool(tasks: Task[], span: Span): Task[] {
  return tasks.filter((t) => belongsToSpan(t, span))
}

/**
 * Spans covering a given day, soonest-starting first.
 *
 * A day can sit in more than one — a long weekend inside a school break — so
 * this returns all of them and lets the caller decide. It never returns spans
 * the day falls outside, which is what keeps a finished span from lingering.
 */
export function spansForDay(spans: Span[], day: Date): Span[] {
  return spans
    .filter((s) => spanContainsDay(s, day))
    .sort((a, b) => startOfDay(a.startDate).getTime() - startOfDay(b.startDate).getTime())
}

/**
 * Spans worth offering as a place to put something, given "today".
 *
 * A span that has already ended is not a destination — placing work into last
 * weekend is the span equivalent of the stale week placement that stranded
 * moves on a week nobody would open again. Ongoing spans stay offered: you can
 * still add to a weekend you are in the middle of.
 */
export function selectPlaceableSpans(spans: Span[], today: Date): Span[] {
  const t = startOfDay(today).getTime()
  return spans
    .filter((s) => startOfDay(s.endDate).getTime() >= t)
    .sort((a, b) => startOfDay(a.startDate).getTime() - startOfDay(b.startDate).getTime())
}

/**
 * Does this span overlap the week starting at `weekStart` (7 days)?
 *
 * The week grid uses this to say "these days are spoken for" without claiming
 * the work: the span owns the placement, the week still draws the days. Two
 * containers claiming one day is what makes pools disagree, so only one of
 * them ever holds the task.
 */
export function spanOverlapsWeek(span: Span, weekStart: Date): boolean {
  const from = startOfDay(weekStart).getTime()
  const to = from + 6 * 86_400_000
  return startOfDay(span.startDate).getTime() <= to && startOfDay(span.endDate).getTime() >= from
}
