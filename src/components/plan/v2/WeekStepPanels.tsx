// The step panels of planning a week (Scott, 2026-10-03: "we can't just have
// one enormous list … it should be presented stepwise, in an organized
// way"). Each panel holds ONE kind of thing and asks ONE question; the week
// fills up beside it (WeekStrip). The panels only draw and report: WeekV2
// owns the data and the writes.
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Task } from '@/types/task'
import type { WaitingRow } from '@/lib/today/waiting'
import { checkBackLabel } from '@/lib/today/waiting'
import type { InboxRow } from '@/lib/discussions/inbox'
import type { Landmark } from '@/lib/planning/v2/planV2'
import type { RoutineGroups, RoutineRow } from '@/lib/week/routineGroups'

const short = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const dayName = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' }) }

function StepHead({ title, ask }: { title: string; ask: string }) {
  return <><h2 className="wk-step-title">{title}</h2><p className="wk-step-ask">{ask}</p></>
}

// ── Inbox ──────────────────────────────────────────────────────────────────
export function InboxStep({ tasks, onThisWeek, onSomeday, onDone, onOpen, onDelete }: {
  tasks: Task[]
  onThisWeek: (t: Task) => void
  onSomeday: (t: Task) => void
  onDone: (t: Task) => void
  onOpen: (t: Task) => void
  /** Throw it away (Scott, 2026-10-04); the host offers Undo. */
  onDelete?: (t: Task) => void
}) {
  return (
    <section aria-label="Inbox">
      <StepHead title="Inbox" ask="Unsorted captures. Bring each into this week, keep it for someday, or tick it off." />
      {tasks.length ? tasks.map((t) => (
        <div key={t.id} className="wk-item">
          <div><button type="button" className="wk-item-title" onClick={() => onOpen(t)}>{t.title}</button><small>Captured {short(t.createdAt)}</small></div>
          <div className="wk-acts">
            <button type="button" className="wk-act" aria-label={`This week: ${t.title}`} onClick={() => onThisWeek(t)}>This week</button>
            <button type="button" className="wk-act" aria-label={`Someday: ${t.title}`} onClick={() => onSomeday(t)}>Someday</button>
            <button type="button" className="wk-act" aria-label={`Done: ${t.title}`} onClick={() => onDone(t)}>Done</button>
            {onDelete && <button type="button" className="wk-act wk-act-icon" aria-label={`Delete ${t.title}`} title="Delete" onClick={() => onDelete(t)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>}
          </div>
        </div>
      )) : <p className="wk-none">Your Inbox is empty.</p>}
    </section>
  )
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

