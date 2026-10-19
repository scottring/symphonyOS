// Planning and reviewing a day (Today mockup approved 2026-10-19). Morning:
// "This week → today" — what wasn't done, then this week's things with no
// day, grouped by the goal they serve, each Today / Not today / Done, with the
// day itself beside the list so the choice is made against its room. From
// 4 pm: "Today → tomorrow" — what today held and didn't finish, each Tomorrow /
// Back to this week / Done, what got done in one line, and one optional line
// for a win, kept as the day's review. A choice made here is stamped, with
// Undo; nothing found on arrival is.

import { useState, type ReactNode } from 'react'
import type { Task } from '@/types/task'
import type { TodayChoice, TodayReview } from '@/lib/planning/chooseToday'
import { Stamp } from '@/components/plan/v2/Stamp'

export interface DayPictureItem { key: string; time?: string; title: string; kind: 'event' | 'task' | 'routine' }

export interface TodayActions {
  today: (t: Task) => Promise<boolean>
  undoToday: (t: Task) => Promise<boolean>
  done: (t: Task) => Promise<boolean>
  undone: (t: Task) => Promise<boolean>
  tomorrow: (t: Task) => Promise<boolean>
  backToWeek: (t: Task) => Promise<boolean>
}

type Decision = 'today' | 'not' | 'done' | 'tomorrow' | 'week'

export function TodayFlow({ mode, choice, review, dayItems, actions, goalLabel, onFinish, onLeave, dayLabel }: {
  mode: 'plan' | 'review'
  choice: TodayChoice
  review: TodayReview
  dayItems: DayPictureItem[]
  actions: TodayActions
  /** "October goal" for a task that serves one, for the review rows. */
  goalLabel: (t: Task) => string | undefined
  /** Done / Done for today. `win` is the review's one line (empty is fine). */
  onFinish: (win: string) => Promise<boolean>
  onLeave: () => void
  /** "Monday" */
  dayLabel: string
}) {
  const [decided, setDecided] = useState<Record<string, Decision>>({})
  const [picked, setPicked] = useState<Task[]>([])
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [win, setWin] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [finishFailed, setFinishFailed] = useState(false)

  const act = async (t: Task, d: Decision | null, run: () => Promise<boolean>) => {
    setPending(t.id); setFailed(null)
    const ok = await run()
    setPending(null)
    if (!ok) { setFailed(t.id); return }
    setDecided((x) => { const n = { ...x }; if (d) n[t.id] = d; else delete n[t.id]; return n })
    if (d === 'today') setPicked((xs) => [...xs.filter((p) => p.id !== t.id), t])
    if (d === null) setPicked((xs) => xs.filter((p) => p.id !== t.id))
  }
  const undoOf = (t: Task, d: Decision): (() => Promise<boolean>) =>
    d === 'today' ? () => actions.undoToday(t)
      : d === 'done' ? () => actions.undone(t)
        : d === 'not' ? async () => true
          // Tomorrow and Back to this week are undone by putting it back on today.
          : () => actions.today(t)

  const stamp = (d: Decision): ReactNode => {
    const cls = 'choose-stamp-mini'
    if (d === 'done') return <Stamp kind="done" context="Done" fresh className={cls} />
    if (d === 'today') return <Stamp kind="carried" word="Today" context={dayLabel} fresh className={cls} />
    if (d === 'tomorrow') return <Stamp kind="carried" word="Tomorrow" context="Next day" fresh className={cls} />
    return <Stamp kind="someday" word="This week" context={d === 'not' ? 'Not today' : 'No day'} fresh className={cls} />
  }

  const row = (t: Task, where: string | undefined, choices: { label: string; d: Decision; run: () => Promise<boolean>; go?: boolean }[]) => {
    const d = decided[t.id]
    return <li key={t.id} className="choose-row">
      <div className="choose-row-main">
        <span className="choose-row-title">{t.title}</span>
        {where && <span className="choose-row-where">{where}</span>}
        {d && stamp(d)}
        <span className="choose-row-acts" role="group" aria-label={`Plan ${t.title}`}>
          {d
            ? <button type="button" className="choose-verb is-quiet" disabled={pending !== null} aria-label={`Undo: ${t.title}`}
                onClick={() => { void act(t, null, undoOf(t, d)) }}>Undo</button>
            : choices.map((c) => <button key={c.label} type="button" className={`choose-verb${c.go ? '' : ' is-quiet'}`} disabled={pending !== null}
                aria-label={`${c.label}: ${t.title}`} onClick={() => { void act(t, c.d, c.run) }}>{c.label}</button>)}
        </span>
      </div>
      {pending === t.id && <p className="choose-status" role="status">Saving…</p>}
      {failed === t.id && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
    </li>
  }
  const planChoices = (t: Task) => [
    { label: 'Today', d: 'today' as const, run: () => actions.today(t), go: true },
    { label: 'Not today', d: 'not' as const, run: async () => true },
    { label: 'Done', d: 'done' as const, run: () => actions.done(t) },
  ]
  const reviewChoices = (t: Task) => [
    { label: 'Tomorrow', d: 'tomorrow' as const, run: () => actions.tomorrow(t), go: true },
    { label: 'Back to this week', d: 'week' as const, run: () => actions.backToWeek(t) },
    { label: 'Done', d: 'done' as const, run: () => actions.done(t) },
  ]

  const finish = async () => {
    setFinishing(true); setFinishFailed(false)
    const ok = await onFinish(win.trim())
    setFinishing(false)
    if (!ok) setFinishFailed(true)
  }

  if (mode === 'review') {
    return <div className="choose choose-today-review">
      <div className="choose-top">
        <span className="deck-kicker">Today → tomorrow</span>
        <span className="choose-top-right"><button type="button" className="choose-leave" onClick={onLeave}>Leave</button></span>
      </div>
      <p className="choose-count">{dayLabel} · {review.done.length} of {review.open.length + review.done.length} done</p>
      <div className="deck-stack choose-stack">
        <div className="deck-ghost is-far" /><div className="deck-ghost" />
        <article className="deck-card choose-card" aria-label="Today → tomorrow">
          <h3 className="choose-card-title">{review.open.length ? 'Not done today' : 'Everything on today is done'}</h3>
          {review.open.length > 0 && <ul className="choose-rows">{review.open.map((t) => row(t, goalLabel(t), reviewChoices(t)))}</ul>}
          {review.done.length > 0 && <p className="choose-settled-line is-static"><span><b>Done today:</b> {review.done.map((t) => t.title).join(' · ')}</span></p>}
          <label className="choose-place-label" htmlFor="today-win">A win today</label>
          <textarea id="today-win" className="choose-textarea" rows={2} value={win} onChange={(e) => setWin(e.target.value)} placeholder="One line, if there is one" />
          {finishFailed && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
        </article>
      </div>
      <div className="choose-pager"><span />
        <button type="button" className="deck-btn is-primary" disabled={finishing} onClick={() => { void finish() }}>{finishing ? 'Saving…' : 'Done for today'}</button>
      </div>
    </div>
  }

  const shown = new Set(dayItems.map((i) => i.key))
  const untimed = [...dayItems.filter((i) => !i.time), ...picked.filter((t) => !shown.has(`task-${t.id}`)).map((t) => ({ key: `task-${t.id}`, title: t.title, kind: 'task' as const, isNew: true }))]
  const timed = dayItems.filter((i) => i.time)
  const nothing = choice.missed.length === 0 && choice.groups.length === 0

  return <div className="choose choose-today">
    <div className="choose-top">
      <span className="deck-kicker">This week → today</span>
      <span className="choose-top-right"><button type="button" className="choose-leave" onClick={onLeave}>Leave</button></span>
    </div>
    <p className="choose-count">Pick what you’ll do today. The day beside it fills in as you go.</p>
    <div className="choose-today-grid">
      <article className="deck-card choose-card" aria-label="This week → today">
        {nothing && <p className="choose-empty">Nothing on this week is waiting for a day.</p>}
        {choice.missed.length > 0 && <section aria-label="Not done yet">
          <h4 className="choose-steps-h">Not done yet</h4>
          <ul className="choose-rows">{choice.missed.map((m) => row(m.task, m.label, planChoices(m.task)))}</ul>
        </section>}
        {choice.groups.length > 0 && <section aria-label="This week, no day yet">
          <h4 className="choose-steps-h choose-today-h">This week, no day yet</h4>
          {choice.groups.map((g) => <div key={g.title} className="choose-today-group">
            <p className="choose-today-goal">{g.title}</p>
            <ul className="choose-rows">{g.tasks.map((t) => row(t, undefined, planChoices(t)))}</ul>
          </div>)}
        </section>}
        {choice.otherDays.length > 0 && <p className="choose-settled-line is-static"><span><b>{choice.otherDays.length} {choice.otherDays.length === 1 ? 'has' : 'have'} another day:</b> {choice.otherDays.map((o) => `${o.task.title} (${o.day})`).join(' · ')}</span></p>}
      </article>
      <aside className="deck-card choose-card choose-daypic" aria-label={`${dayLabel}, as it stands`}>
        <h4 className="choose-daypic-h">Today</h4>
        <p className="choose-fact">{dayLabel} · {timed.length + untimed.length} on it</p>
        {timed.map((i) => <div key={i.key} className="choose-daypic-slot"><span className="choose-daypic-time">{i.time}</span><span className={`choose-daypic-ev is-${i.kind}`}>{i.title}</span></div>)}
        {untimed.length > 0 && <div className="choose-daypic-untimed">
          <p className="choose-steps-h">For today</p>
          {untimed.map((i) => <div key={i.key} className={`choose-daypic-task${'isNew' in i && i.isNew ? ' is-new' : ''}`}>{i.title}</div>)}
        </div>}
      </aside>
    </div>
    <div className="choose-pager"><span />
      <button type="button" className="deck-btn is-primary" disabled={finishing} onClick={() => { void finish() }}>{finishing ? 'Saving…' : 'Done'}</button>
    </div>
  </div>
}
