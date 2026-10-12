// src/components/plan/constellation/SeasonBoard.tsx
//
// Season answers one question (Scott, 2026-10-12): "What do I want to
// accomplish this season?" — Month's approved board, one horizon up. Every
// season goal stays in one complete collection, under a year goal or on its
// own; the year's goals sit beside it as a hideable source. Selecting a year
// goal highlights its season goals there (never filters them away), lists
// the same records in its card, and adds a season goal under it in one write.
//
// An optional session runs over the same board: look back at the season
// before (a deliberate verdict per unfinished goal, never automatic), the
// year's goals, then free writing. The collection stays put; only the source
// changes per step. Props in, JSX out: every write is the page's.

import { type DragEvent, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Task } from '@/types/task'
import type { LineFate } from '@/lib/planning/v2/planV2'
import type { PlanNode } from './model'
import { isDone, UNLINKED, type PlanGroup } from '@/components/canvas/plan/planGroups'
import { InlineComposer } from '@/components/canvas/plan/InlineComposer'
import { PlanMeetingBar } from '@/components/plan/v2/PlanStatus'
import { SEASON_STEPS, type SeasonSession, type SeasonStep } from './useSeasonSession'

const aOrAn = (word: string) => /^[aeiou]/i.test(word) ? 'an' : 'a'
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export interface LookBackItem { task: Task; fate: LineFate }

export interface SeasonBoardProps {
  boardRef: (el: HTMLElement | null) => void
  /** "Fall", from the household's own seasons. */
  seasonWord: string
  /** "Fall 2026". */
  seasonLabel: string
  year: number
  /** "Summer": the season before, by the household's seasons. */
  prevWord: string
  /** Every season goal on screen (already filtered; completed ones only when asked). */
  items: PlanNode[]
  /** The year goals, each a group holding its season goals. */
  sources: PlanGroup[]
  openCount: (parent: PlanNode) => number
  selected: Set<string> | null
  linkedParent: string | null
  sourceShown: boolean
  /** A year goal card's drop target (drag a season goal onto it to link). */
  dropFor: (g: PlanGroup) => { className: string; handlers: { onDragOver?: (e: DragEvent) => void; onDragLeave?: (e: DragEvent) => void; onDrop?: (e: DragEvent) => void } }
  renderItem: (n: PlanNode) => ReactNode
  proposals: ReactNode[]
  /** The open add composer: a year goal's key, or UNLINKED for one of its own. */
  composerKey: string | null
  composerRev: number
  onOpenComposer: (key: string, parent: PlanNode | null) => void
  onCloseComposer: () => void
  onAdd: (text: string, parent: PlanNode | null) => Promise<boolean>
  /** Unfinished input the session remembered, by composer key. */
  draftFor: (key: string) => string
  onDraft: (key: string, text: string) => void
  areaPicker: ReactNode
  onSelectSource: (key: string) => void
  onClearSelection: () => void
  onSuggestLinks: () => void
  onAddYearGoals: () => void
  dataReady: boolean
  monthHref: string
  session: SeasonSession
  onStep: (step: SeasonStep) => void
  onFinish: () => void
  /** The season before's goals, each with what became of it there. */
  lookBack: LookBackItem[]
  onCarry: (task: Task) => void
  onMarkDone: (task: Task) => void
  onLeaveThere: (task: Task) => void
  onUndecide: (task: Task) => void
}

export function SeasonBoard({ boardRef, ...p }: SeasonBoardProps) {
  const { seasonWord, prevWord, year, items, sources, selected, session } = p
  const seasonGoal = `${aOrAn(seasonWord)} ${seasonWord} goal`
  const yearGoals = `${year} goals`
  const selectedSources = selected ? sources.filter((g) => selected.has(g.key)) : []
  const selectedCount = selected ? items.filter((n) => selected.has(n.parent ?? UNLINKED)).length : 0
  const inSession = session.active
  const step = session.step
  const lookingBack = inSession && step === 'lookback'

  // Typing in a composer is remembered while a session is open, so leaving
  // for now and coming back keeps the half-written goal.
  const draftProps = (key: string) => ({
    className: 'plan-season-draft',
    onChange: (e: FormEvent<HTMLDivElement>) => { if (e.target instanceof HTMLInputElement) p.onDraft(key, e.target.value) },
  })
  const composer = (key: string, parent: PlanNode | null, label: string, extra?: ReactNode) =>
    <div {...draftProps(key)}>
      <InlineComposer key={`${key}:${p.composerRev}`} label={label} saveLabel="Add" initial={p.draftFor(key)} extra={extra}
        onSave={(text) => p.onAdd(text, parent)} onCancel={p.onCloseComposer} />
    </div>

  const stepLabels: Record<SeasonStep, string> = { lookback: `Look back at ${prevWord}`, year: `Your ${yearGoals}`, write: `Write ${seasonWord}` }
  const openLeft = p.lookBack.filter((l) => l.fate === 'open' && !session.decisions[l.task.id]).length
  const why: Record<SeasonStep, string> = {
    lookback: p.lookBack.length === 0
      ? `${prevWord} had no goals to look back at. Go on to your ${yearGoals}.`
      : `Decide what each unfinished ${prevWord} goal becomes: carry it into ${seasonWord}, mark it done, or leave it in ${prevWord}. Nothing moves on its own.${openLeft ? ` ${plural(openLeft, 'goal')} still to decide.` : ''}`,
    year: `Your ${yearGoals} are beside the season. Select one to see what ${seasonWord} already holds for it, and add ${seasonGoal} under it.`,
    write: `Add anything else ${seasonWord} should hold, in your own words. Everything saves as you go.`,
  }

  // ---- The season before, one verdict per unfinished goal -----------------
  const inSeason = new Set(items.map((n) => n.id))
  const statusOf = (l: LookBackItem): string => {
    const decided = session.decisions[l.task.id]
    if (l.fate === 'carried') return inSeason.has(l.task.id) ? `Carried to ${seasonWord}` : 'Carried forward'
    if (l.fate === 'done') return 'Done'
    if (l.fate === 'someday') return 'Someday'
    if (l.fate === 'dropped') return `Let go from ${prevWord}`
    if (decided === 'left') return `Left in ${prevWord}`
    return 'Still open'
  }
  const undecided = (l: LookBackItem) => l.fate === 'open' && !session.decisions[l.task.id]
  const lookBackRows = [...p.lookBack].sort((a, b) => Number(undecided(b)) - Number(undecided(a)))
  const lookBackPanel = <>
    <div className="plan-section-head">
      <h2 id="plan-season-lookback-title">{prevWord} goals</h2>
      <p>Decide what each unfinished one becomes. {prevWord} keeps its record.</p>
    </div>
    {lookBackRows.length > 0
      ? <ul className="plan-groups plan-source-grid plan-season-lookback" aria-label={`${prevWord} goals to look back at`}>
          {lookBackRows.map((l) => {
            const open = undecided(l)
            return <li key={l.task.id} className="plan-group-slot">
              <section className={`canvas-group plan-group plan-source plan-season-past${open ? '' : ' is-decided'}`} aria-label={l.task.title}>
                <header className="canvas-group-head"><h3 className="canvas-group-title">{l.task.title}</h3></header>
                <p className="plan-source-count">{statusOf(l)}</p>
                {open && <div className="plan-season-verdicts" role="group" aria-label={`What becomes of ${l.task.title}`}>
                  <button type="button" className="canvas-link" onClick={() => p.onCarry(l.task)}>Carry to {seasonWord}</button>
                  <button type="button" className="canvas-link" onClick={() => p.onMarkDone(l.task)}>Mark done</button>
                  <button type="button" className="canvas-link" onClick={() => p.onLeaveThere(l.task)}>Leave in {prevWord}</button>
                </div>}
                {l.fate === 'open' && session.decisions[l.task.id] === 'left' && <button type="button" className="canvas-link" onClick={() => p.onUndecide(l.task)}>Change</button>}
              </section>
            </li>
          })}
        </ul>
      : <p className="plan-empty">No {prevWord} goals to look back at.</p>}
  </>

  // ---- The year's goals, the source --------------------------------------
  const renderSource = (g: PlanGroup) => {
    const parent = g.parent!
    const isSelected = !!selected?.has(g.key)
    const adding = p.composerKey === g.key
    const open = p.openCount(parent)
    const drop = p.dropFor(g)
    return <li key={g.key} className="plan-group-slot">
      <section className={`canvas-group plan-group plan-source${isSelected ? ' is-selected' : ''}${p.linkedParent === g.key ? ' is-linked' : ''}${drop.className}`}
        aria-label={`Under ${parent.title}`} data-group-key={g.key} {...drop.handlers}>
        <header className="canvas-group-head">
          <h3 className="canvas-group-title"><button type="button" className="plan-group-focus" aria-pressed={isSelected}
            onClick={() => p.onSelectSource(g.key)}>{parent.title}</button></h3>
          {isDone(parent) && <span className="canvas-tag plan-tag-done">Done</span>}
        </header>
        <p className="plan-source-count">{open > 0 ? plural(open, `${seasonWord} goal`) : `Nothing for ${seasonWord} yet`}</p>
        {isSelected && g.items.length > 0 && <ul className="plan-source-preview" aria-label={`${seasonWord} goals under ${parent.title}`}>
          {g.items.map((n) => <li key={n.key} className={isDone(n) ? 'is-done' : undefined}>{n.title}</li>)}
        </ul>}
        {adding
          ? composer(g.key, parent, `New ${seasonWord} goal under ${parent.title}`)
          : <button type="button" className="canvas-link plan-add" aria-label={`Add ${seasonGoal} under ${parent.title}`} disabled={!p.dataReady}
              onClick={() => { if (!isSelected) p.onSelectSource(g.key); p.onOpenComposer(g.key, parent) }}>+ Add {seasonGoal}</button>}
      </section>
    </li>
  }
  const yearPanel = <>
    <div className="plan-section-head">
      <h2 id="plan-season-source-title">{yearGoals}</h2>
      <p>Select one to see its {seasonWord} goals, or add one from it.</p>
    </div>
    {sources.length > 0
      ? <ul className="plan-groups plan-source-grid" aria-label={yearGoals}>{sources.map(renderSource)}</ul>
      : <p className="plan-empty">No {yearGoals} yet. <button type="button" className="canvas-link" onClick={p.onAddYearGoals}>Add {yearGoals}</button></p>}
  </>

  // ---- What a finished session chose --------------------------------------
  const finished = session.finished
  const linkedCount = items.filter((n) => n.parent && !isDone(n)).length
  const ownCount = items.filter((n) => !n.parent && !isDone(n)).length
  const finishedLine = finished && <div className="plan-season-finished" role="status">
    <p><b>{seasonWord} is planned.</b> {plural(linkedCount + ownCount, `${seasonWord} goal`)}: {[
      finished.carried > 0 ? `${finished.carried} carried from ${prevWord}` : null,
      `${linkedCount} under ${yearGoals}`,
      `${ownCount} on ${ownCount === 1 ? 'its' : 'their'} own`,
    ].filter(Boolean).join(', ')}.</p>
    <Link to={p.monthHref} className="plan-next">Plan a month from these goals →</Link>
    <button type="button" className="canvas-link" onClick={session.dismissFinished}>Done</button>
  </div>

  const addingLoose = p.composerKey === UNLINKED
  return <>
    {inSession && <PlanMeetingBar period={p.seasonLabel} prevName={prevWord} step={1} lookBack={false} onStep={() => {}}
      steps={SEASON_STEPS.map((key) => ({ key, label: stepLabels[key] }))} stepKey={step}
      onStepKey={(k) => p.onStep(k as SeasonStep)} why={why[step]}
      onLeave={session.leave} onSave={p.onFinish} saveLabel={`Mark ${seasonWord} planned`} />}
    <div ref={boardRef} className={`plan-month-board plan-season-board${p.sourceShown ? '' : ' is-source-hidden'}${inSession ? ` is-step-${step}` : ''}`}>
      {/* The season first: it is what the page is for, and what a phone shows
          first. Wide screens put the source on its left (canvas-plan.css). */}
      <section className="plan-month-goals" aria-labelledby="plan-season-question" data-explain="season" data-explain-label={`Every ${seasonWord} goal`}>
        <div className="plan-month-intro">
          <h2 id="plan-season-question">What do you want to accomplish in {seasonWord}?</h2>
          <p>Build your season from your {yearGoals}, and add anything else that matters.</p>
        </div>
        {finishedLine}
        {selectedSources.length > 0 && <div className="plan-month-selection">
          <span role="status">{selectedCount > 0 ? `Highlighting ${plural(selectedCount, `${seasonWord} goal`)}` : `No ${seasonWord} goals yet`} for {selectedSources.length === 1 ? selectedSources[0].parent!.title : `${selectedSources.length} ${yearGoals}`}</span>
          <button type="button" className="canvas-link" onClick={p.onClearSelection}>Clear · Esc</button>
        </div>}
        <ul className={`plan-items plan-month-list${selected ? ' has-selection' : ''}`} aria-label={`${seasonWord} goals`}>
          {items.map(p.renderItem)}
          {p.proposals}
        </ul>
        {items.length === 0 && p.proposals.length === 0 && !addingLoose && <p className="plan-empty">
          {sources.length > 0 ? `Nothing for ${seasonWord} yet. Add one from a ${year} goal, or one of its own below.` : `Nothing for ${seasonWord} yet.`}
        </p>}
        {sources.length > 0 && items.some((n) => !n.parent && !isDone(n)) && <button type="button" className="canvas-link plan-suggest-links"
          onClick={p.onSuggestLinks}>Suggest {year} goals for the ones on their own</button>}
        {addingLoose
          ? composer(UNLINKED, null, `New ${seasonWord} goal`, p.areaPicker)
          : <button type="button" className="canvas-link plan-add" aria-label={`Add ${seasonGoal} of its own`} disabled={!p.dataReady}
              onClick={() => p.onOpenComposer(UNLINKED, null)}>+ Add {seasonGoal}</button>}
        {items.length > 0 && <footer className="plan-month-next">
          <Link to={p.monthHref} className="plan-next" data-explain="next" data-explain-label="Plan a month from these goals">Plan a month from these goals →</Link>
          <span>Month turns them into this month’s goals.</span>
        </footer>}
      </section>
      {/* Hidden, not removed: an unfinished goal typed in a card survives. */}
      <section id="plan-season-source" className="plan-month-source" hidden={!p.sourceShown} aria-labelledby={lookingBack ? 'plan-season-lookback-title' : 'plan-season-source-title'}
        data-explain="source" data-explain-label={lookingBack ? `${prevWord} goals, to look back at` : `${yearGoals}, the source for ${seasonWord}`}>
        {lookingBack && lookBackPanel}
        {/* Kept mounted while looking back, so a goal half-written under a
            year goal is still there on the way back. */}
        <div className="plan-season-year" hidden={lookingBack}>{yearPanel}</div>
      </section>
    </div>
  </>
}
