// src/components/plan/v2/PlanStatus.tsx
//
// The planning bar every horizon wears (Week, Month, Season, Year): one
// "Plan <period>" action, the plan's status, the bar shown while planning,
// and the line a save leaves behind naming what was saved and what could come
// next. Beta walkthrough 2026-09-29: "Plan your week" and "Weekly review"
// opened the same thing under two names, a save said nothing about what to do
// next, and an open review still told you to start the review.
import type { ReactNode } from 'react'
import { GuideAnchor, useGuideRunning } from '@/components/guide/GuideBar'

export interface NextStep { label: string; onClick: () => void }

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase())

export interface PlanToolbarProps {
  /** "week 40", "October", "Fall", "2026" */
  period: string
  saved: { at: Date } | null
  loading: boolean
  /** The plan record could not be read: don't claim "not planned", and
   *  don't offer a save that could overwrite what is there. */
  error: boolean
  agreedBy: string | null
  reviewDue: boolean
  /** Opens the look-back (only offered while there is one: `lookBack`). */
  onPlan: () => void
  onRetry: () => void
  /** The period before, when it left open work to decide: the button opens
   *  the look-back. Without one there is nothing for a separate planning
   *  screen to add, so marking planned is one tap here (walkthrough
   *  2026-10-02 #7/#9: "Plan 2026" opened the same page under a white bar,
   *  three screens for three presses). */
  lookBack?: string | null
  /** Mark the period planned in place. */
  onMark?: () => void
  /** A period planned in steps (Week, 2026-10-04): one button that opens the
   *  session — "Plan the week" — the look-back being its first step. */
  planLabel?: string
  /** The list already has lines: "not marked planned yet", not "not planned". */
  hasLines?: boolean
  viewSwitch?: ReactNode
  tools?: ReactNode
  /** Just marked planned. The masthead keeps only the status; the next step
   *  gets its own line under it (PlanSavedLine) — six things on one line
   *  crowded the title (walkthrough 2026-10-02 #8/#15). */
  justSaved?: { detail: string; next?: NextStep | null; onDone: () => void } | null
}

/** Where the plan stands — "Week 40 isn't planned yet", "October planned ·
 *  …". The inside of the toolbar's status, or the masthead's subline. */
function statusText({ period, saved, loading, error, agreedBy, onRetry, hasLines }: PlanToolbarProps) {
  const day = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  // "· you" read as a stray word; only someone else's name says anything.
  const by = agreedBy && agreedBy !== 'you' ? ` by ${agreedBy}` : ''
  return error
    ? <span className="pv2-noplan"><span className="pv2-hint">Couldn’t check whether {period} is planned.</span>
      <button type="button" className="pv2-link" onClick={onRetry}>Try again</button></span>
    : saved
      ? <><span className="pv2-seal" aria-hidden="true" /><span><b>{cap(period)} planned</b> {day(saved.at)}{by}</span></>
      : loading ? null : <span className="pv2-hint">{hasLines ? `${cap(period)} isn’t marked planned yet` : `${cap(period)} isn’t planned yet`}</span>
}

/** The page's tools, the view icons and one verb: "Look back at <prev>"
 *  while the last period left open work, else "Mark <period> planned" until
 *  it is. A just-saved period's next step is PlanSavedLine's, not this row's. */
function controlsOf({ period, saved, loading, error, onPlan, onMark, lookBack, viewSwitch, tools, justSaved, planLabel }: PlanToolbarProps, guided: boolean) {
  const verb = guided || justSaved || loading || error ? null
    : planLabel ? <button type="button" className={saved ? 'pv2-qbtn' : 'pv2-btn'} onClick={onPlan}>{saved ? 'Plan again' : planLabel}</button>
    : lookBack ? <button type="button" className="pv2-btn" onClick={onPlan}>Look back at {lookBack}</button>
      : !saved && onMark ? <button type="button" className="pv2-btn" onClick={onMark}>Mark {period} planned</button>
        : null
  return <>
    {tools}
    {viewSwitch}
    {verb}
  </>
}

/** The line a save leaves under the masthead: that it is planned, and the one
 *  next step down the chain (or back to Today). */
export function PlanSavedLine({ period, justSaved }: { period: string; justSaved: PlanToolbarProps['justSaved'] }) {
  const guided = useGuideRunning()
  if (!justSaved || guided) return null
  return (
    <div className="pv2-saved" role="status">
      <span className="pv2-saved-text"><b>{cap(period)} is planned.</b>{justSaved.detail ? ` ${justSaved.detail}` : ''}</span>
      {justSaved.next && <button type="button" className="pv2-btn" onClick={justSaved.next.onClick}>{justSaved.next.label} →</button>}
      <button type="button" className="pv2-link pv2-quiet" onClick={justSaved.onDone}>Not now</button>
    </div>
  )
}

export function PlanToolbar(props: PlanToolbarProps) {
  // While a guided plan runs, the guide asks the question and marks the
  // period planned; the page's own status and "Plan …" button said the same
  // thing a second time (walkthrough 2026-09-30). The views stay.
  const guided = useGuideRunning()
  return (
    <>
    <GuideAnchor />
    <div className={`pv2-toolbar${guided ? ' is-guided' : ''}`}>
      {guided ? <div className="pv2-status" /> : <div className="pv2-status">{statusText(props)}</div>}
      {controlsOf(props, guided)}
    </div>
    <PlanSavedLine period={props.period} justSaved={props.justSaved} />
    </>
  )
}

// Desktop folds the control row into the masthead (layout system,
// 2026-10-01; docs/design-system/LAYOUT-SYSTEM.md §3): the status becomes
// the masthead's subline and the controls sit at the title's right. Phones
// keep the row (PlanToolbar). The page still mounts <GuideAnchor /> where
// the row stood, so a guided plan opens under the heading as before.

/** The toolbar's status, as the masthead's subline. */
export function PlanToolbarStatus(props: PlanToolbarProps) {
  const guided = useGuideRunning()
  if (guided) return null
  return <div className="pv2-status pv2-mstatus">{statusText(props)}</div>
}

/** The toolbar's controls, in the masthead's controls slot. */
export function PlanToolbarControls(props: PlanToolbarProps) {
  const guided = useGuideRunning()
  return <div className={`pv2-mcontrols${guided ? ' is-guided' : ''}`}>{controlsOf(props, guided)}</div>
}


/** One step of a planning session (Week's four, 2026-10-03). */
export interface MeetingStep { key: string; label: string }

export function PlanMeetingBar({ period, prevName, step, lookBack, why, onStep, viewSwitch, tools, onLeave, onSave, saveLabel, steps, stepKey, onStepKey }: {
  period: string
  prevName: string
  step: 1 | 2
  /** Last period left open lines: the bar offers "Look back" first. */
  lookBack: boolean
  /** What this step is for, in a sentence. */
  why: string
  onStep: (s: 1 | 2) => void
  viewSwitch?: ReactNode
  /** The page's own controls (area, assistant…), as in the toolbar. */
  tools?: ReactNode
  onLeave: () => void
  onSave: () => void
  saveLabel: string
  /** A session in named steps (Scott, 2026-10-03: "more obviously
   *  sequential"). Without it, the two-step look back / plan bar. */
  steps?: MeetingStep[]
  stepKey?: string
  onStepKey?: (key: string) => void
}) {
  if (steps && stepKey && onStepKey) {
    const i = Math.max(0, steps.findIndex((s) => s.key === stepKey))
    const last = i === steps.length - 1
    return (
      <div className="pv2-sbar" role="region" aria-label={`Planning ${period}`}>
        <span className="pv2-st">Planning<small>{period}</small></span>
        <div className="pv2-steps">
          {steps.map((s, n) => (
            <button key={s.key} type="button" aria-current={n === i ? 'step' : undefined} onClick={() => onStepKey(s.key)}><b>{n + 1}</b>{s.label}</button>
          ))}
        </div>
        {tools}
        {viewSwitch}
        <button type="button" className="pv2-link pv2-quiet" onClick={onLeave}>Leave for now</button>
        {i > 0 && <button type="button" className="pv2-qbtn" onClick={() => onStepKey(steps[i - 1].key)}>← Back</button>}
        {/* One primary at a time (walkthrough 2026-10-04 #6): Next on every
            step, marking planned only on the last. */}
        {!last && <button type="button" className="pv2-btn" onClick={() => onStepKey(steps[i + 1].key)}>Next: {steps[i + 1].label} →</button>}
        {last && <button type="button" className="pv2-btn" onClick={onSave}>{saveLabel}</button>}
        <p className="pv2-sbar-why" aria-live="polite">{why}</p>
      </div>
    )
  }
  return (
    <div className="pv2-sbar" role="region" aria-label={`Planning ${period}`}>
      <span className="pv2-st">Planning<small>{period}</small></span>
      {lookBack ? (
        <div className="pv2-steps">
          <button type="button" aria-current={step === 1 ? 'step' : undefined} onClick={() => onStep(1)}><b>1</b>Look back at {prevName}</button>
          <button type="button" aria-current={step === 2 ? 'step' : undefined} onClick={() => onStep(2)}><b>2</b>Plan {period}</button>
        </div>
      ) : <span className="flex-1" />}
      {tools}
      {viewSwitch}
      <button type="button" className="pv2-link pv2-quiet" onClick={onLeave}>Leave for now</button>
      {/* During the look-back the verdicts are the step's buttons; marking
          planned stays reachable but quiet (walkthrough 2026-10-02 #29). */}
      <button type="button" className={step === 1 && lookBack ? 'pv2-qbtn' : 'pv2-btn'} onClick={onSave}>{saveLabel}</button>
      <p className="pv2-sbar-why" aria-live="polite">{why}{step === 2 ? ` Edits save as you go. When it looks right, choose “${saveLabel}.”` : ''}</p>
    </div>
  )
}
