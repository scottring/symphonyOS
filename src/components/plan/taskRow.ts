// src/components/plan/taskRow.ts
//
// A task as a period's list draws it: its fate and "→ where it went" are read
// off the task itself, relative to the level and period being shown (a
// September row kept into October says "carried to October" on September's
// list and nothing on October's).

import type { Task } from '@/types/task'
import type { PlanLevel } from '@/lib/planning/periodPage'
import { placementFateOf, lowerPlacement } from '@/lib/placement/model'
import { firstNoteLine } from '@/lib/planning/goalsReference'
import type { PlanRowModel, SupportRef } from './PlanRow'

/** The two ends of this goal's support link, as the row draws them. Passed in
 *  rather than looked up inside `taskRow` so the row builder stays pure and
 *  the read rules live in one place (`goalSupport.ts`). */
export interface RowSupport { supports?: SupportRef | null; supportedBy?: SupportRef[] }

export function taskRow(t: Task, level: PlanLevel, periodStart: Date, support?: RowSupport): PlanRowModel {
  const lvl = level === 'season' ? 'season' : 'month'
  const lower = t.completed ? null : lowerPlacement(t, lvl, periodStart)
  return {
    id: t.id, title: t.title, isGoal: !!t.isGoal, fate: placementFateOf(t, lvl, periodStart), kind: 'task',
    placed: t.completed
      ? { label: 'done', id: t.id, kind: 'done' }
      : lower
        ? { label: lower.label, id: t.id, kind: lower.kind === 'date' ? 'date' : lower.kind === 'week' ? 'week' : 'placed' }
        : null,
    subtitle: t.isGoal ? firstNoteLine(t.notes) : undefined,
    supports: support?.supports ?? null,
    supportedBy: support?.supportedBy,
    // Already normalised by the task mapper: a legacy single assignee reads
    // as a one-person list.
    assigneeIds: t.assignedToAll ?? [],
  }
}
