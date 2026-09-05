// src/components/plan/PlanRail.tsx
//
// The level above, read-only, beside the list being written. Levels connect by
// looking, not linking: nothing drags from here and nothing is linked. The one
// verb is "→ this month" on an open season task (a copy-down), the same way the
// week's Month rail offers "→ this week".

import { ArrowRight, Target } from 'lucide-react'
import type { PlanRowModel } from './PlanRow'

export function PlanRail({ title, subtitle, rows, onOpen, onPullDown, pullLabel, emptyCopy }: {
  title: string
  subtitle?: string
  rows: PlanRowModel[]
  onOpen: (row: PlanRowModel) => void
  /** Copy an open task down into the page's own level. Omitted = look only. */
  onPullDown?: (row: PlanRowModel) => void
  pullLabel?: string
  emptyCopy: string
}) {
  const goals = rows.filter((r) => r.isGoal)
  const items = rows.filter((r) => !r.isGoal)
  const Row = ({ row }: { row: PlanRowModel }) => {
    const canPull = !!onPullDown && !row.isGoal && row.fate === 'open'
    return (
      <li className="group flex items-start gap-1">
        <button
          type="button"
          onClick={() => onOpen(row)}
          className="min-w-0 flex-1 flex items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-neutral-50 transition-colors"
        >
          {row.isGoal
            ? <Target className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
            : <span className={`mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full ${row.fate === 'done' ? 'bg-primary-500' : 'bg-neutral-300'}`} />}
          <span className={`min-w-0 flex-1 text-[13px] leading-snug ${row.fate === 'done' ? 'line-through text-neutral-400' : 'text-neutral-700'}`}>
            {row.title}
          </span>
          {row.fate === 'placed-open' && <span className="shrink-0 text-[11px] text-neutral-400">→ placed</span>}
          {row.fate === 'placed-done' && <span className="shrink-0 text-[11px] text-primary-700">→ done</span>}
        </button>
        {canPull && (
          <button
            type="button"
            aria-label={`${pullLabel ?? 'Add'} ${row.title}`}
            title={pullLabel}
            onClick={() => onPullDown!(row)}
            className="shrink-0 mt-0.5 p-1 rounded text-primary-600 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-primary-50 transition-opacity"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </li>
    )
  }
  return (
    <aside aria-label={title} className="shrink-0 w-72 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-xs font-semibold tracking-wide uppercase text-neutral-500">{title}</span>
        {subtitle && <span className="text-xs text-neutral-400">· {subtitle}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400 py-2">{emptyCopy}</p>
      ) : (
        <>
          {goals.length > 0 && (
            <>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700/80">Goals</p>
              <ul className="mb-2">{goals.map((r) => <Row key={r.id} row={r} />)}</ul>
            </>
          )}
          {items.length > 0 && (
            <>
              {goals.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Tasks</p>}
              <ul>{items.map((r) => <Row key={r.id} row={r} />)}</ul>
            </>
          )}
        </>
      )}
    </aside>
  )
}
