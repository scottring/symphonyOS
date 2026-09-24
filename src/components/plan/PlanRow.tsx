// src/components/plan/PlanRow.tsx
//
// One row on a planning page: a task or a goal, its fate, and the verbs it
// offers right now. Shared by This Month / This Season / This Year so the
// three pages read as one surface.

import { useState, type ReactNode } from 'react'
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
  /** The goal one rung UP that this goal supports — a month goal's season
   *  goal, a season goal's year goal. Read-only here: it is set when the goal
   *  is written, and it is a different relationship from `steps` (which move
   *  with their goal; a supported goal never moves). */
  supports?: SupportRef | null
  /** The goals one rung DOWN that support this one. The same relationship,
   *  read from the other end, so a parent is never a dead end. */
  supportedBy?: SupportRef[]
}

/** One end of a goal-supports-goal link, as a row draws it. */
export interface SupportRef {
  id: string
  title: string
  /** "Fall 2026", "October", "2026" — where the linked goal lives. */
  period?: string
  /** Which rung it sits on, so the opener knows where to send the reader. */
  rung: 'month' | 'season' | 'year'
}

/** At most this many supporting goals are listed before the rest are counted. */
const SUPPORT_SHOWN = 3

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
  'under-goal': 'Link to goal',
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
  if (action === 'under-goal') return <Target className="w-3.5 h-3.5" />
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

/** One or more linked goals, named and reachable, on their own quiet line.
 *  The period comes first — "October · A home easier to care for" — because
 *  WHEN is what tells you which list to look at. */
function SupportLine({ label, refs, onOpen }: {
  label: string
  refs: SupportRef[]
  onOpen?: (ref: SupportRef) => void
}) {
  const shown = refs.slice(0, SUPPORT_SHOWN)
  const rest = refs.length - shown.length
  return (
    <span className="mt-1 block text-[12px] leading-snug text-neutral-500">
      <span className="text-neutral-400">{label}</span>
      {shown.map((ref) => (
        <span key={ref.id} className="ml-1.5">
          {onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(ref)}
              aria-label={`Open ${ref.title}`}
              className="text-left hover:underline"
            >
              {ref.period ? `${ref.period} · ` : ''}{ref.title}
            </button>
          ) : (
            <>{ref.period ? `${ref.period} · ` : ''}{ref.title}</>
          )}
        </span>
      ))}
      {rest > 0 && <span className="ml-1.5 text-neutral-400">+{rest} more</span>}
    </span>
  )
}

export function PlanRow({
  row, actions, onAction, onOpen, onOpenPlaced, onOpenSupport, lowerLabel = 'this week',
  expanded = false, onToggleExpand, onAddStep, stepActionsFor, planWeek,
}: {
  row: PlanRowModel
  actions: RowAction[]
  onAction: (action: RowAction, row: PlanRowModel) => void
  onOpen: (row: PlanRowModel) => void
  /** Follow the row's status to the copy that carries it. */
  onOpenPlaced?: (taskId: string) => void
  /** Open the goal at the other end of a support link. Omitted where the
   *  links are reference only (a read-only rail), and the lines then read as
   *  plain text rather than dead buttons. */
  onOpenSupport?: (ref: SupportRef) => void
  /** The rung 'to-lower' lands on, named so a hover says where it goes. */
  lowerLabel?: string
  /** Goal rows only: whether the steps beneath are showing. */
  expanded?: boolean
  onToggleExpand?: (row: PlanRowModel) => void
  /** Omitted on a past period — a look-back is read, not written into. */
  onAddStep?: (row: PlanRowModel, title: string) => void
  /** The verbs each step offers; a step is a task, so it is not the goal's. */
  stepActionsFor?: (step: PlanRowModel) => RowAction[]
  /** "Plan ▾" for a task row: which week of the month being VIEWED it sits on.
   *  The 'to-lower' verb beside it means the week containing now, which could
   *  never reach a week of the month you are looking at (2026-09-24). */
  planWeek?: (row: PlanRowModel) => ReactNode
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
  const verbs = actions.filter((a): a is Exclude<RowAction, 'complete'> => a !== 'complete' && a !== 'under-goal')
  // Only a month/season goal holds steps. A year row is a goals-table entity,
  // and a step never nests further, so neither offers a disclosure. A goal
  // with no steps still gets one when it can TAKE them — that is the way in.
  const canHoldSteps = row.isGoal && row.kind === 'task' && (!!onAddStep || (row.steps?.length ?? 0) > 0)
  const [stepDraft, setStepDraft] = useState('')
  // A hairline between rows, and the hover runs the full width of the card:
  // inside a divided list a rounded, inset hover reads as a floating chip
  // (Scott, 2026-09-13). The last row leaves its border off so the card's
  // own edge is the one you see.
  return (
    <>
    <li className="period-plan-row group flex items-start gap-2.5 border-b border-neutral-200 px-2 py-3 transition-colors last:border-0 hover:bg-neutral-50">
      <button
        type="button"
        aria-label={`${done ? 'Reopen' : 'Complete'} ${row.title}`}
        disabled={!canTick}
        onClick={() => onAction('complete', row)}
        className={`period-row-check mt-1 shrink-0 w-[18px] h-[18px] rounded-full border-2 grid place-items-center transition-colors ${
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
      {/* The glyph is a desktop convenience; on a phone the section heading
          already says these are goals, and 24px of row is worth more. */}
      {row.isGoal && <Target className="mt-[3px] hidden h-3.5 w-3.5 shrink-0 text-accent-600 sm:block" aria-label="Goal" />}
      <span className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(row)}
          className={`period-row-title block w-full min-w-0 text-left leading-snug ${row.isGoal ? 'font-display text-[17px]' : 'text-[16px]'} ${done ? 'line-through text-neutral-400' : 'text-neutral-800'}`}
        >
          {row.title}
        </button>
        {row.subtitle && (
          <span className="mt-1 block text-[13px] leading-snug text-neutral-500">{row.subtitle}</span>
        )}
        {/* Both ends of the goal-supports-goal link, quiet, under the title:
            the goal this one serves, and the goals serving it. A parent that
            only ever appeared on its children's rows would be a dead end. */}
        {row.supports && (
          <SupportLine label="Supports" refs={[row.supports]} onOpen={onOpenSupport} />
        )}
        {!!row.supportedBy?.length && (
          <SupportLine label="Supported by" refs={row.supportedBy} onOpen={onOpenSupport} />
        )}
        {!row.isGoal && actions.includes('under-goal') && <button type="button" onClick={() => onAction('under-goal', row)} className="mt-1 block text-xs text-primary-700 hover:underline" aria-label={`Link ${row.title} to a goal`}>Link to goal</button>}
        {canHoldSteps && !!row.steps?.length && <button type="button" onClick={() => onToggleExpand?.(row)} className="mt-1 block text-xs text-primary-700 hover:underline">{row.steps.length} supporting {row.steps.length === 1 ? 'task' : 'tasks'}{expanded ? ' · hide' : ' · show'}</button>}
        {/* Where this row is committed, on its own line beneath the title —
            the chip a reader scans down, not a whisper in the right margin. */}
        {row.placed && (
          <PlacementChip placed={row.placed} onOpenPlaced={onOpenPlaced} />
        )}
      </span>
      {/* Hover verbs, desktop only. On a phone they were invisible (no hover)
          yet still took the width of four 48px touch buttons, which squeezed a
          19px title down to one word a line — and an unseen "Drop" was still
          tappable. A phone opens the row instead. */}
      {/* Phone: the same verbs behind one visible Move control (native
          MoveMenuButton) — a native picker, so it is reachable by touch,
          keyboard and screen reader alike, and never swipe-only. */}
      {verbs.length > 0 && (
        <label className="period-row-move sm:hidden">
          <span aria-hidden="true">Move</span>
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
          <select
            aria-label={`Move ${row.title}`}
            value=""
            onChange={(e) => {
              const a = e.target.value as Exclude<RowAction, 'complete'>
              if (a) onAction(a, row)
            }}
          >
            <option value="" disabled>Move to…</option>
            {verbs.map((a) => <option key={a} value={a}>{label(a, lowerLabel)}</option>)}
          </select>
        </label>
      )}
      {/* Plan stays VISIBLE and reachable at every width, and is not gated on
          the hover verbs beside it. It answers "which week does this belong
          to", which is the whole motion of the cadence — it cannot be a hover
          secret (Codex review of cefcdbcc). */}
      {!row.isGoal && planWeek && <span className="shrink-0">{planWeek(row)}</span>}
      {verbs.length > 0 && (
        <span className="period-row-actions hidden shrink-0 sm:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
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
      <li className="border-b border-neutral-200 last:border-0">
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
              planWeek={planWeek}
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
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
            />
          </form>
        )}
      </li>
    )}
    </>
  )
}
