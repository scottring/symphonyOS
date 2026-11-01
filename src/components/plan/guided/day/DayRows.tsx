// The Day session's rows (spec 2026-11-01), kept from the Plan today / Review
// today flow they replace (Today mockup approved 2026-10-19): a task with a
// few plain choices that save through the page's writers, stamped once saved,
// with Undo; and the day as it stands, timed things first.
//
// A row once decided stays in view, stamped, even after the page's lists
// have moved it on (put on the day, back to the week, done), so Undo is
// always beside the choice it undoes.

import { useState, type ReactNode } from 'react'
import type { Task } from '@/types/task'
import { Stamp } from '@/components/plan/v2/Stamp'
import type { DayDecision, DayDecisions } from './useDayDecisions'

export type { DayDecision } from './useDayDecisions'
export interface DayChoice { label: string; d: DayDecision; run: () => Promise<boolean>; go?: boolean }

export interface DayPictureItem { key: string; time?: string; title: string; kind: 'event' | 'task' | 'routine' }

export type { DayActions } from '@/lib/planning/dayActions'

function stampFor(d: DayDecision, targetWord: string, dayLabel: string): ReactNode {
  const cls = 'choose-stamp-mini'
  if (d === 'done') return <Stamp kind="done" context="Done" fresh className={cls} />
  if (d === 'target') return <Stamp kind="carried" word={targetWord} context={dayLabel} fresh className={cls} />
  return <Stamp kind="someday" word="This week" context={d === 'not' ? `Not ${targetWord.toLowerCase()}` : 'No day'} fresh className={cls} />
}

/** One task and its choices. `atTime` adds an optional time ("At a time"). */
export function DayTaskRow({ task, where, choices, undo, decisions, targetWord, dayLabel, atTime }: {
  task: Task
  /** "Was Sunday", "November goal" */
  where?: string
  choices: DayChoice[]
  /** The Undo of decision `d`; `before` is the task as it was when chosen. */
  undo: (d: DayDecision, before: Task) => () => Promise<boolean>
  decisions: DayDecisions
  /** "Today" / "Tomorrow": the day being planned, for its stamp. */
  targetWord: string
  /** "Monday" */
  dayLabel: string
  atTime?: (time: string) => Promise<boolean>
}) {
  const { decided, pending, failed, act } = decisions
  const [timing, setTiming] = useState(false)
  const [time, setTime] = useState('')
  const entry = decided.find((x) => x.task.id === task.id)
  const d = entry?.d
  const busy = pending !== null
  return <li className="choose-row" aria-label={task.title}>
    <div className="choose-row-main">
      <span className="choose-row-title">{task.title}</span>
      {where && <span className="choose-row-where">{where}</span>}
      {d && stampFor(d, targetWord, dayLabel)}
      <span className="choose-row-acts" role="group" aria-label={`Plan ${task.title}`}>
        {d
          ? <button type="button" className="choose-verb is-quiet" disabled={busy} aria-label={`Undo: ${task.title}`}
              onClick={() => { void act(task, null, undo(d, entry!.task)) }}>Undo</button>
          : <>
              {choices.map((c) => <button key={c.label} type="button" className={`choose-verb${c.go ? '' : ' is-quiet'}`} disabled={busy}
                aria-label={`${c.label}: ${task.title}`} onClick={() => { void act(task, c.d, c.run) }}>{c.label}</button>)}
              {atTime && <button type="button" className="choose-verb is-quiet" disabled={busy} aria-expanded={timing}
                aria-label={`At a time: ${task.title}`} onClick={() => setTiming((x) => !x)}>At a time</button>}
            </>}
      </span>
    </div>
    {atTime && timing && !d && <div className="gd-time">
      <input type="time" className="gd-time-input" aria-label={`Time for ${task.title}`} value={time} onChange={(e) => setTime(e.target.value)} />
      <button type="button" className="choose-verb" disabled={busy || !time} aria-label={`Place ${task.title} at that time`}
        onClick={() => { void act(task, 'target', () => atTime(time)).then((ok) => { if (ok) setTiming(false) }) }}>Place</button>
    </div>}
    {pending === task.id && <p className="choose-status" role="status">Saving…</p>}
    {failed === task.id && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
  </li>
}

/** The day as it stands: timed things in order, then what has no time. */
export function DayPicture({ dayLabel, items }: { dayLabel: string; items: readonly DayPictureItem[] }) {
  const timed = items.filter((i) => i.time)
  const untimed = items.filter((i) => !i.time)
  return <div className="gd-day" role="group" aria-label={`${dayLabel}, as it stands`}>
    <p className="choose-fact">{dayLabel} · {items.length} on it</p>
    {items.length === 0 && <p className="choose-empty">Nothing on it yet.</p>}
    {timed.map((i) => <div key={i.key} className="choose-daypic-slot"><span className="choose-daypic-time">{i.time}</span><span className={`choose-daypic-ev is-${i.kind}`}>{i.title}</span></div>)}
    {untimed.length > 0 && <div className="choose-daypic-untimed">
      <p className="choose-steps-h">No set time</p>
      {untimed.map((i) => <div key={i.key} className="choose-daypic-task">{i.title}</div>)}
    </div>}
  </div>
}
