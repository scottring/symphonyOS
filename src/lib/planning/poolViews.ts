//
// The week list, decided once. Both planning surfaces (the Plan Your Time
// overlay's drawer and /week's strip) select, filter, order and group THIS
// WEEK'S LIST through these pure functions — one derivation, so the two
// surfaces cannot drift.
//
// There used to be four views here (This week / This month / Everything /
// Routines). The model no longer has that pool: the month is a reference list
// in the rail, looked at rather than drained; the backlog lives in Inbox;
// unhomed routines ride in the week list itself (Scott, 2026-09-05).
import type { Task } from '@/types/task'
import { belongsToWeek, isStaleWeekPlacement } from '@/lib/today/weekPlacement'
import { weekStartAnchor, type WeekStart } from '@/lib/cadence/config'

export interface PoolCtx {
  today: Date
  /** Bounds of the days visible on the grid (null = single-day/no range).
   *  No longer decides list membership on its own — a day that has PASSED
   *  hands its card back whether or not that day is still on screen (see
   *  `unscheduledPool`). Kept for callers and for range-aware consumers. */
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
 *  excludes me does not. Shared with the Month rail so "my week's list" and
 *  "the month I plan it from" scope the same way. */
export function doableBy(t: Pick<Task, 'assignedTo' | 'assignedToAll'>, meId: string): boolean {
  const assignees = t.assignedToAll?.length ? t.assignedToAll : t.assignedTo ? [t.assignedTo] : []
  return assignees.length === 0 || assignees.includes(meId)
}

/** The base pool: candidate tasks that have no day still ahead of them.
 *
 *  A date is a placement while its day is today or later — the card belongs
 *  to that day, on the grid or on a day the grid isn't showing, and the list
 *  leaves it alone. The moment the day PASSES without the card being ticked,
 *  the placement is spent and the card comes back to the list, even while its
 *  column is still on screen (Scott, 2026-09-07: "we need to decide what
 *  happens with items that are not marked as completed on their assigned
 *  day"). Nothing is rewritten: `scheduled_for` stands, the grid still draws
 *  the card on the day it didn't happen, and where it goes next is a person's
 *  decision, never Symphony's. */
export function unscheduledPool(tasks: Task[], ctx: PoolCtx): Task[] {
  const today = new Date(ctx.today)
  today.setHours(0, 0, 0, 0)

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

    // All-day tasks: undated ones stay in the pool; a dated one is placed on
    // its day until that day is behind us. Listing "Pay water bill (Thu 9/10)"
    // under UNSCHEDULED read as "Symphony lost my date" in the 2026-09-04 demo
    // walkthrough — a day still ahead is never the list's business.
    if (task.isAllDay) {
      if (!task.scheduledFor) return true
      const allDayDay = new Date(task.scheduledFor)
      allDayDay.setHours(0, 0, 0, 0)
      return allDayDay < today
    }

    if (!task.scheduledFor) return true
    const taskDay = new Date(task.scheduledFor)
    taskDay.setHours(0, 0, 0, 0)
    // The day passed and nobody ticked it: the card comes back. Today or
    // later, the day still holds it.
    return taskDay < today
  })
}

/** This week's list: this week's moves, stranded placements from earlier
 *  weeks (the MOST relevant thing here), carried-over dated items, and undated
 *  all-day work. A move placed on a week still ahead stays out. */
export function weekList(pool: Task[], ctx: PoolCtx): Task[] {
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
