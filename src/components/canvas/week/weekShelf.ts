// src/components/canvas/week/weekShelf.ts
//
// The Week canvas's "Still to place" shelf, as data (approved week
// composition, 2026-10-10). Pure: no fetching, no writes.
//
// What is on it: the week's own work (weekListTasks, already through the
// page's filters) that has no day in this week yet — undated, dated outside
// the week, or whose day passed undone. A row with a day this week is on that
// day, never here too.
//
// How it is ordered: flat, in the week's own order (paper-style horizons,
// 2026-11-04). Nothing is grouped by what a row was written for, and nothing
// is left out for being marked a goal: Today's week column reads the same
// list (finding #15 — a month line committed to this week, marked is_goal,
// was on Today and missing here).
//
// A row's meta is quiet: "from Fri" for a day that passed, "from last week"
// for work kept, the date for a day outside this week. No warnings.

import type { Task } from '@/types/task'
import { localYmd } from '@/lib/cadence/config'
import { isMissedPlacement } from '@/lib/week/missedPlacement'

export interface ShelfRow {
  task: Task
  meta: string | null
}

/** The week's list: one group, flat (kept as a list of groups for the
 *  canvas's preview and drag code). */
export interface ShelfGroup {
  key: string
  rows: ShelfRow[]
  /** Done rows, shown only on "Show done". */
  done: ShelfRow[]
}

export interface BuildShelfArgs {
  /** The week's list, filtered as the page draws it. */
  weekTasks: readonly Task[]
  weekStart: Date
  now?: Date
}

const DAY = 86_400_000

export function shelfRowMeta(t: Task, weekStart: Date, now: Date): string | null {
  if (t.scheduledFor) {
    if (isMissedPlacement(t.scheduledFor, t.completed, now)) {
      return `from ${t.scheduledFor.toLocaleDateString('en-US', { weekday: 'short' })}`
    }
    return t.scheduledFor.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }
  const prev = new Date(weekStart.getTime() - 7 * DAY)
  const kept = (t.commitments ?? []).some((c) => c.level === 'week' && c.status === 'carried' && localYmd(c.periodStart) === localYmd(prev))
  return kept ? 'from last week' : null
}

/** Has this task a day inside the week (and not one that passed undone)? */
export function placedInWeek(t: Task, weekStart: Date, now: Date): boolean {
  if (!t.scheduledFor) return false
  const k = localYmd(t.scheduledFor)
  const inWeek = k >= localYmd(weekStart) && k <= localYmd(new Date(weekStart.getTime() + 6 * DAY))
  return inWeek && !isMissedPlacement(t.scheduledFor, t.completed, now)
}

export function buildShelf({ weekTasks, weekStart, now = new Date() }: BuildShelfArgs): ShelfGroup[] {
  const week: ShelfGroup = { key: 'week', rows: [], done: [] }
  for (const t of weekTasks) {
    // Placed on a day this week: it is on that day. Done work stays with its
    // day too, when it has one.
    if (placedInWeek(t, weekStart, now)) continue
    if (t.completed) week.done.push({ task: t, meta: null })
    else week.rows.push({ task: t, meta: shelfRowMeta(t, weekStart, now) })
  }
  return [week]
}
