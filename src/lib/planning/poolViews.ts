//
// The planning pool, decided once. Both planning surfaces (the Plan Your Time
// overlay's drawer and /week's pool lane) select, filter, order and group
// their Unscheduled pool through these pure functions — one derivation, so
// the two surfaces cannot drift (the same rule that put onShelfCount on
// PlanningSession).
import type { Task } from '@/types/task'
import { belongsToWeek, isStaleWeekPlacement } from '@/lib/today/weekPlacement'
import { weekStartAnchor, type WeekStart } from '@/lib/cadence/config'

export type PoolView = 'week' | 'month' | 'all' | 'routines'

export interface PoolCtx {
  today: Date
  /** Bounds of the days visible on the grid (null = single-day/no range). */
  rangeStart: Date | null
  rangeEnd: Date | null
  weekStartsOn: WeekStart
  /** The planning member's id. When set, the pool only offers tasks this
   *  person could actually DO: assigned to them, shared with them, or
   *  unassigned. A shared-context task assigned exclusively to someone else
   *  is rightly VISIBLE elsewhere but is not a candidate for MY time blocks
   *  ("Pick out an outfit for Boston", family context, assigned to Iris, sat
   *  in Scott's pool). Omitted = no assignee scoping (legacy callers). */
  meId?: string | null
}

/** Is this task doable by `meId`? Unassigned counts; an assignee set that
 *  excludes me does not. */
function doableBy(t: Task, meId: string): boolean {
  const assignees = t.assignedToAll?.length ? t.assignedToAll : t.assignedTo ? [t.assignedTo] : []
  return assignees.length === 0 || assignees.includes(meId)
}

/** The base pool: candidate tasks that are not placed on a visible day.
 *  Behavior-identical extraction of PlanningSession's allUnscheduledTasks:
 *  a task scheduled onto a visible day is PLACED (it belongs on the grid,
 *  not also in the pool), while past-scheduled tasks resurface so they can
 *  be rescheduled. */
export function unscheduledPool(tasks: Task[], ctx: PoolCtx): Task[] {
  const today = new Date(ctx.today)
  today.setHours(0, 0, 0, 0)
  const rangeStart = ctx.rangeStart ? new Date(ctx.rangeStart) : null
  rangeStart?.setHours(0, 0, 0, 0)
  const rangeEnd = ctx.rangeEnd ? new Date(ctx.rangeEnd) : null
  rangeEnd?.setHours(23, 59, 59, 999)

  return tasks.filter((task) => {
    if (task.completed) return false

    // Only tasks the planning member could actually do (see PoolCtx.meId).
    if (ctx.meId && !doableBy(task, ctx.meId)) return false

    // Exclude tasks deferred to a future date
    if (task.deferredUntil) {
      const deferDate = new Date(task.deferredUntil)
      deferDate.setHours(0, 0, 0, 0)
      if (deferDate > today) return false
    }

    // All-day tasks: a date inside the visible grid range means it renders in
    // that day's all-day lane, not the pool. Without a date it stays in the
    // pool. With a date OUTSIDE the range it is placed on some other day, and
    // the same rule as timed tasks below applies: only a PAST date resurfaces
    // (carried over). A future date is a real placement — listing "Pay water
    // bill (Thu 9/10)" under UNSCHEDULED on the previous week's shelf read as
    // "Symphony lost my date" in the 2026-09-04 demo walkthrough.
    if (task.isAllDay) {
      if (!task.scheduledFor) return true
      const allDayDate = new Date(task.scheduledFor)
      if (rangeStart && rangeEnd && allDayDate >= rangeStart && allDayDate <= rangeEnd) return false
      const allDayDay = new Date(allDayDate)
      allDayDay.setHours(0, 0, 0, 0)
      return allDayDay < today
    }

    if (!task.scheduledFor) return true
    const taskDate = new Date(task.scheduledFor)
    // Placed on a day shown on the grid → it's on the grid, not unscheduled.
    if (rangeStart && rangeEnd && taskDate >= rangeStart && taskDate <= rangeEnd) return false
    // Otherwise, past-scheduled tasks resurface so they can be rescheduled.
    const taskDay = new Date(taskDate)
    taskDay.setHours(0, 0, 0, 0)
    return taskDay < today
  })
}

/** The official views. 'week' is the relevance rule (this week's moves, stale
 *  placements, carried-over, all-day); 'month' is the month bucket; 'all'
 *  absorbs the old "Show more from the backlog" toggle. */
export function applyPoolView(pool: Task[], view: PoolView, ctx: PoolCtx): Task[] {
  // The Routines tab shows routines, not tasks — the task pool is empty there.
  if (view === 'routines') return []
  if (view === 'all') return pool
  if (view === 'month') return pool.filter((t) => t.bucket === 'month')
  const today = new Date(ctx.today)
  today.setHours(0, 0, 0, 0)
  const currentWeek = weekStartAnchor(today, ctx.weekStartsOn)
  return pool.filter((t) => {
    // All-day: undated, or carried over from a past day. (unscheduledPool has
    // already dropped future placements, but the rule is stated here too so
    // the two functions cannot disagree.)
    if (t.isAllDay) {
      if (!t.scheduledFor) return true
      const d = new Date(t.scheduledFor)
      d.setHours(0, 0, 0, 0)
      return d < today
    }
    // This week's items, plus anything left behind by an earlier week — a
    // stranded placement is the MOST relevant thing here. Only a move placed
    // on a week still ahead is filtered out.
    if (t.bucket === 'week') return belongsToWeek(t, currentWeek) || isStaleWeekPlacement(t, currentWeek)
    if (t.scheduledFor) {
      const d = new Date(t.scheduledFor)
      d.setHours(0, 0, 0, 0)
      if (d < today) return true // carried over
    }
    return false
  })
}

/** Actionability order: carried-over/stranded first (easiest to lose), then
 *  this-week moves, then all-day, then the rest. Stable within ranks. */
export function orderPool(pool: Task[], ctx: PoolCtx): Task[] {
  const today = new Date(ctx.today)
  today.setHours(0, 0, 0, 0)
  const rank = (t: Task): number => {
    if (!t.isAllDay && t.scheduledFor) {
      const d = new Date(t.scheduledFor)
      d.setHours(0, 0, 0, 0)
      if (d < today) return 0
    }
    if (t.bucket === 'week') return 1
    if (t.isAllDay) return 2
    return 3
  }
  return pool
    .map((t, i) => ({ t, i, r: rank(t) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.t)
}

// Conservative on purpose: a false positive buries a real task inside the
// Meals group; a false negative just leaves one cooking chore loose.
const MEAL_RE = /\b(cook|dinner|lunch|breakfast|meal|recipe)\b/i

export function isMealTask(t: Task): boolean {
  return MEAL_RE.test(t.title)
}

/** Roll the weekly-dinner-seeded chore noise into one group; everything else
 *  stays loose. Order preserved within each half. */
export function groupPool(pool: Task[]): { meals: Task[]; loose: Task[] } {
  const meals: Task[] = []
  const loose: Task[] = []
  for (const t of pool) (isMealTask(t) ? meals : loose).push(t)
  return { meals, loose }
}

// Per-surface persistence. try/catch because storage access can throw
// (private windows, blocked site data).
const KEY_PREFIX = 'symphony-pool-view:'

export function readPoolView(surface: string): PoolView {
  try {
    const v = localStorage.getItem(KEY_PREFIX + surface)
    return v === 'month' || v === 'all' || v === 'routines' ? v : 'week'
  } catch {
    return 'week'
  }
}

export function writePoolView(surface: string, v: PoolView): void {
  try {
    localStorage.setItem(KEY_PREFIX + surface, v)
  } catch {
    // per-viewer convenience only — losing it is fine
  }
}
