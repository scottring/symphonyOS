// src/components/home/week/WeekMonthRail.tsx
//
// The month list beside the week grid — the rung above, read-only. You plan
// the week by LOOKING at this, never by dragging from it (levels connect by
// looking, not linking). Goals first, because a goal is what the month is
// for; tasks after, each carrying its fate (→ placed / → done / struck) so the
// list reads as the record it is.
//
// The one action here is "→ this week" on an open task: a one-tap copy-down
// (the original stays, marked → placed). It replaced the "This month" tab the
// strip used to have — the weekly gesture is "reference the month, decide
// what to do this week", and it needs a home that isn't a drag.

import { useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, Target } from 'lucide-react'
import type { Task } from '@/types/task'
import { belongsToMonth, monthStartOf } from '@/lib/planning/periodPlacement'
import { placementFate, type PlacementFate } from '@/lib/planning/lineage'
import { doableBy } from '@/lib/planning/poolViews'

const STORAGE_KEY = 'symphony-week-month-rail'

function readOpen(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== 'collapsed' } catch { return true }
}
function writeOpen(open: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, open ? 'open' : 'collapsed') } catch { /* private browsing */ }
}

function FateMark({ fate }: { fate: PlacementFate }) {
  if (fate === 'placed-open') return <span className="shrink-0 text-[11px] text-neutral-400">→ placed</span>
  if (fate === 'placed-done') return <span className="shrink-0 text-[11px] text-primary-700">→ done</span>
  return null
}

function Row({ task, fate, onSelect, onAddToWeek }: {
  task: Task
  fate: PlacementFate
  onSelect: (id: string) => void
  onAddToWeek?: (id: string) => void
}) {
  // Only an OPEN task can go to the week: a goal is never placed, a placed row
  // already went, a done row is done.
  const canAdd = !!onAddToWeek && !task.isGoal && fate === 'open'
  return (
    <li className="group flex items-start gap-1">
      <button
        type="button"
        onClick={() => onSelect(`task-${task.id}`)}
        className="min-w-0 flex-1 flex items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-neutral-50 transition-colors"
      >
        {task.isGoal
          ? <Target className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
          : <span className={`mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full ${fate === 'done' ? 'bg-primary-500' : 'bg-neutral-300'}`} />}
        <span className={`min-w-0 flex-1 text-[13px] leading-snug ${fate === 'done' ? 'line-through text-neutral-400' : 'text-neutral-700'}`}>
          {task.title}
        </span>
        <FateMark fate={fate} />
      </button>
      {canAdd && (
        <button
          type="button"
          aria-label={`Add ${task.title} to this week`}
          title="Add to this week"
          onClick={() => onAddToWeek!(task.id)}
          className="shrink-0 mt-0.5 p-1 rounded text-primary-600 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-primary-50 transition-opacity"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  )
}

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
  const [open, setOpen] = useState(readOpen)
  const monthStart = monthStartOf(now)
  // The current month's list — including done and placed rows. belongsToMonth,
  // not isPlacedOnMonth: a legacy NULL row is this month's.
  const rows = tasks.filter((t) =>
    t.bucket === 'month' && belongsToMonth(t, monthStart) && (!meId || doableBy(t, meId)))
  const goals = rows.filter((t) => t.isGoal)
  const items = rows.filter((t) => !t.isGoal)
  const label = now.toLocaleDateString('en-US', { month: 'long' })

  const toggle = () => { setOpen((v) => { writeOpen(!v); return !v }) }

  if (!open) {
    return (
      <aside aria-label="This month" className="shrink-0 w-10 rounded-xl border border-neutral-200 bg-white flex flex-col items-center py-2">
        <button type="button" aria-label="Expand this month" onClick={toggle}
          className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 [writing-mode:vertical-rl]">{label}</span>
      </aside>
    )
  }

  return (
    <aside aria-label="This month" className="shrink-0 w-64 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-semibold tracking-wide uppercase text-neutral-500">This month</span>
        <span className="text-xs text-neutral-400">· {label}</span>
        <button type="button" aria-label="Collapse this month" onClick={toggle}
          className="ml-auto p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400 py-2">Nothing on this month's list.</p>
      ) : (
        <>
          {goals.length > 0 && (
            <>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700/80">Goals</p>
              <ul className="mb-2">{goals.map((t) => <Row key={t.id} task={t} fate={placementFate(t, tasks)} onSelect={onSelectItem} onAddToWeek={onAddToWeek} />)}</ul>
            </>
          )}
          {items.length > 0 && (
            <>
              {goals.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Tasks</p>}
              <ul>{items.map((t) => <Row key={t.id} task={t} fate={placementFate(t, tasks)} onSelect={onSelectItem} onAddToWeek={onAddToWeek} />)}</ul>
            </>
          )}
        </>
      )}
    </aside>
  )
}
