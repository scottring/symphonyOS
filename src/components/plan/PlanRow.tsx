// src/components/plan/PlanRow.tsx
//
// One row on a planning page: a task or a goal, its fate, and the verbs it
// offers right now. Shared by This Month / This Season / This Year so the
// three pages read as one surface.

import { useState } from 'react'
import { Check, Target, ArrowRight, ArrowUpRight, ArrowDownRight, Sun, CalendarDays, Archive, Trash2, Repeat, ChevronRight, ChevronDown, Plus } from 'lucide-react'
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
  /** The tasks filed under this goal — "hang plants" under "Transform the
   *  porch". Month and season goals only, and one level deep: a step never
   *  carries steps of its own. */
  steps?: PlanRowModel[]
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
  'to-lower': 'Take it into',
  today: 'Do it today',
}

/** 'to-lower' names the rung it lands on, so a hover says where it goes. */
function label(a: Exclude<RowAction, 'complete'>, lowerLabel: string): string {
  return a === 'to-lower' ? `${ACTION_LABEL[a]} ${lowerLabel}` : ACTION_LABEL[a]
}

function ActionIcon({ action }: { action: Exclude<RowAction, 'complete'> }) {
  if (action === 'keep') return <ArrowRight className="w-3.5 h-3.5" />
  if (action === 'someday') return <Archive className="w-3.5 h-3.5" />
  if (action === 'drop') return <Trash2 className="w-3.5 h-3.5" />
  if (action === 'to-lower') return <ArrowDownRight className="w-3.5 h-3.5" />
  if (action === 'today') return <Sun className="w-3.5 h-3.5" />
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

export function PlanRow({
  row, actions, onAction, onOpen, onOpenPlaced, lowerLabel = 'this week',
  expanded = false, onToggleExpand, onAddStep, stepActionsFor,
}: {
  row: PlanRowModel
  actions: RowAction[]
  onAction: (action: RowAction, row: PlanRowModel) => void
  onOpen: (row: PlanRowModel) => void
  /** Follow the row's status to the copy that carries it. */
  onOpenPlaced?: (taskId: string) => void
  /** The rung 'to-lower' lands on, named so a hover says where it goes. */
  lowerLabel?: string
  /** Goal rows only: whether the steps beneath are showing. */
  expanded?: boolean
  onToggleExpand?: (row: PlanRowModel) => void
  /** Omitted on a past period — a look-back is read, not written into. */
  onAddStep?: (row: PlanRowModel, title: string) => void
  /** The verbs each step offers; a step is a task, so it is not the goal's. */
  stepActionsFor?: (step: PlanRowModel) => RowAction[]
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
  // Only a month/season goal holds steps. A year row is a goals-table entity,
  // and a step never nests further, so neither offers a disclosure. A goal
  // with no steps still gets one when it can TAKE them — that is the way in.
  const canHoldSteps = row.isGoal && row.kind === 'task' && (!!onAddStep || (row.steps?.length ?? 0) > 0)
  const [stepDraft, setStepDraft] = useState('')
  return (
    <>
    // A hairline between rows, and the hover runs the full width of the card:
    // inside a divided list a rounded, inset hover reads as a floating chip
    // (Scott, 2026-09-13). The last row leaves its border off so the card's
    // own edge is the one you see.
    <li className="group flex items-start gap-2.5 border-b border-neutral-100 px-2 py-2 transition-colors last:border-0 hover:bg-neutral-50">
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
      {canHoldSteps && (
        <button
          type="button"
          aria-label={`${expanded ? 'Hide' : 'Show'} steps under ${row.title}`}
          aria-expanded={expanded}
          onClick={() => onToggleExpand?.(row)}
          className="mt-[3px] shrink-0 text-neutral-400 transition-colors hover:text-neutral-700"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      )}
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
              aria-label={`${label(a, lowerLabel)} ${row.title}`}
              title={label(a, lowerLabel)}
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
    {canHoldSteps && expanded && (
      /* The steps are their own list items in the same <ul>, indented rather
         than nested in a second list, so a screen reader reads one flat plan. */
      <li className="border-b border-neutral-100 last:border-0">
        <ul className="pl-7">
          {(row.steps ?? []).map((step) => (
            <PlanRow
              key={step.id}
              row={step}
              actions={stepActionsFor?.(step) ?? []}
              onAction={onAction}
              onOpen={onOpen}
              onOpenPlaced={onOpenPlaced}
              lowerLabel={lowerLabel}
            />
          ))}
        </ul>
        {onAddStep && (
          <form
            className="flex items-center gap-2 py-1.5 pl-7 pr-2"
            onSubmit={(e) => {
              e.preventDefault()
              const t = stepDraft.trim()
              setStepDraft('')
              if (t) onAddStep(row, t)
            }}
          >
            <Plus className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
            <input
              aria-label={`New step for ${row.title}`}
              value={stepDraft}
              onChange={(e) => setStepDraft(e.target.value)}
              placeholder="Add a step"
              className="min-w-0 flex-1 bg-transparent py-1 text-[13px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
            />
          </form>
        )}
      </li>
    )}
    </>
  )
}
