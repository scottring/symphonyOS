// src/components/plan/v2/WeekListV2.tsx
//
// "This week's list", v2 — the week's undated work with its triage on each
// line (Scott, 2026-09-28: "we need a way to triage items on this week's list,
// such as context / assignee(s)"). The month beside it is the reference, so
// the list no longer repeats the month's goals.
//
// Each line: done · the words (open the Details pane); beneath, its controls: life area, people, when (the week's own timing
// control), and ⋯ for next week / Someday / Drop / All details.

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Task, TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { ContextPicker } from '@/components/triage/ContextPicker'
import { MultiAssigneeDropdown } from '@/components/family'
import { assigneesOf } from '@/lib/planning/v2/planV2'
import { localYmd } from '@/lib/cadence/config'
import { isMissedPlacement } from '@/lib/week/missedPlacement'
import { LineMenu, type LineActions, type LineVM } from './PlanLine'
import { WeekRow } from './WeekRow'
import { MonthLink } from './MonthLink'
import { useSafeAdd } from './useSafeAdd'
import { anOrA } from '@/lib/week/monthLinks'

export function WeekListV2({ title, lines, weekStart, members, actions, timingControl, onContext, onAdd, dragEnabled = true, headerAction, addPicker, emptyHint, focusAdd = false, hint, forLine, forOptions, onForLine, forId: forIdProp, onForId, inputRef, footer }: {
  title: string
  lines: LineVM[]
  weekStart: Date
  members: FamilyMember[]
  actions: LineActions
  /** The week's own "when" control (TaskTimingMenu), as WeekViewV2 builds it. */
  timingControl?: (task: Task) => ReactNode
  onContext: (task: Task, context: TaskContext | undefined) => void
  /** `forId`: the month line it is written for, when one was chosen.
   *  Resolves true once stored; on false the words stay in the box. */
  onAdd: (title: string, forId?: string) => Promise<boolean | void>
  /** The month line a row was written for (Scott, 2026-10-04). */
  forLine?: (task: Task) => { id: string; title: string; month: string } | null
  /** The month's open lines, offered (optionally) when adding. */
  forOptions?: { month: string; lines: { id: string; title: string }[] }
  /** Set, change or remove a row's month line after it was written. */
  onForLine?: (task: Task, lineId: string | null) => void
  /** The month line new actions are for, held by the page so the month's
   *  "Add a weekly action" can choose it (rapid entry, 2026-10-08). */
  forId?: string
  onForId?: (id: string) => void
  /** The add box, so the page can put the cursor in it. */
  inputRef?: RefObject<HTMLInputElement | null>
  /** Under the add row: what happens to unfinished work, the next step. */
  footer?: ReactNode
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
  // The page may hold the chosen month line; without it, this list does.
  const [ownForId, setOwnForId] = useState('')
  const forId = forIdProp ?? ownForId
  const setForId = onForId ?? setOwnForId
  const ownRef = useRef<HTMLInputElement>(null)
  const addRef = inputRef ?? ownRef
  const forDescId = useId()
  const chosen = forOptions?.lines.find((l) => l.id === forId) ?? null
  // One write at a time; on success only the words sent clear and the month
  // line stays chosen for the next one; on failure the words stay (useSafeAdd).
  const box = useSafeAdd((v) => (chosen ? onAdd(v, chosen.id) : onAdd(v)), addRef, localYmd(weekStart))
  const { draft, saving, failed, submit } = box
  useEffect(() => { if (focusAdd) addRef.current?.focus() }, [focusAdd, addRef])
  const [showDone, setShowDone] = useState(false)
  const first = localYmd(weekStart)
  const last = localYmd(new Date(weekStart.getTime() + 6 * 86_400_000))
  const inWeek = (t: Task) => !!t.scheduledFor && localYmd(t.scheduledFor) >= first && localYmd(t.scheduledFor) <= last
  const open = lines.filter((l) => !l.task.completed)
  const done = lines.filter((l) => l.task.completed)
  // Its day came and went undone: back on the list, asking for another day.
  const now = new Date()
  const missed = open.filter((l) => isMissedPlacement(l.task.scheduledFor, false, now))
  // A line with a day this week is on that day, beside the list; the list
  // holds only what is still waiting for one (Scott, 2026-10-03: "it's
  // duplicated").
  const allPlaced = open.length > 0 && open.every((l) => inWeek(l.task)) && !missed.length
  const missedIds = new Set(missed.map((l) => l.task.id))
  const groups = [
    { title: 'Its day passed', rows: missed },
    { title: 'Any day', rows: open.filter((l) => !l.task.scheduledFor) },
    { title: 'Scheduled outside this week', rows: open.filter((l) => l.task.scheduledFor && !inWeek(l.task) && !missedIds.has(l.task.id)) },
    { title: 'Completed', rows: showDone ? done : [] },
  ].filter((g) => g.rows.length)

  // The list takes things back: a day's task dropped here loses its day and
  // stays this week (useWeekDragDrop, kind 'weekList').
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: 'week-list', data: { kind: 'weekList' }, disabled: !dragEnabled })
  const row = (vm: LineVM) => <WeekCard key={vm.task.id} vm={vm} actions={actions} members={members} timingControl={timingControl}
    onContext={onContext} dragEnabled={dragEnabled} forLine={forLine?.(vm.task) ?? null}
    forControl={onForLine && forOptions ? (cur) => <MonthLink title={vm.task.title} current={cur} options={forOptions} onChange={(id) => onForLine(vm.task, id)} /> : undefined}
    passed={missedIds.has(vm.task.id) ? vm.task.scheduledFor!.toLocaleDateString('en-US', { weekday: 'long' }) : null} />
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
      <form className="pv2-write" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <span className="pv2-wl-check" aria-hidden="true" />
        <input ref={addRef} value={draft} onChange={(e) => box.setDraft(e.target.value)}
          placeholder={chosen ? `A weekly action for “${chosen.title}”` : 'Add something for this week'} aria-label="Add to this week"
          aria-describedby={forOptions && forOptions.lines.length > 0 ? forDescId : undefined} aria-busy={saving || undefined} />
        {addPicker}
      </form>
      {saving && <p className="wk-addsaving" role="status">Saving…</p>}
      {failed && <p className="wk-addfail" role="alert">That didn’t save — your words are still in the box. Press Enter to try again.</p>}
      {forOptions && forOptions.lines.length > 0 && (
        // Optional: which month line new actions are for. Nothing asks you to
        // choose; once chosen it stays for the next one until changed.
        <div className={`wk-forpick${chosen ? ' is-set' : ''}`} role="group" aria-label={`Which ${forOptions.month} line new actions are for`}>
          <span id={forDescId} aria-live="polite" className="wk-foractive">
            {chosen ? <>Adding for {forOptions.month}: <b>{chosen.title}</b></> : <>Not tied to {anOrA(forOptions.month)} {forOptions.month} line</>}
          </span>
          <select aria-label={`For ${anOrA(forOptions.month)} ${forOptions.month} line`} value={chosen?.id ?? ''} onChange={(e) => setForId(e.target.value)}>
            <option value="">No {forOptions.month} line</option>
            {forOptions.lines.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
          {chosen && <button type="button" className="pv2-link pv2-quiet" onClick={() => { setForId(''); addRef.current?.focus() }}>Clear</button>}
        </div>
      )}
      {footer}
    </section>
  )
}

// A row drags onto a day with the week's own chip protocol ('pool:<id>',
// {kind:'chip'} → useWeekDragDrop: an all-day date on that day, past days
// refused, Undo offered). The same row every column draws (WeekRow,
// 2026-10-03) — no white card; the grip says it moves.
export function WeekCard({ vm, actions, members, timingControl, onContext, dragEnabled, forLine, forControl, passed, note }: {
  /** A line under the title saying what the row is (Open journal: "This October line itself is on the week"). */
  note?: string
  forLine: { id: string; title: string; month: string } | null
  /** The month line as a control (change / remove / link). */
  forControl?: (current: { id: string; title: string; month: string } | null) => ReactNode
  /** The weekday its day was, when it passed undone. */
  passed: string | null
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
      meta={forLine || passed || note || (forControl && !t.completed) ? <>
        {note && <span className="wk-itself">{note}</span>}
        {passed && <span className="wk-passed">{passed} passed — give it another day?</span>}
        {forControl && !t.completed ? forControl(forLine)
          : forLine && <span className="wk-for"><span aria-hidden="true">↳ </span>for {forLine.month}: {forLine.title}</span>}
      </> : undefined}
      tools={<>
        <ContextPicker size="sm" value={t.context ?? null} onChange={(c) => onContext(t, c)} />
        {members.length > 0 && <MultiAssigneeDropdown members={members} selectedIds={assigneesOf(t)} onSelect={(ids) => actions.assign(t, ids)} size="sm" triggerLabel={`Assign people to ${t.title}`} />}
        {timingControl && <span className="min-w-0">{timingControl(t)}</span>}
      </>}
      trailing={<LineMenu vm={vm} actions={actions} nextLabel="next week" />}
    />
  )
}
