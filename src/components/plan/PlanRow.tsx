// src/components/plan/PlanRow.tsx
//
// One row on a planning page: a task or a goal, its fate, and the verbs it
// offers right now. Shared by This Month / This Season / This Year so the
// three pages read as one surface.

import { Check, Target, ArrowRight, Archive, Trash2, Repeat } from 'lucide-react'
import type { PlacementFate } from '@/lib/planning/lineage'
import type { RowAction } from '@/lib/planning/periodPage'

export interface PlanRowModel {
  id: string
  title: string
  isGoal: boolean
  fate: PlacementFate
  kind: 'task' | 'goal'
}

const ACTION_LABEL: Record<Exclude<RowAction, 'complete'>, string> = {
  keep: 'Keep',
  someday: 'Someday',
  drop: 'Drop',
  'make-goal': 'Make it a goal',
  'make-task': 'Make it a task',
}

function ActionIcon({ action }: { action: Exclude<RowAction, 'complete'> }) {
  if (action === 'keep') return <ArrowRight className="w-3.5 h-3.5" />
  if (action === 'someday') return <Archive className="w-3.5 h-3.5" />
  if (action === 'drop') return <Trash2 className="w-3.5 h-3.5" />
  return <Repeat className="w-3.5 h-3.5" />
}

export function PlanRow({ row, actions, onAction, onOpen }: {
  row: PlanRowModel
  actions: RowAction[]
  onAction: (action: RowAction, row: PlanRowModel) => void
  onOpen: (row: PlanRowModel) => void
}) {
  const done = row.fate === 'done'
  const canTick = actions.includes('complete') || done
  const verbs = actions.filter((a): a is Exclude<RowAction, 'complete'> => a !== 'complete')
  return (
    <li className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-neutral-50 transition-colors">
      <button
        type="button"
        aria-label={`${done ? 'Reopen' : 'Complete'} ${row.title}`}
        disabled={!canTick}
        onClick={() => onAction('complete', row)}
        className={`mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 grid place-items-center transition-colors ${
          done ? 'border-primary-500 bg-primary-500 text-white' : canTick ? 'border-neutral-300 hover:border-primary-500 text-transparent' : 'border-neutral-200 text-transparent'
        }`}
      >
        <Check className="w-3 h-3" strokeWidth={3} />
      </button>
      {row.isGoal && <Target className="w-3.5 h-3.5 mt-[3px] shrink-0 text-amber-600" aria-label="Goal" />}
      <button
        type="button"
        onClick={() => onOpen(row)}
        className={`min-w-0 flex-1 text-left text-[14px] leading-snug ${done ? 'line-through text-neutral-400' : 'text-neutral-800'}`}
      >
        {row.title}
      </button>
      {row.fate === 'placed-open' && <span className="shrink-0 text-xs text-neutral-400 mt-0.5">→ placed</span>}
      {row.fate === 'placed-done' && <span className="shrink-0 text-xs text-primary-700 mt-0.5">→ done</span>}
      {verbs.length > 0 && (
        <span className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {verbs.map((a) => (
            <button
              key={a}
              type="button"
              aria-label={`${ACTION_LABEL[a]} ${row.title}`}
              title={ACTION_LABEL[a]}
              onClick={() => onAction(a, row)}
              className={`p-1 rounded transition-colors ${
                a === 'drop' ? 'text-neutral-300 hover:text-red-600 hover:bg-red-50'
                : a === 'keep' ? 'text-primary-600 hover:bg-primary-50'
                : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <ActionIcon action={a} />
            </button>
          ))}
        </span>
      )}
    </li>
  )
}
