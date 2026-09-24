// src/lib/planning/goalShelves.ts
//
// Which period a goal's Shelves should show.

import type { Task } from '@/types/task'
import type { PlanLevel } from './periodPage'

/**
 * Read from the stamps on the goal itself — deliberately independent of
 * navigation history and of any URL parameter, so the October goal shows
 * October whether you arrived from October's page, followed a link, or reloaded
 * the detail page directly (S2-18).
 *
 * A goal carrying no period stamp gets no Shelves, and the host keeps whatever
 * it would otherwise render.
 */
export function goalShelvesPeriod(
  goal: Pick<Task, 'monthStart' | 'seasonStart'>,
): { level: PlanLevel; anchor: Date } | null {
  if (goal.monthStart) return { level: 'month', anchor: goal.monthStart }
  if (goal.seasonStart) return { level: 'season', anchor: goal.seasonStart }
  return null
}
