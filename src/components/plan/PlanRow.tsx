// src/components/plan/PlanRow.tsx
//
// One row on a planning page: a task or a goal, its fate, and the verbs it
// offers right now. Shared by This Month / This Season / This Year so the
// three pages read as one surface.

import { Check, Target, ArrowRight, ArrowUpRight, CalendarDays, Archive, Trash2, Repeat } from 'lucide-react'
import type { PlacementFate } from '@/lib/planning/lineage'
import type { RowAction } from '@/lib/planning/periodPage'

export interface PlanRowModel {
  id: string
  title: string
  isGoal: boolean
  fate: PlacementFate
  kind: 'task' | 'goal'
  /** One quiet line of intent under a goal — its first line of notes. Goals
   *  carry a "why"; tasks stay one line. */
  subtitle?: string
  /** Where this row's copy went, when it has been taken down a level. The
   *  row's ONE status line; the tick says whether it is finished. */
  placed?: { label: string; id: string; kind: 'week' | 'date' | 'done' | 'placed' } | null
}

/** Is this row finished? Own completion or its copy's — the distinction
 *  matters for who may REOPEN it, never for how it reads. The list and the
 *  rails both ask here: reading it in two places is how the rail came to show
 *  finished work as outstanding (review 2026-09-13). */
export function rowIsDone(fate: PlacementFate): boolean {
  return fate === 'done' || fate === 'placed-done'
}

/** May this row be reopened HERE? Only when the completion is its own. A
 *  placed-and-done row reads as finished (rowIsDone) but is reopened on the
 *  copy that did the work — two questions that look alike and are not, which
 *  is why each has a name. Conflating them stranded every completed row as
 *  unreopenable (review 2026-09-13). */
export function rowOwnsCompletion(fate: PlacementFate): boolean {
  return fate === 'done'
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

function PlacementChip({ placed, onOpenPlaced }: {
  placed: NonNullable<PlanRowModel['placed']>
  onOpenPlaced?: (taskId: string) => void
}) {
  const Icon = placed.kind === 'date' ? CalendarDays : placed.kind === 'done' ? Check : ArrowUpRight
  const tone = placed.kind === 'done' ? 'text-neutral-400' : 'text-primary-700'
  const body = (
    <>
      <Icon className="w-3 h-3 shrink-0" />
      <span className="truncate">{placed.label}</span>
    </>
  )
  const base = `mt-0.5 inline-flex max-w-full items-center gap-1 text-[12px] ${tone}`
  return onOpenPlaced ? (
    <button
      type="button"
      onClick={() => onOpenPlaced(placed.id)}
      title={`Open this task where it now lives — ${placed.label}`}
      className={`${base} rounded hover:underline transition-colors`}
    >
      {body}
    </button>
  ) : (
    <span className={base}>{body}</span>
  )
}

export function PlanRow({ row, actions, onAction, onOpen, onOpenPlaced }: {
  row: PlanRowModel
  actions: RowAction[]
  onAction: (action: RowAction, row: PlanRowModel) => void
  onOpen: (row: PlanRowModel) => void
  /** Follow the row's status to the copy that carries it. */
  onOpenPlaced?: (taskId: string) => void
}) {
  // A row whose copy is finished reads as finished — one status, not a tick
  // that disagrees with an annotation beside it.
  const done = rowIsDone(row.fate)
  // A row YOU ticked can always be un-ticked: actionsFor offers no verbs on a
  // finished row, so gating the tick on `complete` alone stranded every
  // completed task and goal as unreopenable (regression, caught in review
  // 2026-09-13). Only `placed-done` stays locked — that completion belongs to
  // the copy that did the work, and is reopened there.
  const canTick = actions.includes('complete') || rowOwnsCompletion(row.fate)
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
      <span className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(row)}
          className={`block w-full min-w-0 text-left leading-snug ${row.isGoal ? 'font-display text-[17px]' : 'text-[14px]'} ${done ? 'line-through text-neutral-400' : 'text-neutral-800'}`}
        >
          {row.title}
        </button>
        {row.subtitle && (
          <span className="mt-0.5 block text-[12px] leading-snug text-neutral-500">{row.subtitle}</span>
        )}
        {/* Where this row is committed, on its own line beneath the title —
            the chip a reader scans down, not a whisper in the right margin. */}
        {row.placed && (
          <PlacementChip placed={row.placed} onOpenPlaced={onOpenPlaced} />
        )}
      </span>
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
