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
// How it is grouped: under the month milestone each row serves (linkedLine —
// source_id, else goal_task_id, the same link the "↳ for October" note reads),
// the milestone named once. Groups keep the order their first row had; open
// milestones with nothing on the shelf follow (each still takes "+ Add"), then
// the rows that serve nothing, together, last.
//
// A row's meta is quiet: "from Fri" for a day that passed, "from last week"
// for work kept, the date for a day outside this week. No warnings.

import type { Task } from '@/types/task'
import { localYmd } from '@/lib/cadence/config'
import { isMissedPlacement } from '@/lib/week/missedPlacement'

export interface ShelfMilestone { id: string; title: string; completed: boolean; month?: string }

export interface ShelfRow {
  task: Task
  meta: string | null
}

export interface ShelfGroup {
  key: string
  /** null: the Unlinked group. */
  milestone: ShelfMilestone | null
  rows: ShelfRow[]
  /** Done rows, shown only on "Show done". */
  done: ShelfRow[]
}

export interface BuildShelfArgs {
  /** The week's list, filtered as the page draws it. */
  weekTasks: readonly Task[]
  /** Every task the reader can see — for a row's milestone lookup. */
  tasks: readonly Task[]
  /** The month(s)' open milestones, in their own order — offered even when
   *  nothing on the shelf serves them yet. */
  milestones: readonly ShelfMilestone[]
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

function lineOf(t: Task, byId: Map<string, Task>): Task | null {
  const id = t.sourceId ?? t.goalTaskId
  if (!id || id === t.id) return null
  return byId.get(id) ?? null
}

export function buildShelf({ weekTasks, tasks, milestones, weekStart, now = new Date() }: BuildShelfArgs): ShelfGroup[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const known = new Map(milestones.map((m) => [m.id, m]))
  const groups = new Map<string, ShelfGroup>()
  const unlinked: ShelfGroup = { key: 'unlinked', milestone: null, rows: [], done: [] }
  for (const t of weekTasks) {
    if (t.isGoal) continue
    // Placed on a day this week: it is on that day. Done work stays with its
    // day too, when it has one.
    if (placedInWeek(t, weekStart, now)) continue
    const line = lineOf(t, byId)
    let g = unlinked
    if (line) {
      g = groups.get(line.id) ?? { key: `m:${line.id}`, milestone: known.get(line.id) ?? { id: line.id, title: line.title, completed: !!line.completed }, rows: [], done: [] }
      groups.set(line.id, g)
    }
    const row = { task: t, meta: t.completed ? null : shelfRowMeta(t, weekStart, now) }
    if (t.completed) g.done.push(row)
    else g.rows.push(row)
  }
  const withRows = [...groups.values()]
  const empty = milestones.filter((m) => !m.completed && !groups.has(m.id))
    .map((m): ShelfGroup => ({ key: `m:${m.id}`, milestone: m, rows: [], done: [] }))
  return [...withRows, ...empty, unlinked]
}
