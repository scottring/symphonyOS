// The sources beside the week's list while it is planned (Scott, 2026-10-12,
// in this order): the Inbox, last week's list, the month's goals. Each one is
// the Month board's source column (canvas-plan.css): compact containers, one
// per capture, last-week task or month goal, each with the one action that
// adds to the week's list beside it. The panels only draw and report: WeekV2
// owns the data and the writes.
//
// The optional reference that used to be steps of its own — Between us, Look
// ahead, Routines — is drawn here too, folded inside a step (WeekStepScreen).
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import type { Task } from '@/types/task'
import type { LineVM } from './PlanLine'
import type { CloseDecision } from './FocusDeck'
import type { WaitingRow } from '@/lib/today/waiting'
import { checkBackLabel } from '@/lib/today/waiting'
import type { InboxRow } from '@/lib/discussions/inbox'
import type { Landmark } from '@/lib/planning/v2/planV2'
import type { RoutineGroups, RoutineRow } from '@/lib/week/routineGroups'

const short = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const dayName = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' }) }

function StepHead({ title, ask }: { title: string; ask: string }) {
  return <><h3 className="wk-step-title">{title}</h3><p className="wk-step-ask">{ask}</p></>
}

// ── Between us ─────────────────────────────────────────────────────────────
export function BetweenStep({ waiting, threads, onOpenTask, onOpenThread }: {
  waiting: WaitingRow[]
  threads: InboxRow[]
  onOpenTask: (id: string) => void
  onOpenThread: (row: InboxRow) => void
}) {
  return (
    <div>
      <StepHead title="Between us" ask="What you’re each waiting on, and what to talk through before the week starts." />
      <section className="wk-group" aria-label="Waiting on">
        <div className="wk-group-head"><span className="wk-group-title">Waiting on</span><span className="wk-group-meta">check back this week</span></div>
        {waiting.length ? waiting.map(({ task, checkBack, due }) => (
          <div key={task.id} className="wk-item">
            <div><button type="button" className="wk-item-title" onClick={() => onOpenTask(task.id)}>{task.title}</button>
              <small>{task.waitingFor ? `From ${task.waitingFor}` : 'Waiting'}{checkBack ? ` · ${due ? 'check back now' : `check back ${checkBackLabel(checkBack)}`}` : ''}</small></div>
            <button type="button" className="wk-act-link" onClick={() => onOpenTask(task.id)}>Open</button>
          </div>
        )) : <p className="wk-none">Nothing you’re waiting on.</p>}
      </section>
      <section className="wk-group" aria-label="To discuss">
        <div className="wk-group-head"><span className="wk-group-title">To discuss</span><span className="wk-group-meta">open threads</span></div>
        {threads.length ? threads.map((row) => (
          <div key={row.sessionId} className="wk-item">
            <div><button type="button" className="wk-item-title" onClick={() => onOpenThread(row)}>{row.title}</button>
              <small>{row.unread ? 'New · ' : ''}{row.lastAuthor}: {row.lastText}</small></div>
            <button type="button" className="wk-act-link" onClick={() => onOpenThread(row)}>Open</button>
          </div>
        )) : <p className="wk-none">No threads waiting on you.</p>}
      </section>
    </div>
  )
}

// ── Look ahead ─────────────────────────────────────────────────────────────
export function AheadStep({ from, landmarks, dated, onOpen, onStart }: {
  from: Date; landmarks: Landmark[]; dated: Task[]
  /** A dated task opens in its details. */
  onOpen?: (t: Task) => void
  /** "Start this week": on this week's list, its date kept. */
  onStart?: (t: Task) => void
}) {
  const rows: { key: string; at: Date; title: string; what: string; task?: Task }[] = [
    ...landmarks.map((l) => ({ key: `l-${l.id}`, at: l.start, title: l.title, what: l.end.getTime() !== l.start.getTime() ? `through ${short(l.end)}` : 'all day' })),
    ...dated.map((t) => ({ key: `t-${t.id}`, at: t.scheduledFor!, title: t.title, what: 'due', task: t })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime())
  return (
    <section aria-label="Look ahead">
      <StepHead title="Look ahead" ask={`The next three weeks from ${short(from)}: dates that can’t move and work that’s due. Anything that needs a start this week?`} />
      {rows.length ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {rows.map((r) => (
            <li key={r.key} className="wk-item">
              <div>{r.task && onOpen ? <button type="button" className="wk-item-title" onClick={() => onOpen(r.task!)}>{r.title}</button> : r.title}<small>{short(r.at)} · {r.what}</small></div>
              {r.task && onStart ? <div className="wk-acts"><button type="button" className="wk-act" aria-label={`Start ${r.title} this week`} onClick={() => onStart(r.task!)}>Start this week</button></div> : <span />}
            </li>
          ))}
        </ul>
      ) : <p className="wk-none">Nothing fixed in the next three weeks.</p>}
    </section>
  )
}

// ── Routines ───────────────────────────────────────────────────────────────
/** A routine's days the short way: "Sat", "Tue, Thu", "Weekdays", "Every day". */
export function dayList(keys: string[], weekKeys: string[]): string {
  if (keys.length === weekKeys.length && weekKeys.length >= 7) return 'Every day'
  const names = keys.map(dayName)
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  if (names.length === 5 && weekdays.every((d) => names.includes(d))) return 'Weekdays'
  return names.join(', ')
}

function clock(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'a' : 'p'}`
}

function Group({ title, meta, ask, children, empty }: { title: string; meta: string; ask: string; children: React.ReactNode; empty: boolean }) {
  return (
    <section className="wk-group" aria-label={title}>
      <div className="wk-group-head"><span className="wk-group-title">{title}</span><span className="wk-group-meta">{meta}</span></div>
      {!empty && <p className="wk-group-ask">{ask}</p>}
      {empty ? <p className="wk-none">Nothing here this week.</p> : children}
    </section>
  )
}

export function RoutinesStep({ groups, weekKeys, weekendKeys, onSkip, onUnskip, onPlanDay, onOpen }: {
  groups: RoutineGroups
  /** This week's day keys, in order. */
  weekKeys: string[]
  /** The weekend's Saturday and Sunday keys in this week (Sunday may be absent). */
  weekendKeys: string[]
  onSkip: (row: RoutineRow) => void
  onUnskip: (row: RoutineRow) => void
  /** Give the routine this day this week; null takes the day back. */
  onPlanDay: (row: RoutineRow, key: string | null) => void
  onOpen: (routineId: string) => void
}) {
  const [allTimed, setAllTimed] = useState(false)
  const [timedOk, setTimedOk] = useState(false)
  const name = (row: RoutineRow) => <button type="button" className="wk-item-title" onClick={() => onOpen(row.routine.id)}>{row.routine.name}</button>
  const skippable = (row: RoutineRow) => {
    const skipped = row.dayKeys.length > 0 && row.dayKeys.every((k) => row.skippedKeys.includes(k))
    return skipped
      ? <button type="button" className="wk-act-link" onClick={() => onUnskip(row)} aria-label={`Bring back ${row.routine.name} this week`}>Skipped · undo</button>
      : <button type="button" className="wk-act-link" onClick={() => onSkip(row)} aria-label={`Skip ${row.routine.name} this week`}>Skip this week</button>
  }
  const skippedCls = (row: RoutineRow) => (row.dayKeys.length > 0 && row.dayKeys.every((k) => row.skippedKeys.includes(k)) ? 'wk-item wk-is-skipped' : 'wk-item')
  const timed = allTimed ? groups.timed : groups.timed.slice(0, 5)
  return (
    <div>
      <StepHead title="Routines this week" ask="One kind at a time. Each group asks only what it needs from you." />

      <Group title="At a set time" meta="already on their days" ask="These keep their time. Nothing to decide unless one is wrong this week." empty={!groups.timed.length}>
        {timedOk ? <p className="wk-none">Confirmed.</p> : <>
          {timed.map((row) => (
            <div key={row.routine.id} className={skippedCls(row)}>
              <div>{name(row)}<small>{dayList(row.dayKeys, weekKeys)} · {clock(row.routine.time_of_day)}</small></div>
              {skippable(row)}
            </div>
          ))}
          {groups.timed.length > 5 && !allTimed && <button type="button" className="wk-act-link" onClick={() => setAllTimed(true)}>Show {groups.timed.length - 5} more</button>}
          <div style={{ marginTop: 8 }}><button type="button" className="wk-act" onClick={() => setTimedOk(true)}>Looks right</button></div>
        </>}
      </Group>

      <Group title="On a set day" meta="any time that day" ask="Their day is fixed. Skip any that aren’t happening this week." empty={!groups.setDay.length}>
        {groups.setDay.map((row) => (
          <div key={row.routine.id} className={skippedCls(row)}>
            <div>{name(row)}<small>{dayList(row.dayKeys, weekKeys)}</small></div>
            {skippable(row)}
          </div>
        ))}
      </Group>

      <Group title="Sometime this weekend" meta="once, either day" ask="Give each a day, or leave it for whichever day suits." empty={!groups.weekend.length}>
        {groups.weekend.map((row) => (
          <div key={row.routine.id} className="wk-item">
            <div>{name(row)}{row.routine.time_of_day && <small>{clock(row.routine.time_of_day)}</small>}</div>
            <span className="wk-seg" role="group" aria-label={`Which day for ${row.routine.name}`}>
              {weekendKeys.map((k) => (
                <button key={k} type="button" className={row.plannedKey === k ? 'is-on' : ''} aria-pressed={row.plannedKey === k} onClick={() => onPlanDay(row, k)}>{dayName(k)}</button>
              ))}
              <button type="button" className={row.plannedKey ? '' : 'is-on'} aria-pressed={!row.plannedKey} onClick={() => onPlanDay(row, null)}>Sometime</button>
            </span>
          </div>
        ))}
      </Group>

      <Group title="Any day this week" meta="weekly, no set day" ask="Give each one a day." empty={!groups.anyDay.length}>
        {groups.anyDay.map((row) => (
          <div key={row.routine.id} className="wk-item">
            <div>{name(row)}</div>
            <span className="wk-seg" role="group" aria-label={`Which day for ${row.routine.name}`}>
              {weekKeys.map((k) => (
                <button key={k} type="button" className={row.plannedKey === k ? 'is-on' : ''} aria-pressed={row.plannedKey === k} onClick={() => onPlanDay(row, row.plannedKey === k ? null : k)}>{dayName(k)}</button>
              ))}
            </span>
          </div>
        ))}
      </Group>

      <Group title="Every day" meta="daily, no time" ask="These run every day. Skip one only if the whole week is off." empty={!groups.everyDay.length}>
        {groups.everyDay.map((row) => (
          <div key={row.routine.id} className={skippedCls(row)}><div>{name(row)}</div>{skippable(row)}</div>
        ))}
      </Group>

      <Group title="Less often" meta="monthly, seasonal, when due" ask="Due this week. Easy to miss, so here they are." empty={!groups.lessOften.length}>
        {groups.lessOften.map((row) => (
          <div key={row.routine.id} className={skippedCls(row)}>
            <div>{name(row)}<small>{row.dayKeys.length ? dayList(row.dayKeys, weekKeys) : 'This week'}</small></div>
            {skippable(row)}
          </div>
        ))}
      </Group>
    </div>
  )
}



// ── The sources (2026-10-12) ───────────────────────────────────────────────

/** A row's write in flight, or a write that did not save. */
export type RowState = 'pending' | 'failed' | undefined

const captured = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** The source column's heading: what it is and what to do with it. */
export function SourceHead({ id, title, ask, children }: { id: string; title: string; ask: string; children?: ReactNode }) {
  return <div className="plan-section-head"><h2 id={id}>{title}</h2><p>{ask}</p>{children}</div>
}

/** One line of words, written in place — Month's composer (InlineComposer),
 *  its words held by the page so a resumed session gets them back. */
export function DraftComposer({ label, value, onChange, onSave, onCancel, saveLabel = 'Add' }: {
  label: string
  value: string
  onChange: (text: string) => void
  /** Resolves true once stored; the words then clear for the next one. */
  onSave: (text: string) => Promise<boolean>
  onCancel: () => void
  saveLabel?: string
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const text = value.trim()
    if (!text || busy) return
    setBusy(true); setFailed(false)
    const ok = await onSave(text).catch(() => false)
    setBusy(false)
    if (ok) onChange(''); else setFailed(true)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault(); e.stopPropagation()
    if (!busy) onCancel()
  }
  return <form className={`plan-composer${failed ? ' is-failed' : ''}`} onSubmit={submit} onKeyDown={onKey}>
    <input aria-label={label} value={value} autoFocus disabled={busy} onChange={(e) => { setFailed(false); onChange(e.target.value) }} />
    <button type="submit" className="canvas-link" disabled={busy || !value.trim()}>{busy ? 'Saving…' : saveLabel}</button>
    <button type="button" className="canvas-link" disabled={busy} onClick={onCancel}>Cancel</button>
    {failed && <p className="plan-composer-error" role="alert">Didn’t save. Your wording is still here; try again.</p>}
  </form>
}

// ── 1 · Inbox ──────────────────────────────────────────────────────────────
export function InboxSource({ tasks, weekName, stateOf, onAdd, onSomeday, onDone, onDelete, onOpen, extra }: {
  /** Open captures, through the page's filters. */
  tasks: Task[]
  /** "this week", "week 43". */
  weekName: string
  stateOf: (id: string) => RowState
  onAdd: (t: Task) => void
  onSomeday: (t: Task) => void
  onDone: (t: Task) => void
  /** Throw it away (Scott, 2026-10-04); the host offers Undo. */
  onDelete?: (t: Task) => void
  onOpen: (t: Task) => void
  /** Optional reference folded under the captures (waiting on, threads). */
  extra?: ReactNode
}) {
  return <>
    <SourceHead id="wk-source-title" title="Inbox" ask={`Choose what needs to happen in ${weekName}. It joins the list; the rest can stay here.`} />
    {tasks.length ? <ul className="plan-groups plan-source-grid" aria-label="Inbox captures">
      {tasks.map((t) => {
        const state = stateOf(t.id)
        return <li key={t.id} className="plan-group-slot">
          <section className="canvas-group plan-group plan-source wk-source" aria-label={t.title}>
            <header className="canvas-group-head">
              <h3 className="canvas-group-title"><button type="button" className="plan-group-focus" onClick={() => onOpen(t)}>{t.title}</button></h3>
            </header>
            <p className="plan-source-count">Captured {captured(t.createdAt)}</p>
            {state === 'failed' && <p className="plan-composer-error" role="alert">Not added. It’s still in your Inbox — try again.</p>}
            <div className="wk-source-acts">
              <button type="button" className="canvas-link plan-add" disabled={state === 'pending'} aria-label={`Add ${t.title} to ${weekName}`}
                onClick={() => onAdd(t)}>{state === 'pending' ? 'Adding…' : `+ Add to ${weekName}`}</button>
              <button type="button" className="canvas-link wk-quiet" disabled={state === 'pending'} aria-label={`Someday: ${t.title}`} onClick={() => onSomeday(t)}>Someday</button>
              <button type="button" className="canvas-link wk-quiet" disabled={state === 'pending'} aria-label={`Done: ${t.title}`} onClick={() => onDone(t)}>Done</button>
              {onDelete && <button type="button" className="canvas-link wk-quiet wk-act-icon" disabled={state === 'pending'} aria-label={`Delete ${t.title}`} title="Delete" onClick={() => onDelete(t)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>}
            </div>
          </section>
        </li>
      })}
    </ul> : <p className="plan-empty">Your Inbox is empty. Nothing to choose from here.</p>}
    {extra}
  </>
}

// ── 2 · Last week ──────────────────────────────────────────────────────────
const VERDICT: Record<CloseDecision, string> = {
  carried: 'Brought forward', done: 'Marked done', someday: 'Kept for someday', dropped: 'Let go', left: 'Left where it was',
}

export interface LastWeekRow { vm: LineVM; decision?: CloseDecision; state: RowState }

export function LastWeekSource({ rows, earlier, done, prevName, weekName, onDecide, onOpen }: {
  /** Last week's open work, and anything decided this session. */
  rows: LastWeekRow[]
  /** Unfinished work from before last week, decided the same way. */
  earlier: LastWeekRow[]
  /** Done last week: its record, to look at. */
  done: Task[]
  prevName: string
  weekName: string
  onDecide: (vm: LineVM, d: CloseDecision) => void
  onOpen: (t: Task) => void
}) {
  const card = ({ vm, decision, state }: LastWeekRow) => {
    const t = vm.task
    const open = !decision || decision === 'left' || state === 'failed'
    return <li key={t.id} className="plan-group-slot">
      <section className={`canvas-group plan-group plan-source wk-source${decision && decision !== 'left' ? ' is-decided' : ''}`} aria-label={t.title}>
        <header className="canvas-group-head">
          <h3 className="canvas-group-title"><button type="button" className="plan-group-focus" onClick={() => onOpen(t)}>{t.title}</button></h3>
          {decision && state !== 'failed' && <span className="canvas-tag">{VERDICT[decision]}</span>}
        </header>
        <p className="plan-source-count">{vm.origin ? `Earlier: ${vm.origin}` : vm.where ?? `Any day ${prevName}`}</p>
        {decision === 'carried' && state !== 'failed' && <p className="plan-source-count">On {weekName}’s list now. {prevName[0].toUpperCase() + prevName.slice(1)}’s record keeps it.</p>}
        {state === 'failed' && <p className="plan-composer-error" role="alert">That didn’t save, so it isn’t decided. It’s still here — try again.</p>}
        {open && <div className="wk-source-acts">
          <button type="button" className="canvas-link plan-add" disabled={state === 'pending'} aria-label={`Bring ${t.title} into ${weekName}`}
            onClick={() => onDecide(vm, 'carried')}>{state === 'pending' ? 'Saving…' : `+ Bring into ${weekName}`}</button>
          <button type="button" className="canvas-link wk-quiet" disabled={state === 'pending'} aria-label={`It’s done: ${t.title}`} onClick={() => onDecide(vm, 'done')}>It’s done</button>
          <button type="button" className="canvas-link wk-quiet" disabled={state === 'pending'} aria-label={`Someday: ${t.title}`} onClick={() => onDecide(vm, 'someday')}>Someday</button>
          <button type="button" className="canvas-link wk-quiet" disabled={state === 'pending'} aria-label={`Let go of ${t.title}`} onClick={() => onDecide(vm, 'dropped')}>Let go</button>
          {decision !== 'left' && <button type="button" className="canvas-link wk-quiet" disabled={state === 'pending'} aria-label={`Leave ${t.title} where it is`} onClick={() => onDecide(vm, 'left')}>Leave it</button>}
        </div>}
      </section>
    </li>
  }
  return <>
    <SourceHead id="wk-source-title" title={prevName[0].toUpperCase() + prevName.slice(1)} ask={`Bring forward only what still matters. Nothing comes over by itself, and ${prevName}’s record keeps its history.`} />
    {rows.length ? <ul className="plan-groups plan-source-grid" aria-label={`Open on ${prevName}’s list`}>{rows.map(card)}</ul>
      : <p className="plan-empty">Nothing was left open {prevName === 'last week' ? 'last week' : `in ${prevName}`}.</p>}
    {earlier.length > 0 && <>
      <h3 className="wk-source-sub">Earlier, still open</h3>
      <ul className="plan-groups plan-source-grid" aria-label="Earlier, still open">{earlier.map(card)}</ul>
    </>}
    {done.length > 0 && <>
      <h3 className="wk-source-sub">Done {prevName}</h3>
      <ul className="plan-source-preview" aria-label={`Done ${prevName}`}>{done.map((t) => <li key={t.id} className="is-done">{t.title}</li>)}</ul>
    </>}
  </>
}

// ── 3 · Monthly goals ──────────────────────────────────────────────────────
export interface GoalSourceMonth {
  name: string
  start: Date
  /** Open goals, each with this week's tasks for it (the same records the list shows). */
  goals: { task: Task; children: Task[] }[]
  /** Goals of that month already done (named, not listed). */
  done: number
}

export function MonthGoalsSource({ months, weekName, selected, onSelect, linkedGoal, adding, onStartAdd, onCancelAdd, draftOf, onDraft, onAdd, onOpenMonth, loading }: {
  months: GoalSourceMonth[]
  weekName: string
  selected: string | null
  onSelect: (id: string | null) => void
  /** The goal a task was just written for: its card lights up with the task's label. */
  linkedGoal: string | null
  adding: string | null
  onStartAdd: (goalId: string) => void
  onCancelAdd: () => void
  draftOf: (goalId: string) => string
  onDraft: (goalId: string, text: string) => void
  onAdd: (goalId: string, text: string) => Promise<boolean>
  onOpenMonth: (start: Date) => void
  loading?: boolean
}) {
  const names = months.map((m) => m.name).join(' and ')
  return <>
    <SourceHead id="wk-source-title" title={`${names} goals`} ask={`For reference while you write ${weekName}’s tasks. Select one to see its tasks, or add one for it. The goals themselves stay as they are.`} />
    {months.map((m) => {
      const one = months.length === 1
      return <div key={m.name} className="wk-source-month">
        {!one && <h3 className="wk-source-sub">{m.name}</h3>}
        {m.goals.length ? <ul className="plan-groups plan-source-grid" aria-label={`${m.name} goals`}>
          {m.goals.map(({ task: g, children }) => {
            const isSel = selected === g.id
            const open = children.filter((c) => !c.completed).length
            return <li key={g.id} className="plan-group-slot">
              <section className={`canvas-group plan-group plan-source${isSel ? ' is-selected' : ''}${linkedGoal === g.id ? ' is-linked' : ''}`} aria-label={`${m.name} goal: ${g.title}`}>
                <header className="canvas-group-head">
                  <h3 className="canvas-group-title"><button type="button" className="plan-group-focus" aria-pressed={isSel}
                    onClick={() => onSelect(isSel ? null : g.id)}>{g.title}</button></h3>
                </header>
                <p className="plan-source-count">{children.length ? `${children.length} ${children.length === 1 ? 'task' : 'tasks'} ${weekName}${open < children.length ? `, ${children.length - open} done` : ''}` : `Nothing ${weekName} yet`}</p>
                {isSel && children.length > 0 && <ul className="plan-source-preview" aria-label={`${weekName} tasks for ${g.title}`}>
                  {children.map((c) => <li key={c.id} className={c.completed ? 'is-done' : undefined}>{c.title}</li>)}
                </ul>}
                {adding === g.id
                  ? <DraftComposer label={`New task ${weekName} for ${g.title}`} value={draftOf(g.id)} onChange={(v) => onDraft(g.id, v)}
                      onSave={(text) => onAdd(g.id, text)} onCancel={onCancelAdd} />
                  : <button type="button" className="canvas-link plan-add" aria-label={`Add a task ${weekName} for ${g.title}`}
                      onClick={() => { if (!isSel) onSelect(g.id); onStartAdd(g.id) }}>+ Add a task {weekName}</button>}
              </section>
            </li>
          })}
        </ul> : <p className="plan-empty">{loading ? 'Loading…' : `No open goals for ${m.name}. That’s fine — write ${weekName}’s tasks on their own.`}</p>}
        {m.done > 0 && <p className="plan-empty">{m.done} {m.name} {m.done === 1 ? 'goal is' : 'goals are'} done.</p>}
        <button type="button" className="canvas-link" onClick={() => onOpenMonth(m.start)}>Open {m.name} →</button>
      </div>
    })}
  </>
}

/** Optional reference inside a step, folded until asked for. The body mounts
 *  only while open, so what it reads is read only then. */
export function Fold({ title, children }: { title: string; children: () => ReactNode }) {
  const [open, setOpen] = useState(false)
  return <section className="wk-fold">
    <button type="button" className="canvas-link wk-fold-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? `Hide ${title.toLowerCase()}` : title}</button>
    {open && <div className="wk-fold-body">{children()}</div>}
  </section>
}
