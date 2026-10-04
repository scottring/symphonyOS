// src/components/plan/v2/WeekListV2.tsx
//
// "This week's list", v2 — the week's undated work with its triage on each
// line (Scott, 2026-09-28: "we need a way to triage items on this week's list,
// such as context / assignee(s)"). The month beside it is the reference, so
// the list no longer repeats the month's goals.
//
// Each line: done · the words (open the Details pane); beneath, its controls: life area, people, when (the week's own timing
// control), and ⋯ for next week / Someday / Drop / All details.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Task, TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { ContextPicker } from '@/components/triage/ContextPicker'
import { MultiAssigneeDropdown } from '@/components/family'
import { assigneesOf } from '@/lib/planning/v2/planV2'
import { localYmd } from '@/lib/cadence/config'
import { LineMenu, type LineActions, type LineVM } from './PlanLine'
import { WeekRow } from './WeekRow'

export function WeekListV2({ title, lines, weekStart, members, actions, timingControl, onContext, onAdd, dragEnabled = true, headerAction, addPicker, emptyHint, focusAdd = false, hint }: {
  title: string
  lines: LineVM[]
  weekStart: Date
  members: FamilyMember[]
  actions: LineActions
  /** The week's own "when" control (TaskTimingMenu), as WeekViewV2 builds it. */
  timingControl?: (task: Task) => ReactNode
  onContext: (task: Task, context: TaskContext | undefined) => void
  onAdd: (title: string) => Promise<void>
  dragEnabled?: boolean
  /** Drawn at the right of the heading (Add from paper). */
  headerAction?: ReactNode
  /** The add row's life-area choice (AddArea). */
  addPicker?: ReactNode
  /** The empty list's hint. */
  emptyHint?: string
  /** Open with the cursor in the add row (arriving to write). */
  focusAdd?: boolean
  /** A line under the heading saying what the list is for. */
  hint?: string
}) {
  const [draft, setDraft] = useState('')
  const addRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (focusAdd) addRef.current?.focus() }, [focusAdd])
  const [showDone, setShowDone] = useState(false)
  const first = localYmd(weekStart)
  const last = localYmd(new Date(weekStart.getTime() + 6 * 86_400_000))
  const inWeek = (t: Task) => !!t.scheduledFor && localYmd(t.scheduledFor) >= first && localYmd(t.scheduledFor) <= last
  const open = lines.filter((l) => !l.task.completed)
  const done = lines.filter((l) => l.task.completed)
  // A line with a day this week is on that day, beside the list; the list
  // holds only what is still waiting for one (Scott, 2026-10-03: "it's
  // duplicated").
  const allPlaced = open.length > 0 && open.every((l) => inWeek(l.task))
  const groups = [
    { title: 'Any day', rows: open.filter((l) => !l.task.scheduledFor) },
    { title: 'Scheduled outside this week', rows: open.filter((l) => l.task.scheduledFor && !inWeek(l.task)) },
    { title: 'Completed', rows: showDone ? done : [] },
  ].filter((g) => g.rows.length)

  // The list takes things back: a day's task dropped here loses its day and
  // stays this week (useWeekDragDrop, kind 'weekList').
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: 'week-list', data: { kind: 'weekList' }, disabled: !dragEnabled })
  const row = (vm: LineVM) => <Card key={vm.task.id} vm={vm} actions={actions} members={members} timingControl={timingControl}
    onContext={onContext} dragEnabled={dragEnabled} />
  return (
    <section ref={dropRef} aria-label="This week's list" className={`pv2-wl${isOver ? ' is-over' : ''}`}>
      <div className="pv2-colh">{title}{headerAction}</div>
      {hint && <p className="wk-listhint">{hint}</p>}
      {!open.length && !done.length && <p className="pv2-hint ds-empty-body">{emptyHint ?? 'Nothing on this week’s list yet. Add below.'}</p>}
      {allPlaced && <p className="pv2-hint">Everything on this week’s list has a day.</p>}
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <div className="pv2-wl-h">{g.title}</div>
          <ul className="pv2-list">{g.rows.map(row)}</ul>
        </section>
      ))}
      {done.length > 0 && <button type="button" className="pv2-link pv2-quiet" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>{showDone ? 'Hide done' : 'Show done'}</button>}
      <form className="pv2-write" onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v) { void onAdd(v); setDraft('') } }}>
        <span className="pv2-wl-check" aria-hidden="true" />
        <input ref={addRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add something for this week" aria-label="Add to this week" />
        {addPicker}
      </form>
    </section>
  )
}

// A row drags onto a day with the week's own chip protocol ('pool:<id>',
// {kind:'chip'} → useWeekDragDrop: an all-day date on that day, past days
// refused, Undo offered). The same row every column draws (WeekRow,
// 2026-10-03) — no white card; the grip says it moves.
function Card({ vm, actions, members, timingControl, onContext, dragEnabled }: {
  vm: LineVM; actions: LineActions; members: FamilyMember[]
  timingControl?: (task: Task) => ReactNode
  onContext: (task: Task, context: TaskContext | undefined) => void
  dragEnabled: boolean
}) {
  const t = vm.task
  const movable = dragEnabled && !t.completed
  const people = members.filter((m) => assigneesOf(t).includes(m.id))
  return (
    <WeekRow
      mark="task"
      title={t.title}
      completed={t.completed}
      onToggle={() => actions.done(t)}
      onOpen={() => actions.details(t)}
      drag={movable ? { id: `pool:${t.id}`, data: { kind: 'chip', taskId: t.id } } : null}
      people={people}
      tools={<>
        <ContextPicker size="sm" value={t.context ?? null} onChange={(c) => onContext(t, c)} />
        {members.length > 0 && <MultiAssigneeDropdown members={members} selectedIds={assigneesOf(t)} onSelect={(ids) => actions.assign(t, ids)} size="sm" triggerLabel={`Assign people to ${t.title}`} />}
        {timingControl && <span className="min-w-0">{timingControl(t)}</span>}
      </>}
      trailing={<LineMenu vm={vm} actions={actions} nextLabel="next week" />}
    />
  )
}
