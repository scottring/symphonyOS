// src/components/home/week/WeekMonthRail.tsx
//
// The month list folded beneath the week list — the rung above. Goals first,
// because a goal is what the month is for; tasks after, each carrying its
// fate (→ placed / → done / struck) so the list reads as the record it is.
//
// Two ways to act on an open task, both ending on this week:
//   "→ this week"  a one-tap copy-down onto the week LIST (the original
//                  stays, marked → placed) — for deciding without a day yet.
//   drag to a day  the row is CHOSEN for that day (planned_on) and keeps its
//                  month list — the same drag the Today pin's month group has.
// The fold used to be look-only; the first real walkthrough dragged a row
// onto a day, nothing happened, and the arrow read as "hugely convoluted"
// (Scott, 2026-09-20).
//
// Rendering is PlanRail's — the same fold every planning page uses for the
// level above it. This file only decides WHICH rows are this month's.

import type { Task } from '@/types/task'
import { monthStartOf } from '@/lib/planning/periodPlacement'
import { committedTo, placementFateOf, lowerPlacement } from '@/lib/placement/model'
import { doableBy } from '@/lib/planning/poolViews'
import { PlanRail } from '@/components/plan/PlanRail'
import type { PlanRowModel } from '@/components/plan/PlanRow'

const STORAGE_KEY = 'symphony-week-month-rail'

export function WeekMonthRail({ tasks, onSelectItem, onAddToWeek, meId, now = new Date() }: {
  tasks: Task[]
  onSelectItem: (id: string) => void
  /** Copy an open month task down to this week (the host's pushTask(id, 'week')). */
  onAddToWeek?: (id: string) => void
  /** The planning member. When set, the rail shows only what this person could
   *  put on their week: unassigned items and their own. A month item assigned
   *  exclusively to someone else is rightly VISIBLE elsewhere (shared context)
   *  but isn't theirs to plan — the same rule the strip applies (doableBy). */
  meId?: string | null
  now?: Date
}) {
  const monthStart = monthStartOf(now)
  // The current month's list — including done and placed rows: every row
  // committed to this month, whatever else it carries (a month item now on
  // the week or a day is still the month's, marked with where it went). A
  // legacy row with no records answers from its cache, NULL = this month.
  const rows: PlanRowModel[] = tasks
    .filter((t) => committedTo(t, 'month', monthStart, { isCurrent: true }) !== undefined && (!meId || doableBy(t, meId)))
    .map((t) => {
      // Fate and "→ where it went" are read off the row, from the month's
      // point of view: a week commitment or a day below it is a placement.
      const lower = t.completed ? null : lowerPlacement(t, 'month', monthStart)
      return {
        id: t.id, title: t.title, isGoal: !!t.isGoal, fate: placementFateOf(t, 'month', monthStart), kind: 'task' as const,
        placed: t.completed
          ? { label: 'done', id: t.id, kind: 'done' as const }
          : lower
            ? { label: lower.label, id: t.id, kind: (lower.kind === 'date' ? 'date' : lower.kind === 'week' ? 'week' : 'placed') as 'date' | 'week' | 'placed' }
            : null,
      }
    })
  const label = now.toLocaleDateString('en-US', { month: 'long' })

  return (
    <PlanRail
      title="This month"
      subtitle={label}
      rows={rows}
      storageKey={STORAGE_KEY}
      dragDate={now}
      onOpen={(row) => onSelectItem(`task-${row.id}`)}
      onPullDown={onAddToWeek ? (row) => onAddToWeek(row.id) : undefined}
      pullLabel="Add to this week:"
      emptyCopy="Nothing on this month's list."
    />
  )
}
