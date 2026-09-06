import type { Task, TaskBucket } from '@/types/task'
import { belongsToWeek, isStaleWeekPlacement } from './weekPlacement'
import { belongsToMonth } from '@/lib/planning/periodPlacement'

export type HorizonId = 'today' | 'week' | 'month' | 'season' | 'year' | 'someday'
type Match = (assignedTo: string | null | undefined, assignedToAll?: readonly string[] | null) => boolean

/** The rhythm rungs, in spine order. `bucket` is the pool this horizon draws
 * from (today = timed-on-date, handled by existing selectTimed; year is a
 * goals-level horizon with no task bucket of its own → empty task pool). */
export const HORIZONS: { id: HorizonId; label: string; bucket: TaskBucket | null }[] = [
  { id: 'today',   label: 'Today',       bucket: 'timed' },
  { id: 'week',    label: 'This Week',   bucket: 'week' },
  { id: 'month',   label: 'This Month',  bucket: 'month' },
  { id: 'season',  label: 'This Season', bucket: 'quarter' },
  { id: 'year',    label: 'This Year',   bucket: null },
  { id: 'someday', label: 'Someday',     bucket: 'someday' },
]

/** A horizon's scoped pool: incomplete tasks in that horizon's bucket, matched
 * by assignee. (today/year are handled by their own views — today via
 * selectTimed, year via goals — so they return [] here.)
 *
 * `viewedWeekStart` scopes the WEEK horizon to one week: a month move placed on
 * the week of Aug 10 belongs to that week's pool, not to every week's. Callers
 * showing a specific week must pass it — the /week page passes the week it's
 * anchored to, Today passes the current week. Omitting it means "any week",
 * which is only right for a caller that genuinely spans weeks.
 *
 * `viewedMonthStart` does the same for the MONTH horizon: since month_start
 * exists, the month pool is one month's list. A legacy NULL row is the current
 * month's (belongsToMonth). Omitting it means "any month". */
export function selectHorizonPool(
  tasks: Task[],
  horizon: HorizonId,
  match: Match,
  viewedWeekStart?: Date,
  viewedMonthStart?: Date,
): Task[] {
  const def = HORIZONS.find(h => h.id === horizon)
  if (!def || !def.bucket || def.bucket === 'timed') return []
  return tasks.filter(task => {
    if (task.completed || task.bucket !== def.bucket) return false
    if (!match(task.assignedTo, task.assignedToAll)) return false
    if (horizon === 'week' && viewedWeekStart) return belongsToWeek(task, viewedWeekStart)
    if (horizon === 'month' && viewedMonthStart) return belongsToMonth(task, viewedMonthStart)
    return true
  })
}

/** The week rung's carry-over: moves placed on a week that has already passed
 * and never given a day. Nothing rolls them forward on its own — that was the
 * explicit decision — so without this they sit on a past week that the week pool
 * won't show and no one will open again. Surfaced on the current week alongside
 * the overdue-dated carry-over, so a stranded placement gets a fate instead of
 * quietly aging out.
 *
 * Oldest first: the thing you've ignored longest asks first. */
export function selectStaleWeekPlacements(tasks: Task[], viewedWeekStart: Date, match: Match): Task[] {
  return tasks
    .filter(task => isStaleWeekPlacement(task, viewedWeekStart) && match(task.assignedTo, task.assignedToAll))
    .sort((a, b) => (a.weekStart as Date).getTime() - (b.weekStart as Date).getTime())
}

/** The week's placed rocks: tasks scheduled onto a day inside the week that
 * starts at `weekStart`. Placing a rock flips bucket week→timed (the
 * timed-bucket invariant), so it leaves the week pool — without this the /week
 * page reads as empty the moment a plan is fully placed (week-boundary spec).
 * Mirrors ScheduleGridStep's placed-rocks filter. */
export function selectPlacedInWeek(tasks: Task[], weekStart: Date, match: Match): Task[] {
  const start = new Date(weekStart)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return tasks.filter(task => {
    if (task.completed || task.bucket !== 'timed' || !task.scheduledFor) return false
    if (!match(task.assignedTo, task.assignedToAll)) return false
    const d = new Date(task.scheduledFor)
    return d >= start && d < end
  })
}
