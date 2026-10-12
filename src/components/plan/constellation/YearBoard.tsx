// src/components/plan/constellation/YearBoard.tsx
//
// Year (Scott, 2026-10-12): "What do I want to accomplish this year?" The
// year's goals are one complete collection, in Month's board and cards. Last
// year sits beside it as optional review material — not a parent: nothing
// links under it, and nothing carries on its own. Renewing a goal writes a
// NEW goal for this year in the person's words; the old one stays in its year.
// Marking one done is an explicit, undoable status change on it; letting one
// go is a record only.
//
// The optional session (look back at last year, then shape this year) changes
// what the source column shows; the year's collection stays put throughout.
// Props in, JSX out: the page owns the data and the writes.

import { cloneElement, type FormEvent, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Goal } from '@/types/goal'
import { InlineComposer } from '@/components/canvas/plan/InlineComposer'
import type { PlanItemRowProps } from '@/components/canvas/plan/PlanItemRow'
import { PlanMeetingBar } from '../v2/PlanStatus'
import type { LookBackItem, YearStep } from './useYearSession'

export interface YearBoardSession {
  step: YearStep
  notes: { wentWell: string; didnt: string }
  onNotes: (key: 'wentWell' | 'didnt', text: string) => void
  onStep: (step: YearStep) => void
  onLeave: () => void
  onFinish: () => void
}

export interface YearBoardProps {
  year: number
  measure: (el: HTMLElement | null) => void
  dataReady: boolean
  /** The year's goal cards (and any suggestions), already rendered. */
  items: ReactNode
  isEmpty: boolean
  adding: boolean
  /** Remount key for the writing line (empty again after a goal lands). */
  addKey: number
  addInitial: string
  addPicker: ReactNode
  onStartAdd: () => void
  onCancelAdd: () => void
  onAdd: (text: string) => Promise<boolean>
  /** Unfinished wording, while a session is open (kept to resume). */
  onAddDraft?: (text: string) => void
  /** Season for this period. */
  seasonHref: string
  sourceShown: boolean
  lookBack: LookBackItem[]
  renewing: string | null
  renewInitial: (goal: Goal) => string
  onRenewStart: (goal: Goal) => void
  onRenewCancel: () => void
  onRenew: (goal: Goal, text: string) => Promise<boolean>
  onRenewDraft?: (goal: Goal, text: string) => void
  onMarkDone: (goal: Goal) => void
  onReopen: (goal: Goal) => void
  onLetGo: (goal: Goal) => void
  onUndoLetGo: (goal: Goal) => void
  session: YearBoardSession | null
}

/**
 * A year goal's card: the page's own row (same verbs, editing and status),
 * counting its season goals across the whole year rather than only the
 * season on screen, and naming them when the card is open. One record each;
 * the names are a view of the same filtered season goals, not copies.
 */
export function YearGoalCard({ row, count, meta }: { row: ReactNode; count: number; meta: string }) {
  return cloneElement(row as ReactElement<PlanItemRowProps>, { count, childTerm: 'season goal', meta })
}

/** Mirror what is typed in a composer's field (and only its field). */
const typed = (label: string, fn?: (text: string) => void) => fn && ((e: FormEvent<HTMLDivElement>) => {
  const el = e.target as HTMLInputElement
  if (el.getAttribute('aria-label') === label) fn(el.value)
})

export function YearBoard({ measure, ...p }: YearBoardProps) {
  const { year, lookBack, session } = p
  const prev = year - 1
  const decided = lookBack.filter((i) => i.decided).length
  const inReview = session?.step === 'lookback'
  const addLabel = `New ${year} goal`

  const why = session?.step === 'shape'
    ? `Write what you want ${year} to hold, in your own words. A few goals is plenty; Season turns them into steps. Each goal saves as you add it.`
    : lookBack.length
      ? `Decide what each ${prev} goal becomes: renew it for ${year} in your words, mark it done, or let it go. Nothing carries on its own. ${decided} of ${lookBack.length} decided.`
      : `Nothing was written for ${prev}. Note what went well and what didn’t, then shape ${year}.`

  const statusOf = (i: LookBackItem): string => {
    const parts: string[] = []
    if (i.done) parts.push(`Done in ${prev}`)
    if (i.renewedAs) parts.push(`Renewed for ${year} as “${i.renewedAs.name}”`)
    if (i.left && !i.done && !i.renewedAs) parts.push(`Letting it go; it stays in ${prev}`)
    if (!parts.length) parts.push(inReview ? 'Not decided yet' : `Still open in ${prev}`)
    return parts.join(' · ')
  }

  const card = (i: LookBackItem) => {
    const { goal } = i
    const label = `Renew ${goal.name} for ${year}`
    return <li key={goal.id} className="plan-group-slot">
      <section className={`canvas-group plan-group plan-source plan-year-past${i.decided ? ' is-decided' : ''}`} aria-label={`${prev}: ${goal.name}`}>
        <header className="canvas-group-head">
          <h3 className="canvas-group-title">{goal.name}</h3>
          {i.done && <span className="canvas-tag plan-tag-done">Done</span>}
        </header>
        <p className="plan-source-count">{statusOf(i)}</p>
        {p.renewing === goal.id
          ? <div className="plan-year-draft" onChange={typed(label, p.onRenewDraft && ((t) => p.onRenewDraft!(goal, t)))}>
              <InlineComposer label={label} initial={p.renewInitial(goal)} saveLabel={`Add to ${year}`}
                onSave={(text) => p.onRenew(goal, text)} onCancel={p.onRenewCancel} />
            </div>
          : <div className="plan-year-decisions">
              {!i.renewedAs && <button type="button" className="canvas-link plan-add" aria-label={label} disabled={!p.dataReady}
                onClick={() => p.onRenewStart(goal)}>Renew for {year}</button>}
              {i.done
                ? <button type="button" className="canvas-link" aria-label={`Reopen ${goal.name} in ${prev}`} onClick={() => p.onReopen(goal)}>Reopen</button>
                : <button type="button" className="canvas-link" aria-label={`Mark ${goal.name} done in ${prev}`} onClick={() => p.onMarkDone(goal)}>Mark done</button>}
              {inReview && !i.done && !i.renewedAs && (i.left
                ? <button type="button" className="canvas-link" aria-label={`Undo letting ${goal.name} go`} onClick={() => p.onUndoLetGo(goal)}>Undo</button>
                : <button type="button" className="canvas-link" aria-label={`Let ${goal.name} go`} onClick={() => p.onLetGo(goal)}>Let it go</button>)}
            </div>}
      </section>
    </li>
  }

  const lastYear = <>
    <div className="plan-section-head">
      <h2 id="plan-year-source-title">{inReview ? `Look back at ${prev}` : `${prev} goals`}</h2>
      <p>{inReview ? `${decided} of ${lookBack.length} decided. Nothing carries on its own.` : `Last year, for reference. Renew one for ${year} in your own words; nothing carries on its own.`}</p>
    </div>
    {inReview && session && <div className="plan-year-notes" aria-label={`Notes on ${prev}`} role="group">
      <label>What went well in {prev}?
        <textarea value={session.notes.wentWell} rows={2} onChange={(e) => session.onNotes('wentWell', e.target.value)} />
      </label>
      <label>What didn’t?
        <textarea value={session.notes.didnt} rows={2} onChange={(e) => session.onNotes('didnt', e.target.value)} />
      </label>
      <p className="plan-year-hint">Saved with the plan when you mark {year} planned.</p>
    </div>}
    {lookBack.length > 0
      ? <ul className="plan-groups plan-source-grid" aria-label={`${prev} goals`}>{lookBack.map(card)}</ul>
      : <p className="plan-empty">Nothing was written for {prev}.</p>}
  </>

  const count = (pred: (i: LookBackItem) => boolean) => lookBack.filter(pred).length
  const fromLastYear = session && <>
    <div className="plan-section-head">
      <h2 id="plan-year-source-title">From {prev}</h2>
      <p>What you decided and noted, to shape {year} from.</p>
    </div>
    {lookBack.length > 0 && <p className="plan-year-summary" role="status">
      Renewed {count((i) => !!i.renewedAs)} · Done {count((i) => i.done)} · Letting go {count((i) => i.left && !i.done && !i.renewedAs)} · Not decided {count((i) => !i.decided)}
    </p>}
    {session.notes.wentWell && <div className="plan-year-note"><h3>What went well</h3><p>{session.notes.wentWell}</p></div>}
    {session.notes.didnt && <div className="plan-year-note"><h3>What didn’t</h3><p>{session.notes.didnt}</p></div>}
    <button type="button" className="canvas-link" onClick={() => session.onStep('lookback')}>Back to {prev}</button>
  </>

  return <>
    {session && <PlanMeetingBar period={String(year)} prevName={String(prev)} step={inReview ? 1 : 2} lookBack={lookBack.length > 0}
      why={why} onStep={(s) => session.onStep(s === 1 ? 'lookback' : 'shape')}
      steps={[{ key: 'lookback', label: `Look back at ${prev}` }, { key: 'shape', label: `Shape ${year}` }]}
      stepKey={session.step} onStepKey={(k) => session.onStep(k === 'shape' ? 'shape' : 'lookback')}
      onLeave={session.onLeave} onSave={session.onFinish} saveLabel={`Mark ${year} planned`} />}
    <div ref={measure} className={`plan-month-board plan-year-board${p.sourceShown ? '' : ' is-source-hidden'}${inReview ? ' is-step-lookback' : ''}`}>
      {/* The year first: it is what the page is for, and what a phone shows
          first. Wide screens put last year on its left (canvas-plan.css). */}
      <section className="plan-month-goals" aria-labelledby="plan-year-question" data-explain="year" data-explain-label={`Every ${year} goal`}>
        <div className="plan-month-intro">
          <h2 id="plan-year-question">What do you want to accomplish in {year}?</h2>
          <p>Write the few goals you want this year to hold, in your own words.</p>
        </div>
        <ul className="plan-items plan-month-list" aria-label={`${year} goals`}>{p.items}</ul>
        {p.isEmpty && !p.adding && <p className="plan-empty">
          {lookBack.length > 0 ? `Nothing for ${year} yet. ${prev}’s goals are beside it if you want to start from them.` : `Nothing for ${year} yet.`}
        </p>}
        {p.adding
          ? <div className="plan-year-draft" onChange={typed(addLabel, p.onAddDraft)}>
              <InlineComposer key={p.addKey} label={addLabel} initial={p.addInitial} saveLabel="Add" extra={p.addPicker}
                onSave={p.onAdd} onCancel={p.onCancelAdd} />
            </div>
          : <button type="button" className="canvas-link plan-add" aria-label={`Add a ${year} goal`} disabled={!p.dataReady}
              onClick={p.onStartAdd}>+ Add a {year} goal</button>}
        {!p.isEmpty && <footer className="plan-month-next">
          <Link to={p.seasonHref} className="plan-next" data-explain="next" data-explain-label="Plan a season from these goals">Plan a season from these goals →</Link>
          <span>Season turns year goals into what each stretch of the year will hold.</span>
        </footer>}
      </section>
      {/* Hidden, not removed: a renewal still being written survives. */}
      <section id="plan-year-source" className="plan-month-source plan-year-source" hidden={!p.sourceShown} aria-labelledby="plan-year-source-title"
        data-explain="source" data-explain-label={`${prev}, for reference`}>
        {session?.step === 'shape' ? fromLastYear : lastYear}
      </section>
    </div>
  </>
}
