// src/components/home/week/WeekMonthRail.tsx
//
// The month list folded beneath the week list — the rung above, read-only.
// You plan the week by LOOKING at this, never by dragging from it (levels
// connect by looking, not linking). Goals first, because a goal is what the
// month is for; tasks after, each carrying its fate (→ placed / → done /
// struck) so the list reads as the record it is.
//
// The one action here is "→ this week" on an open task: a one-tap copy-down
// (the original stays, marked → placed). It replaced the "This month" tab the
// strip used to have — the weekly gesture is "reference the month, decide
// what to do this week", and it needs a home that isn't a drag.
//
// Rendering is PlanRail's — the same fold every planning page uses for the
// level above it. This file only decides WHICH rows are this month's.

import type { Task } from '@/types/task'
import { belongsToMonth, monthStartOf } from '@/lib/planning/periodPlacement'
import { placementFate } from '@/lib/planning/lineage'
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
  // The current month's list — including done and placed rows. belongsToMonth,
  // not isPlacedOnMonth: a legacy NULL row is this month's.
  const rows: PlanRowModel[] = tasks
    .filter((t) => t.bucket === 'month' && belongsToMonth(t, monthStart) && (!meId || doableBy(t, meId)))
    .map((t) => ({ id: t.id, title: t.title, isGoal: !!t.isGoal, fate: placementFate(t, tasks), kind: 'task' as const }))
  const label = now.toLocaleDateString('en-US', { month: 'long' })

  return (
    <PlanRail
      title="This month"
      subtitle={label}
      rows={rows}
      storageKey={STORAGE_KEY}
      onOpen={(row) => onSelectItem(`task-${row.id}`)}
      onPullDown={onAddToWeek ? (row) => onAddToWeek(row.id) : undefined}
      pullLabel="Add to this week:"
      emptyCopy="Nothing on this month's list."
    />
  )
}
