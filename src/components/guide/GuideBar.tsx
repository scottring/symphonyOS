// src/components/guide/GuideBar.tsx
//
// The guide bar: while a guided plan is running, a quiet band above the
// ordinary page saying where you are on your chosen path, the one question
// this step asks, and how to move on. The page under it is the real planner —
// what you write there IS the plan. Paused, it shrinks to one line on Today.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { LocateFixed } from 'lucide-react'
import { useGuidedPlan } from '@/hooks/useGuidedPlan'
import { useMobile } from '@/hooks/useMobile'
import { GuideCoach } from './GuideCoach'
import { usePlanningSession, monthToken, weekToken, yearToken, type SessionHorizon } from '@/hooks/usePlanningSession'
import { readSeasons, seasonToken } from '@/lib/cadence/seasons'
import { readCadenceConfig } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { writePlanView } from '@/lib/planning/v2/planV2'
import { showToast } from '@/hooks/useToast'
import {
  advance, back, currentStep, finishHere, isReview, onStepPage, pageOf, parseYmd, pause, recordCoach, resume, stepIdeas, stepPath, stepShortName, stepTitle, withCoach,
  STEP_QUESTION, STEP_WHY, type CoachSaw, type GuideState, type GuideStep,
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

const HORIZON: Record<'year' | 'season' | 'month' | 'week', SessionHorizon> = { year: 'annual', season: 'seasonal', month: 'monthly', week: 'weekly' }

function tokenFor(at: GuideStep, s: GuideState): { horizon: SessionHorizon; token: string } {
  const start = s.periods[at] ? parseYmd(s.periods[at]!) : new Date()
  const step = pageOf(at)
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

/**
 * Move a run on from a step that has nothing to save — a look-back, whose
 * close-out card ends with the same "continue" the bar offers.
 */
export function useGuideNext(): (state: GuideState) => Promise<void> {
  const { set } = useGuidedPlan()
  const navigate = useNavigate()
  return async (state) => {
    const next = advance(state)
    await set(next)
    if (next.status === 'finished') { navigate('/start?done=1'); return }
    const st = currentStep(next)
    prepareView(st)
    navigate(stepPath(st, next))
  }
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
  const next = useGuideNext()
  const mobile = useMobile()
  // Esc (or ✕) puts the coach out of sight for this step only; the toggle
  // or the next step brings it back. Never saved: it is not a preference.
  const [hiddenAt, setHiddenAt] = useState<string | null>(null)
  const stepKey = state ? `${state.current}:${step}` : ''
  const hideCoach = useCallback(() => setHiddenAt(stepKey), [stepKey])
  const recordSaw = useCallback((saw: CoachSaw) => { if (state) void set(recordCoach(state, step, saw)) }, [state, step, set])
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
  // A look-back saves nothing of its own: its decisions are written as they're made.
  const review = isReview(step)
  const nextShort = last ? '' : stepShortName(state.steps[i + 1], state, seasons, weekNo)
  const go = (next: GuideState) => { const st = currentStep(next); prepareView(st); navigate(stepPath(st, next)) }
  const continueLabel = review ? (last ? 'Finish' : `Continue to ${nextShort}`)
    : last ? (step === 'today' ? 'Finish' : `Mark ${short} planned and finish`) : step === 'today' ? 'Continue' : `Mark ${short} planned and continue`
  // "Show me where things go": chosen at the start, switchable here.
  const coachOn = !!state.coach
  const coachHidden = hiddenAt === stepKey
  const coachShown = coachOn && !coachHidden
  const toggleCoach = () => {
    if (coachOn && coachHidden) { setHiddenAt(null); return }
    setHiddenAt(null)
    void set(withCoach(state, !coachOn))
  }
  const weekName = state.periods.week ? stepShortName('week', state, seasons, weekNo).replace(/^w/, 'W') : undefined
  const coachNames = {
    here: step === 'week' ? weekName ?? short : step === 'today' ? 'Today' : short,
    above: step === 'week' && state.periods.month ? stepShortName('month', state, seasons, weekNo)
      // The month the week's page sets beside it: the one holding its middle.
      : step === 'week' && state.periods.week ? new Date(parseYmd(state.periods.week).getTime() + 3 * 86400000).toLocaleDateString('en-US', { month: 'long' })
      : step === 'today' ? weekName ?? 'this week' : undefined,
    week: weekName,
    weekStart: state.periods.week,
  }

  const onContinue = async () => {
    // Moving on agrees this period's plan — the same record "This is our …
    // plan" writes, so the page reads as planned afterwards.
    if (step !== 'today' && !review) {
      const ok = await session.save({ wentWell: session.mine?.wentWell ?? '', didnt: session.mine?.didnt ?? '' })
      if (!ok) { showToast(`Couldn’t save the ${short} plan — check your connection and try again.`, 'error', 6000); return }
    }
    await next(state)
  }
  const onFinishHere = async () => {
    if (step !== 'today' && !review && here) {
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
      {(() => { const ideas = stepIdeas(step, state, seasons, weekNo); return ideas && (
        <details className="guide-ideas" key={step}>
          <summary>Not sure what to write?</summary>
          <p>{ideas.prompt}</p>
          <ul>{ideas.patterns.map((x) => <li key={x}>{x}</li>)}</ul>
        </details>
      ) })()}
      <div className="guide-acts">
        {i > 0 && <button type="button" className="pv2-link pv2-quiet" onClick={() => { const b = back(state); void set(b); go(b) }}>Back</button>}
        <button type="button" className={`pv2-link pv2-quiet guide-showme${coachShown ? ' is-on' : ''}`} aria-pressed={coachShown} onClick={toggleCoach}
          title="Point to the control to use on each page, and say where things are saved">
          <LocateFixed size={14} aria-hidden="true" />Show me where things go
        </button>
        <span className="flex-1" />
        <button type="button" className="pv2-link pv2-quiet" onClick={() => void onLeave()}>Save and leave</button>
        {!last && <button type="button" className="pv2-link pv2-quiet" onClick={() => void onFinishHere()}>Finish here</button>}
        {here
          ? <button type="button" className="pv2-btn" data-guide-target="guide-continue" onClick={() => void onContinue()}>{continueLabel}</button>
          : <button type="button" className="pv2-btn" onClick={() => go(state)}>Go to {review ? stepShortName(pageOf(step), state, seasons, weekNo) : short}</button>}
      </div>
      {coachOn && here && (
        <GuideCoach key={stepKey} state={state} step={step} names={coachNames} mobile={mobile}
          hidden={coachHidden} onHide={hideCoach} onRecord={recordSaw} continueLabel={continueLabel} />
      )}
    </section>
  )
}
