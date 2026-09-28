// src/components/plan/v2/WeekListV2.tsx
//
// "This week's list", v2 — the week's undated work with its triage on each
// line (Scott, 2026-09-28: "we need a way to triage items on this week's list,
// such as context / assignee(s)"). The month beside it is the reference, so
// the list no longer repeats the month's goals.
//
// Each line: done · the words (open the Details pane) · the goal it serves;
// beneath, its controls: life area, people, when (the week's own timing
// control), and ⋯ for next week / Someday / Drop / All details.

import { useState, type ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Check, CornerDownRight, GripVertical } from 'lucide-react'
import type { Task, TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { ContextPicker } from '@/components/triage/ContextPicker'
import { MultiAssigneeDropdown } from '@/components/family'
import { assigneesOf } from '@/lib/planning/v2/planV2'
import { localYmd } from '@/lib/cadence/config'
import { LineMenu, type LineActions, type LineVM } from './PlanLine'

type Parent = { id: string; title: string; isGoal: boolean }

export function WeekListV2({ title, lines, weekStart, members, actions, timingControl, onContext, onAdd, parentOf, onHoverParent, onShowParent, draftChild, onDraftChild, onCancelChild, dragEnabled = true }: {
  title: string
  lines: LineVM[]
  weekStart: Date
  members: FamilyMember[]
  actions: LineActions
  /** The week's own "when" control (TaskTimingMenu), as WeekViewV2 builds it. */
  timingControl?: (task: Task) => ReactNode
  onContext: (task: Task, context: TaskContext | undefined) => void
  onAdd: (title: string) => Promise<void>
  /** The month line a week task came from — the line it was made from
   *  (source_id) or the goal it is a step of (goal_task_id). */
  parentOf: (task: Task) => Parent | null
  /** Hovering a row lights its parent in the month column. */
  onHoverParent?: (id: string | null) => void
  onShowParent?: (id: string) => void
  /** A child being named, opened from a month line ("+ Next step"). */
  draftChild?: Parent | null
  onDraftChild?: (title: string) => void
  onCancelChild?: () => void
  dragEnabled?: boolean
}) {
  const [draft, setDraft] = useState('')
  const [showDone, setShowDone] = useState(false)
  const first = localYmd(weekStart)
  const last = localYmd(new Date(weekStart.getTime() + 6 * 86_400_000))
  const inWeek = (t: Task) => !!t.scheduledFor && localYmd(t.scheduledFor) >= first && localYmd(t.scheduledFor) <= last
  const open = lines.filter((l) => !l.task.completed)
  const done = lines.filter((l) => l.task.completed)
  const onDays = open.filter((l) => inWeek(l.task))
  const groups = [
    { title: 'Any day', rows: open.filter((l) => !l.task.scheduledFor) },
    { title: 'Scheduled outside this week', rows: open.filter((l) => l.task.scheduledFor && !inWeek(l.task)) },
    { title: 'Completed', rows: showDone ? done : [] },
  ].filter((g) => g.rows.length)

  // The list takes things back: a day's task dropped here loses its day and
  // stays this week (useWeekDragDrop, kind 'weekList').
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: 'week-list', data: { kind: 'weekList' }, disabled: !dragEnabled })
  const row = (vm: LineVM) => <Card key={vm.task.id} vm={vm} actions={actions} members={members} timingControl={timingControl}
    onContext={onContext} parent={parentOf(vm.task)} onHoverParent={onHoverParent} onShowParent={onShowParent} dragEnabled={dragEnabled} />
  return (
    <section ref={dropRef} aria-label="This week's list" className={`pv2-wl${isOver ? ' is-over' : ''}`}>
      <div className="pv2-colh">{title}</div>
      {draftChild && onDraftChild && <DraftChild key={draftChild.id} parent={draftChild} onAdd={onDraftChild} onCancel={() => onCancelChild?.()} />}
      {!open.length && !done.length && !draftChild && <p className="pv2-hint">Nothing on this week’s list yet. “Plan this week” lets you choose from the month.</p>}
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <div className="pv2-wl-h">{g.title}</div>
          <ul className="pv2-list">{g.rows.map(row)}</ul>
        </section>
      ))}
      {onDays.length > 0 && <p className="pv2-hint">{onDays.length} {onDays.length === 1 ? 'is' : 'are'} on a day this week — under {onDays.length === 1 ? 'its day' : 'their days'}.</p>}
      {done.length > 0 && <button type="button" className="pv2-link pv2-quiet" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>{showDone ? 'Hide completed' : `Completed · ${done.length}`}</button>}
      <form className="pv2-write" onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v) { void onAdd(v); setDraft('') } }}>
        <span className="pv2-wl-check" aria-hidden="true" />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add something for this week" aria-label="Add to this week" />
      </form>
    </section>
  )
}

// A card drags onto a day with the week's own chip protocol ('pool:<id>',
// {kind:'chip'} → useWeekDragDrop: an all-day date on that day, past days
// refused, Undo offered; WeekViewV2 already draws its floating pill).
function Card({ vm, actions, members, timingControl, onContext, parent, onHoverParent, onShowParent, dragEnabled }: {
  vm: LineVM; actions: LineActions; members: FamilyMember[]
  timingControl?: (task: Task) => ReactNode
  onContext: (task: Task, context: TaskContext | undefined) => void
  parent: Parent | null
  onHoverParent?: (id: string | null) => void
  onShowParent?: (id: string) => void
  dragEnabled: boolean
}) {
  const t = vm.task
  const movable = dragEnabled && !t.completed
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `pool:${t.id}`, data: { kind: 'chip', taskId: t.id }, disabled: !movable })
  return (
    <li ref={setNodeRef} className={`pv2-wl-row${t.completed ? ' is-done' : ''}${movable ? ' is-card' : ''}${isDragging ? ' is-dragging' : ''}`}
      onMouseEnter={parent ? () => onHoverParent?.(parent.id) : undefined} onMouseLeave={parent ? () => onHoverParent?.(null) : undefined}>
      {movable && <span className="pv2-grip" {...listeners} {...attributes} aria-label={`Drag ${t.title} onto a day`} title="Drag onto a day"><GripVertical className="h-3.5 w-3.5" /></span>}
      <button type="button" className={`pv2-wl-check${t.completed ? ' is-on' : ''}`} onClick={() => actions.done(t)}
        aria-label={t.completed ? `Mark ${t.title} not done` : `Complete ${t.title}`}>
        {t.completed && <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />}
      </button>
      {/* Just the words (Scott, 2026-09-28: "perhaps just the title is
          warranted"). What it serves is its tooltip; life area, people and
          when come up on hover or focus, beside ⋯. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <button type="button" className="pv2-wl-title" onClick={() => actions.details(t)}>{t.title}</button>
          <LineMenu vm={vm} actions={actions} nextLabel="next week" />
        </div>
        {/* On hover: the month line it came from — lit in the month column,
            and a click shows it there. */}
        {parent && (
          <button type="button" className="pv2-wl-parent" onClick={() => onShowParent?.(parent.id)}
            aria-label={`${parent.isGoal ? 'Step toward' : 'From'} ${parent.title} — show it in the month`}>
            <CornerDownRight className="h-3 w-3" aria-hidden="true" />{parent.isGoal ? 'Step toward' : 'From'} “{parent.title}”
          </button>
        )}
        <div className="pv2-wl-tools">
          <ContextPicker size="sm" value={t.context ?? null} onChange={(c) => onContext(t, c)} />
          {members.length > 0 && <MultiAssigneeDropdown members={members} selectedIds={assigneesOf(t)} onSelect={(ids) => actions.assign(t, ids)} size="sm" triggerLabel={`Assign people to ${t.title}`} />}
          {timingControl && <span className="min-w-0">{timingControl(t)}</span>}
        </div>
      </div>
    </li>
  )
}

// The row a "+ Next step" opens: already on the list it will join, saying
// which month line it belongs to. Enter adds it; Escape (or an empty blur)
// lets it go.
function DraftChild({ parent, onAdd, onCancel }: { parent: Parent; onAdd: (title: string) => void; onCancel: () => void }) {
  const [v, setV] = useState('')
  return (
    <form className="pv2-wl-row is-card is-draft" onSubmit={(e) => { e.preventDefault(); const t = v.trim(); if (t) onAdd(t) }}>
      <span className="pv2-wl-check" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <input autoFocus className="pv2-wl-draft" value={v} onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }} onBlur={() => { if (!v.trim()) onCancel() }}
          placeholder={parent.isGoal ? 'Name the next step' : 'Name the step'} aria-label={`${parent.isGoal ? 'Next step toward' : 'Step of'} ${parent.title}`} />
        <span className="pv2-wl-parent is-shown"><CornerDownRight className="h-3 w-3" aria-hidden="true" />{parent.isGoal ? 'Step toward' : 'From'} “{parent.title}” · Enter to add</span>
      </div>
    </form>
  )
}
