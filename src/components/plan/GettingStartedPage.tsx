// src/components/plan/GettingStartedPage.tsx
//
// Plan with guidance (/start): choose what to plan — the bigger picture, the
// month ahead, this week, or just today; or, for an account that already has
// plans, "pick up where you are" — then plan on the ordinary pages
// with a guide bar on top. Also where a paused run resumes and a finished one
// says what is ready. Reachable any time from Help and ☰ → Plan with
// guidance; it opens by itself only after first-run setup. Nothing here is a
// gate: "Explore on my own" goes straight to Today.
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { useGuidedPlan } from '@/hooks/useGuidedPlan'
import { usePickUpFacts, type PickUp } from '@/hooks/usePickUpFacts'
import { GoalsProvider } from '@/contexts/GoalsContext'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { readSeasons } from '@/lib/cadence/seasons'
import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { writePlanView } from '@/lib/planning/v2/planV2'
import { isCurrentPeriod, periodBounds, selectPeriodTasks } from '@/lib/planning/periodPage'
import { closeOutCandidates } from '@/lib/planning/v2/planV2'
import { weekListTasks } from '@/lib/planning/weekList'
import { requestPlanFromPaper } from '@/lib/planFromPaperSignal'
import {
  ROUTE_CHOICES, ROUTE_STEPS, currentStep, firstStepChoices, isReview, pageOf, parseYmd, resume, startGuide, startPickUp, stepPath, stepShortName, stepTitle,
  type GuideRoute, type GuideState, type GuideStep, type PickUpRow,
} from '@/lib/guide/guidedPlan'

/** Year goals are read for "pick up where you are"; the page mounts their provider. */
export function GettingStartedPage() {
  return <GoalsProvider><Inner /></GoalsProvider>
}

function Inner() {
  const { state, set, savedIn } = useGuidedPlan()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const today = useMemo(() => new Date(), [])
  const pick = usePickUpFacts(today)
  // An account with plans starts on "pick up where you are"; a new one on the
  // month ahead. A choice the person makes sticks.
  const [chosenRoute, setRoute] = useState<GuideRoute | null>(null)
  const route: GuideRoute = chosenRoute ?? (pick.offer ? 'pickup' : 'month')
  const [stage, setStage] = useState<'path' | 'source'>('path')
  const seasons = readSeasons()
  const wso = readCadenceConfig().weekStartsOn
  const first = ROUTE_STEPS[route][0]
  const choices = useMemo(() => firstStepChoices(first, today, seasons, wso), [first, today, seasons, wso])
  const [periodStart, setPeriodStart] = useState<string | null>(null)
  const chosenStart = periodStart && choices.some((c) => c.start === periodStart) ? periodStart : choices[0].start

  const beginPickUp = async (steps: GuideStep[]) => {
    const s = startPickUp(steps, pick.periods)
    await set(s)
    const step = currentStep(s)
    if (step === 'week' || step === 'month' || step === 'season') writePlanView(step, 'ref')
    navigate(stepPath(step, s))
  }

  const begin = async (withPaper: boolean) => {
    const s = startGuide(route, chosenStart, today, seasons, wso)
    await set(s)
    const step = currentStep(s)
    if (step === 'week' || step === 'month' || step === 'season') writePlanView(step, 'ref')
    if (withPaper) { if (!requestPlanFromPaper()) navigate('/today'); return }
    navigate(stepPath(step, s))
  }

  const showFinish = state?.status === 'finished' && params.get('done') === '1'
  const running = state && (state.status === 'active' || state.status === 'paused') ? state : null

  return (
    <div className={`${PAGE_COLUMN} getting-started-page`}>
      <MastheadCard variant="page"
        eyebrow={<span className="pl-1.5 text-[12px] uppercase tracking-wider text-neutral-500">Plan with guidance</span>}
        title={showFinish ? 'Your plan is ready' : 'What would you like to plan?'}
        subline={showFinish ? undefined : <p className="text-[13px] text-neutral-500">Start with what matters to you, then choose manageable steps for the time ahead. You can look at the bigger picture or just get today sorted.</p>} />

      <section className="getting-started-body">
        {showFinish && state && <FinishSummary state={state} onKeepPlanning={() => navigate('/start')} />}

        {!showFinish && running && (
          <div className="guide-pause" role="status">
            <span>You’re partway through <b>{running.route === 'pickup' ? 'catching up' : ROUTE_CHOICES.find((c) => c.id === running.route)!.title.toLowerCase()}</b>: step {running.current + 1} of {running.steps.length}, {stepShortName(currentStep(running), running, seasons, (d) => weekOfYear(d, wso))}.</span>
            <button type="button" className="pv2-link" onClick={() => { const r = resume(running); void set(r); navigate(stepPath(currentStep(r), r)) }}>Resume</button>
            <button type="button" className="pv2-link pv2-quiet" onClick={() => void set(null)}>Start over</button>
          </div>
        )}

        {!showFinish && stage === 'path' && (
          <>
            {pick.offer && pick.inbox > 0 && (
              <p className="guide-inbox-line">
                <span>{pick.inbox === 1 ? '1 capture in your Inbox isn’t sorted yet.' : `${pick.inbox} captures in your Inbox aren’t sorted yet.`}</span>
                <Link to="/inbox" className="getting-started-link">Sort them first</Link>
              </p>
            )}
            <div className="guide-choices" role="radiogroup" aria-label="What would you like to plan?">
              {ROUTE_CHOICES.filter((c) => c.id !== 'pickup' || pick.offer).map((c) => (
                <label key={c.id} className={`guide-choice${route === c.id ? ' is-selected' : ''}`}>
                  <input type="radio" name="guide-route" value={c.id} checked={route === c.id} onChange={() => { setRoute(c.id); setPeriodStart(null) }} />
                  <span className="guide-choice-title">{c.title}</span>
                  <span className="guide-choice-body">{c.body}</span>
                  {c.id === 'pickup'
                    ? route === 'pickup' && <PickUpReading rows={pick.rows} />
                    : <span className="guide-choice-path">{c.path}</span>}
                </label>
              ))}
            </div>
            <details className="guide-example">
              <summary>How the pieces fit</summary>
              <ol>
                <li>This year: make home work better</li>
                <li>This season: a usable outdoor space</li>
                <li>This month: finish the patio</li>
                <li>This week: choose chairs</li>
                <li>Today: compare the shortlist</li>
              </ol>
              <p>Bigger plans stay in place while smaller steps move them forward. Finishing a step doesn’t finish the plan above it, and you never have to fill in every level — a task can go straight on Today.</p>
            </details>
            <div className="guide-acts">
              <button type="button" className="pv2-btn" onClick={() => setStage('source')}>Continue</button>
              <button type="button" className="pv2-link pv2-quiet" onClick={() => navigate('/today')}>Explore on my own</button>
            </div>
          </>
        )}

        {!showFinish && stage === 'source' && route === 'pickup' && (
          <PickUpPath pick={pick} onBack={() => setStage('path')} onStart={(steps) => void beginPickUp(steps)} savedIn={savedIn} />
        )}

        {!showFinish && stage === 'source' && route !== 'pickup' && (
          <>
            <h2>{first === 'today' ? 'Today' : `Which ${first} are you planning?`}</h2>
            {choices.length > 1 && (
              <div className="guide-choices" role="radiogroup" aria-label={`Which ${first}`}>
                {choices.map((c, k) => (
                  <label key={c.start} className={`guide-choice${chosenStart === c.start ? ' is-selected' : ''}`}>
                    <input type="radio" name="guide-period" value={c.start} checked={chosenStart === c.start} onChange={() => setPeriodStart(c.start)} />
                    <span className="guide-choice-title">{c.label}</span>
                    {k === 0 && <span className="guide-choice-body">{lookAheadWhy(first, choices)}</span>}
                  </label>
                ))}
              </div>
            )}
            {choices.length === 1 && <p>{choices[0].label}.</p>}
            <p>Start from what you already have. Anything already on the plan stays; you can add to it on the page.</p>
            <div className="guide-acts">
              <button type="button" className="pv2-link pv2-quiet" onClick={() => setStage('path')}>Back</button>
              <span className="flex-1" />
              {first !== 'today' && <button type="button" className="pv2-qbtn" onClick={() => void begin(true)}>Photograph a paper plan first</button>}
              <button type="button" className="pv2-btn" onClick={() => void begin(false)}>Start planning</button>
            </div>
            <p className="text-[12px] text-neutral-500">
              {savedIn === 'account' ? 'Your progress is saved to your account, so you can stop and resume on any device.' : 'Your progress is saved in this browser.'}
            </p>
          </>
        )}

        {!showFinish && (
          <>
            <h2>The planning guide</h2>
            <p>Four sheets you can print — a week, a month, a season and a year. The week sheet is the one to start with; none of the others is a prerequisite.</p>
            <p><Link to="/guide" className="getting-started-link">Open the planning guide <ArrowUpRight className="mb-0.5 inline h-3 w-3" /></Link></p>
          </>
        )}
      </section>
    </div>
  )
}

/** Why the first choice is recommended, naming both periods: "September is
 *  nearly over, so October is the one to plan." */
function lookAheadWhy(step: GuideStep, choices: { start: string; label: string }[]): string {
  const name = (c: { start: string; label: string }) => (step === 'month'
    ? parseYmd(c.start).toLocaleDateString('en-US', { month: 'long' })
    : c.label.split(' · ')[0])
  if (choices.length < 2) return ''
  return step === 'month'
    ? `${name(choices[1])} is nearly over, so ${name(choices[0])} is the one to plan.`
    : `${name(choices[0])} starts soon, so it’s the one to plan.`
}

/** What the finished run left: counted from the real lists, not from the run. */
function FinishSummary({ state, onKeepPlanning }: { state: GuideState; onKeepPlanning: () => void }) {
  const navigate = useNavigate()
  const { tasks } = useSupabaseTasks()
  const { getCurrentUserMember } = useFamilyMembers()
  const meId = getCurrentUserMember()?.id ?? null
  const seasons = readSeasons()
  const wso = readCadenceConfig().weekStartsOn
  const now = new Date()
  const weekNo = (d: Date) => weekOfYear(d, wso)
  const line = (step: GuideStep): string => {
    const start = state.periods[step] ? parseYmd(state.periods[step]!) : now
    if (isReview(step)) {
      // What the look-back left: the same lines the page would still ask about.
      const level = pageOf(step) as 'month' | 'season'
      const prev = periodBounds(level, periodBounds(level, start, seasons).prev, seasons)
      const left = closeOutCandidates(selectPeriodTasks(tasks, level, prev.start, isCurrentPeriod(prev, now), meId, seasons), level, prev.start, prev.end).length
      return left ? `${left} still open` : 'Everything decided'
    }
    if (step === 'month' || step === 'season') {
      const b = periodBounds(step, start, seasons)
      const open = selectPeriodTasks(tasks, step, start, isCurrentPeriod(b, now), meId, seasons).filter((t) => !t.completed).length
      return `${open} open ${open === 1 ? 'priority' : 'priorities'}`
    }
    if (step === 'week') {
      const isCurrent = weekStartAnchor(now, wso).getTime() === start.getTime()
      const list = weekListTasks(tasks, start, meId, { isCurrent }).filter((t) => !t.completed)
      const linked = list.filter((t) => t.goalTaskId || t.sourceId).length
      return `${list.length} ${list.length === 1 ? 'step' : 'steps'}${linked ? `, ${linked} linked to a bigger plan` : ''}`
    }
    if (step === 'today') {
      const same = (d?: Date) => !!d && d.toDateString() === now.toDateString()
      const chosen = tasks.filter((t) => !t.completed && (same(t.plannedOn) || same(t.scheduledFor)))
      return chosen.length ? chosen.slice(0, 3).map((t) => t.title).join(' · ') + (chosen.length > 3 ? ` · and ${chosen.length - 3} more` : '') : 'Nothing chosen yet'
    }
    return 'Saved'
  }
  const reached = state.steps.filter((s) => state.done.includes(s))
  const endsOnToday = reached.includes('today')
  const last = reached[reached.length - 1]
  return (
    <div className="guide-finish">
      <dl className="guide-summary">
        {reached.map((s) => (
          <div key={s}><dt>{stepTitle(s, state, seasons, weekNo).split(' · ')[0]}</dt><dd>{line(s)}</dd></div>
        ))}
      </dl>
      <p className="text-[13px] text-neutral-500">Everything above is on its page and stays there. Bigger plans aren’t marked done when a step is.</p>
      <div className="guide-acts">
        {endsOnToday
          ? <button type="button" className="pv2-btn" onClick={() => navigate('/today')}>Open Today</button>
          : last && <button type="button" className="pv2-btn" onClick={() => navigate(stepPath(last, state))}>Open {stepShortName(last, state, seasons, weekNo)}</button>}
        <button type="button" className="pv2-link pv2-quiet" onClick={onKeepPlanning}>Keep planning</button>
      </div>
    </div>
  )
}

const CHIP_CLASS: Record<PickUpRow['chip'], string> = {
  'In place': 'is-ok', 'Look back': 'is-back', 'Plan it': 'is-go', Optional: 'is-ok', 'Check it': 'is-go', Choose: 'is-go',
}

/** What each level holds now — the reading the suggested steps come from. */
function PickUpReading({ rows }: { rows: PickUpRow[] }) {
  return (
    <span className="guide-reading">
      {rows.map((r) => (
        <span key={r.step} className="guide-reading-row">
          <span className="guide-reading-name">{r.name}</span>
          <span className="guide-reading-detail">{r.detail}</span>
          <span className={`guide-chip ${CHIP_CLASS[r.chip]}`}>{r.chip}</span>
        </span>
      ))}
    </span>
  )
}

/** The suggested path: each step with its reason, any of them can be left out. */
function PickUpPath({ pick, onBack, onStart, savedIn }: {
  pick: PickUp; onBack: () => void; onStart: (steps: GuideStep[]) => void; savedIn: 'account' | 'device'
}) {
  const offered = pick.rows.filter((r) => r.inPath)
  const kept = pick.rows.filter((r) => !r.inPath)
  const [on, setOn] = useState<Partial<Record<GuideStep, boolean>>>(() => Object.fromEntries(offered.map((r) => [r.step, r.on])))
  const steps = offered.filter((r) => on[r.step]).map((r) => r.step)
  const words = ['', 'One step', 'Two steps', 'Three steps', 'Four steps', 'Five steps', 'Six steps', 'Seven steps']
  return (
    <>
      <h2>Here’s what needs you</h2>
      <p>{steps.length ? `${words[steps.length]}.` : 'No steps chosen.'} Uncheck any you’d rather skip.</p>
      <ul className="guide-steps">
        {offered.map((r) => (
          <li key={r.step}>
            <label>
              <input type="checkbox" checked={!!on[r.step]} onChange={(e) => setOn((x) => ({ ...x, [r.step]: e.target.checked }))} />
              <span>
                <span className="guide-step-name">{r.step === 'today' ? 'Choose today' : r.step === 'week' ? `Check ${r.name.toLowerCase()}` : isReview(r.step) ? r.name : `Plan ${r.name}`}</span>
                <span className="guide-step-why">{r.why}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {kept.length > 0 && (
        <p className="text-[13px] text-neutral-500">
          Already in place, so no step is needed: {kept.map((r) => `${r.name} (${r.detail.toLowerCase()})`).join(', ')}.
        </p>
      )}
      <div className="guide-acts">
        <button type="button" className="pv2-link pv2-quiet" onClick={onBack}>Back</button>
        <span className="flex-1" />
        <button type="button" className="pv2-btn" disabled={!steps.length} onClick={() => onStart(steps)}>Start</button>
      </div>
      <p className="text-[12px] text-neutral-500">
        {savedIn === 'account' ? 'Your progress is saved to your account, so you can stop and resume on any device.' : 'Your progress is saved in this browser.'}
      </p>
    </>
  )
}
