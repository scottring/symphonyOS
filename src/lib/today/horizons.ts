import type { Task, TaskBucket } from '@/types/task'

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
 * selectTimed, year via goals — so they return [] here.) */
export function selectHorizonPool(tasks: Task[], horizon: HorizonId, match: Match): Task[] {
  const def = HORIZONS.find(h => h.id === horizon)
  if (!def || !def.bucket || def.bucket === 'timed') return []
  return tasks.filter(task =>
    !task.completed && task.bucket === def.bucket && match(task.assignedTo, task.assignedToAll),
  )
}
