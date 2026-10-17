// src/components/plan/review/PeriodPlan.tsx
//
// Planning by hand (Scott, 2026-10-17): the conversation's "Plan October"
// without the conversation, on Week, Month, Season and Year. The same few
// steps the talk takes, one page:
//
//   1. Left from {last period}: each line still open there — bring it in,
//      Someday, let it go (the review's verbs, aimed forward).
//   2. For {the level above}: each goal above, what is under it here already,
//      and a line to add one more.
//   3. Anything else: the period's list so far, and a line to add to it.
//   4. (Week) Give them a day: each task on the week with no day yet.
//
// and then "I'm happy with {period}" — the same mark as the page's own link
// (usePlanningSession's savedAt), which Home's checklist reads. Every verb and
// every add saves at once through the canvas activity, with its Undo; leaving
// halfway loses nothing.

import { useState } from 'react'
import { InlineComposer } from '@/components/canvas/plan/InlineComposer'
import type { ReviewLine, ReviewVerb } from './PeriodReview'

export interface PlanParent {
  key: string
  title: string
  /** What is under it in this period already, by name. */
  children: string[]
  onAdd: (title: string) => Promise<boolean>
}
export interface PlaceLine { key: string; title: string; note?: string; days: ReviewVerb[] }

export interface PeriodPlanProps {
  /** "October", "Fall", "2026", "this week". */
  periodWord: string
  /** "an October goal", "something for this week". */
  itemWord: string
  loading: boolean
  /** The period before: its word ("September") and its lines still open there. */
  carry: { fromWord: string; lines: ReviewLine[] }
  /** The level above ("Fall"), with each open goal of it. */
  parents?: { word: string; goals: PlanParent[] }
  /** This period's open lines, by name. */
  current: string[]
  onAdd: (title: string) => Promise<boolean>
  /** Week: its tasks with no day yet, each with the days it can take. */
  place?: PlaceLine[]
  /** Marked planned already: when, and by whom ("you"). */
  planned: { at: Date; by: string } | null
  onMark: () => Promise<boolean>
  /** Why it can't be marked just now (a draft open in Chat). */
  markBlocked?: string
  /** The onward step once planned ("Go to this week →"). */
  next?: { label: string; onClick: () => void }
  onClose: () => void
}

const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export function PeriodPlan(p: PeriodPlanProps) {
  // Lines from last period answered here, remembered to say what happened.
  const [decided, setDecided] = useState<{ key: string; title: string; label: string }[]>([])
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  // The one add line open: a parent's key, or 'loose'.
  const [adding, setAdding] = useState<string | null>(null)
  // A fresh, empty line after each add, ready for the next one.
  const [added, setAdded] = useState(0)
  const [marking, setMarking] = useState(false)
  const [markFailed, setMarkFailed] = useState(false)
  const [justMarked, setJustMarked] = useState(false)

  const word = p.periodWord
  const cap = `${word[0].toUpperCase()}${word.slice(1)}`
  const openCarry = p.carry.lines.filter((l) => l.state === 'open')
  const openKeys = new Set(openCarry.map((l) => l.key))
  // Undone back onto last period's list: no longer decided.
  const answered = decided.filter((d) => !openKeys.has(d.key))
  const place = p.place ?? []

  const decide = async (key: string, title: string, verb: ReviewVerb, log: boolean) => {
    setPending(key)
    setFailed(null)
    const ok = await verb.run()
    setPending(null)
    if (!ok) { setFailed(key); return }
    if (log) setDecided((xs) => [...xs.filter((x) => x.key !== key), { key, title, label: verb.label }])
  }
  const add = (key: string, save: (title: string) => Promise<boolean>) => async (title: string) => {
    const ok = await save(title)
    // The line stays open for the next one; Cancel closes it.
    if (ok) { setAdded((x) => x + 1); setAdding(key) }
    return ok
  }
  const mark = async () => {
    setMarking(true)
    setMarkFailed(false)
    const ok = await p.onMark()
    setMarking(false)
    if (ok) setJustMarked(true)
    else setMarkFailed(true)
  }

  const verbs = (key: string, title: string, list: ReviewVerb[], log: boolean) =>
    <div className="plan-review-verbs" role="group" aria-label={`Decide ${title}`}>
      {list.map((v) => <button key={v.label} type="button" className="plan-review-verb" disabled={pending !== null}
        aria-label={`${v.label}: ${title}`} onClick={() => { void decide(key, title, v, log) }}>{v.label}</button>)}
    </div>
  const status = (key: string) => <>
    {pending === key && <p className="plan-review-line-status" role="status">Saving…</p>}
    {failed === key && <p className="plan-review-line-status is-failed" role="alert">Didn’t save. Try again.</p>}
  </>

  let n = 0
  const stepTitle = (text: string) => <h3 className="plan-review-step-title">{++n}. {text}</h3>

  return <section className="plan-review plan-by-hand" aria-label={`Plan ${word}`}>
    <header className="plan-review-head">
      <div className="plan-review-title-row">
        <h2 className="plan-review-title">Plan {word}</h2>
        <button type="button" className="canvas-link plan-review-close" onClick={p.onClose}>Close planning</button>
      </div>
      {p.planned && !justMarked && <p className="plan-review-was">
        <span className="pv2-seal" aria-hidden="true" /> {cap} was planned {day(p.planned.at)} by {p.planned.by}. You can still change it.
      </p>}
      <p className="plan-review-hint">Each step saves as you go. Skip any step that has nothing for you.</p>
    </header>

    {p.loading ? <p className="plan-status" role="status">Loading {word}…</p> : <>
      <div className="plan-review-step">
        {stepTitle(`Left from ${p.carry.fromWord}`)}
        {openCarry.length === 0
          ? <p className="plan-review-empty">{answered.length ? `Every line from ${p.carry.fromWord} has an answer.` : `Nothing is left open from ${p.carry.fromWord}.`}</p>
          : <ul className="plan-review-lines" aria-label={`Left from ${p.carry.fromWord}`}>
            {openCarry.map((line) => <li key={line.key} className={`plan-review-line${pending === line.key ? ' is-saving' : ''}`}>
              <p className="plan-review-line-title">{line.title}</p>
              {line.note && <p className="plan-review-line-note">{line.note}</p>}
              {verbs(line.key, line.title, line.verbs, true)}
              {status(line.key)}
            </li>)}
          </ul>}
        {answered.length > 0 && <ul className="plan-review-decided">
          {answered.map((d) => <li key={d.key}><span>{d.title}</span><span className="plan-review-verdict">{d.label}</span></li>)}
        </ul>}
      </div>

      {p.parents && <div className="plan-review-step">
        {stepTitle(`For ${p.parents.word}`)}
        {p.parents.goals.length === 0
          ? <p className="plan-review-empty">No open {p.parents.word} goals to plan toward.</p>
          : <>
            <p className="plan-review-hint">What does {word} do for each one? Add a line, or leave it.</p>
            <ul className="plan-review-lines" aria-label={`${p.parents.word} goals`}>
              {p.parents.goals.map((g) => <li key={g.key} className="plan-review-line">
                <p className="plan-review-line-title">{g.title}</p>
                <p className="plan-review-line-note">{g.children.length ? `In ${word}: ${g.children.join(' · ')}` : `Nothing in ${word} yet`}</p>
                {adding === g.key
                  ? <InlineComposer key={added} label={`New line in ${word} for ${g.title}`} saveLabel="Add" onSave={add(g.key, g.onAdd)} onCancel={() => setAdding(null)} />
                  : <div><button type="button" className="canvas-link plan-add" aria-label={`Add to ${word} for ${g.title}`} onClick={() => setAdding(g.key)}>+ Add</button></div>}
              </li>)}
            </ul>
          </>}
      </div>}

      <div className="plan-review-step">
        {stepTitle(p.parents ? 'Anything else' : `What ${word} is for`)}
        {p.current.length > 0
          ? <ul className="plan-review-decided plan-by-hand-list" aria-label={`On ${word} so far`}>{p.current.map((t, i) => <li key={`${i}:${t}`}><span>{t}</span></li>)}</ul>
          : <p className="plan-review-empty">Nothing on {word} yet.</p>}
        {adding === 'loose'
          ? <InlineComposer key={added} label={`New line in ${word}`} saveLabel="Add" onSave={add('loose', p.onAdd)} onCancel={() => setAdding(null)} />
          : <div><button type="button" className="canvas-link plan-add" onClick={() => setAdding('loose')}>+ Add {p.itemWord}</button></div>}
      </div>

      {p.place && <div className="plan-review-step">
        {stepTitle('Give them a day')}
        {place.length === 0
          ? <p className="plan-review-empty">Everything on {word} has a day.</p>
          : <ul className="plan-review-lines" aria-label={`No day yet in ${word}`}>
            {place.map((line) => <li key={line.key} className={`plan-review-line${pending === line.key ? ' is-saving' : ''}`}>
              <p className="plan-review-line-title">{line.title}</p>
              {line.note && <p className="plan-review-line-note">{line.note}</p>}
              {verbs(line.key, line.title, line.days, false)}
              {status(line.key)}
            </li>)}
          </ul>}
      </div>}

      <footer className="plan-review-foot">
        {justMarked
          ? <>
            <p className="plan-review-finished" role="status"><span className="pv2-seal" aria-hidden="true" /> <b>{cap} is planned.</b></p>
            <div className="plan-review-onward">
              {p.next && <button type="button" className="plan-walk plan-review-finish is-next" onClick={p.next.onClick}>{p.next.label}</button>}
              <button type="button" className="canvas-link" onClick={p.onClose}>Close planning</button>
            </div>
          </>
          : <>
            {p.markBlocked && <p className="plan-review-hint">{p.markBlocked}</p>}
            <button type="button" className="plan-walk plan-review-finish is-next" disabled={marking || !!p.markBlocked} onClick={() => { void mark() }}>
              {marking ? 'Saving…' : `I’m happy with ${word}`}
            </button>
            {markFailed && <p className="plan-review-line-status is-failed" role="alert">Couldn’t save that. Try again.</p>}
          </>}
      </footer>
    </>}
  </section>
}
