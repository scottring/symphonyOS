// src/components/guide/GuideBar.tsx
//
// The guide bar: while a guided plan is running, a quiet band above the
// ordinary page saying where you are on your chosen path, the one question
// this step asks, and how to move on. The page under it is the real planner —
// what you write there IS the plan. Paused, it shrinks to one line on Today.
import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { useGuidedPlan } from '@/hooks/useGuidedPlan'
import { usePlanningSession, monthToken, weekToken, yearToken, type SessionHorizon } from '@/hooks/usePlanningSession'
import { readSeasons, seasonToken } from '@/lib/cadence/seasons'
import { readCadenceConfig } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { writePlanView } from '@/lib/planning/v2/planV2'
import { showToast } from '@/hooks/useToast'
import {
  advance, back, currentStep, finishHere, onStepPage, parseYmd, pause, resume, stepIdeas, stepPath, stepShortName, stepTitle,
  STEP_QUESTION, STEP_WHY, type GuideState, type GuideStep,
} from '@/lib/guide/guidedPlan'

/**
 * Where the guide sits. A planning page marks the spot under its own heading
 * with <GuideAnchor />, so the page still opens with its name and the guide
 * takes the place of the page's own "Plan …" row (walkthrough 2026-09-30: the
 * bar above the heading pushed every page halfway down the screen). A page
 * with no anchor gets the guide at the top, as before.
 */
export const GuideHostContext = createContext<((node: HTMLElement | null) => void) | null>(null)
export function GuideAnchor() {
  const setHost = useContext(GuideHostContext)
  return setHost ? <div ref={setHost} className="guide-anchor" /> : null
}

/** A guided run is on and not paused — the page's own plan row steps aside. */
export function useGuideRunning(): boolean {
  const { state } = useGuidedPlan()
  return state?.status === 'active'
}

const HORIZON: Record<Exclude<GuideStep, 'today'>, SessionHorizon> = { year: 'annual', season: 'seasonal', month: 'monthly', week: 'weekly' }

function tokenFor(step: GuideStep, s: GuideState): { horizon: SessionHorizon; token: string } {
  const start = s.periods[step] ? parseYmd(s.periods[step]!) : new Date()
  if (step === 'year') return { horizon: 'annual', token: yearToken(start.getFullYear()) }
  if (step === 'season') return { horizon: 'seasonal', token: seasonToken(start, readSeasons()) }
  if (step === 'month') return { horizon: 'monthly', token: monthToken(start) }
  if (step === 'week') return { horizon: 'weekly', token: weekToken(start) }
  // Today has no agreed-plan record; the hook still needs a stable key.
  return { horizon: HORIZON.week, token: weekToken(start) }
}

/** Open a step's page with the level above beside the list. */
function prepareView(step: GuideStep) {
  if (step === 'week' || step === 'month' || step === 'season') writePlanView(step, 'ref')
}

export function GuideBar({ host = null }: { host?: HTMLElement | null }) {
  const bar = <GuideBarInner />
  return host ? createPortal(bar, host) : bar
}

function GuideBarInner(): ReactNode {
  const { state, set } = useGuidedPlan()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const step = state ? currentStep(state) : 'today'
  const { horizon, token } = state ? tokenFor(step, state) : { horizon: 'weekly' as SessionHorizon, token: '' }
  const session = usePlanningSession(horizon, token)
  // /start is where a run is chosen and resumed; it says so itself.
  if (!state || state.status === 'finished' || pathname === '/start') return null

  const seasons = readSeasons()
  const wso = readCadenceConfig().weekStartsOn
  const weekNo = (d: Date) => weekOfYear(d, wso)
  const onToday = pathname === '/today' || pathname === '/'

  if (state.status === 'paused') {
    if (!onToday) return null
    return (
      <div className="guide-pause" role="status">
        <span>Guided planning paused at <b>{stepTitle(step, state, seasons, weekNo).split(' · ')[0]}</b>. {state.done.length ? 'What you finished is saved.' : 'Nothing is lost.'}</span>
        <button type="button" className="pv2-link" onClick={() => { void set(resume(state)); prepareView(step); navigate(stepPath(step, state)) }}>Resume</button>
        <button type="button" className="pv2-link pv2-quiet" onClick={() => void set(null)}>Stop guiding</button>
      </div>
    )
  }

  const n = state.steps.length
  const i = state.current
  const last = i >= n - 1
  const here = onStepPage(step, state, pathname, search)
  const short = stepShortName(step, state, seasons, weekNo)
  const go = (next: GuideState) => { const st = currentStep(next); prepareView(st); navigate(stepPath(st, next)) }

  const onContinue = async () => {
    // Moving on agrees this period's plan — the same record "This is our …
    // plan" writes, so the page reads as planned afterwards.
    if (step !== 'today') {
      const ok = await session.save({ wentWell: session.mine?.wentWell ?? '', didnt: session.mine?.didnt ?? '' })
      if (!ok) { showToast(`Couldn’t save the ${short} plan — check your connection and try again.`, 'error', 6000); return }
    }
    const next = advance(state)
    await set(next)
    if (next.status === 'finished') navigate('/start?done=1')
    else go(next)
  }
  const onFinishHere = async () => {
    if (step !== 'today' && here) {
      const ok = await session.save({ wentWell: session.mine?.wentWell ?? '', didnt: session.mine?.didnt ?? '' })
      if (!ok) { showToast(`Couldn’t save the ${short} plan — try again.`, 'error', 6000); return }
    }
    await set(finishHere(state))
    navigate('/start?done=1')
  }
  const onLeave = async () => {
    await set(pause(state))
    showToast('Paused. Resume from Today, or from Help → Plan with guidance.', 'success', 6000)
    navigate('/today')
  }

  return (
    <section className="guide-bar" aria-label="Guided planning">
      <ol className="guide-path" aria-label={`Step ${i + 1} of ${n}`}>
        {state.steps.map((s, k) => (
          <li key={s} className={k === i ? 'is-on' : state.done.includes(s) ? 'is-done' : ''} aria-current={k === i ? 'step' : undefined}>
            {k === i ? `Step ${i + 1} of ${n} · ${stepTitle(s, state, seasons, weekNo)}` : `${state.done.includes(s) ? '✓ ' : ''}${stepShortName(s, state, seasons, weekNo).replace(/^./, (c) => c.toUpperCase())}`}
          </li>
        ))}
      </ol>
      <h2 className="guide-q">{STEP_QUESTION[step]}</h2>
      <p className="guide-why">{STEP_WHY[step]} Changes save as you make them.</p>
      {(() => { const ideas = stepIdeas(step, state, seasons, weekNo); return (
        <details className="guide-ideas" key={step}>
          <summary>Not sure what to write?</summary>
          <p>{ideas.prompt}</p>
          <ul>{ideas.patterns.map((x) => <li key={x}>{x}</li>)}</ul>
        </details>
      ) })()}
      <div className="guide-acts">
        {i > 0 && <button type="button" className="pv2-link pv2-quiet" onClick={() => { const b = back(state); void set(b); go(b) }}>Back</button>}
        <span className="flex-1" />
        <button type="button" className="pv2-link pv2-quiet" onClick={() => void onLeave()}>Save and leave</button>
        {!last && <button type="button" className="pv2-link pv2-quiet" onClick={() => void onFinishHere()}>Finish here</button>}
        {here
          ? <button type="button" className="pv2-btn" onClick={() => void onContinue()}>
              {last ? (step === 'today' ? 'Finish' : `Mark ${short} planned and finish`) : step === 'today' ? 'Continue' : `Mark ${short} planned and continue`}
            </button>
          : <button type="button" className="pv2-btn" onClick={() => go(state)}>Go to {short}</button>}
      </div>
    </section>
  )
}
