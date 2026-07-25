import type { Task, TaskBucket } from '@/types/task'
import { belongsToWeek } from './weekPlacement'

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
 * which is only right for a caller that genuinely spans weeks. */
export function selectHorizonPool(
  tasks: Task[],
  horizon: HorizonId,
  match: Match,
  viewedWeekStart?: Date,
): Task[] {
  const def = HORIZONS.find(h => h.id === horizon)
  if (!def || !def.bucket || def.bucket === 'timed') return []
  return tasks.filter(task => {
    if (task.completed || task.bucket !== def.bucket) return false
    if (!match(task.assignedTo, task.assignedToAll)) return false
    if (horizon === 'week' && viewedWeekStart) return belongsToWeek(task, viewedWeekStart)
    return true
  })
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
