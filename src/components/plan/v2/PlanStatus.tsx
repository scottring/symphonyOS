// src/components/plan/v2/PlanStatus.tsx
//
// The planning bar every horizon wears (Week, Month, Season, Year): one
// "Plan <period>" action, the plan's status, the bar shown while planning,
// and the line a save leaves behind naming what was saved and what could come
// next. Beta walkthrough 2026-09-29: "Plan your week" and "Weekly review"
// opened the same thing under two names, a save said nothing about what to do
// next, and an open review still told you to start the review.
import type { ReactNode } from 'react'

export interface NextStep { label: string; onClick: () => void }

export function PlanToolbar({ period, saved, loading, error, agreedBy, reviewDue, onPlan, onRetry, viewSwitch, tools }: {
  /** "week 40", "October", "Fall", "2026" */
  period: string
  saved: { at: Date } | null
  loading: boolean
  /** The agreed-plan record could not be read: don't claim "no plan", and
   *  don't offer a save that could overwrite what is there. */
  error: boolean
  agreedBy: string | null
  reviewDue: boolean
  onPlan: () => void
  onRetry: () => void
  viewSwitch?: ReactNode
  tools?: ReactNode
}) {
  const day = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const prominent = !error && !loading && (!saved || reviewDue)
  return (
    <div className="pv2-toolbar">
      <div className="pv2-status">
        {error
          ? <span className="pv2-noplan"><span className="pv2-hint">Couldn’t check whether this plan was agreed.</span>
            <button type="button" className="pv2-link" onClick={onRetry}>Try again</button></span>
          : saved
            ? <><span className="pv2-seal" aria-hidden="true" /><span><b>Our {period} plan</b> · agreed {day(saved.at)} · {agreedBy}</span></>
            : loading ? null : <span className="pv2-hint">{`No ${period} plan yet`}</span>}
      </div>
      {tools}
      {viewSwitch}
      <button type="button" className={prominent ? 'pv2-btn' : 'pv2-qbtn'} onClick={onPlan} disabled={error}>Plan {period}</button>
    </div>
  )
}

export function PlanMeetingBar({ period, prevName, step, lookBack, why, onStep, viewSwitch, onLeave, onSave, saveLabel }: {
  period: string
  prevName: string
  step: 1 | 2
  /** Last period left open lines: the bar offers "Look back" first. */
  lookBack: boolean
  /** What this step is for, in a sentence. */
  why: string
  onStep: (s: 1 | 2) => void
  viewSwitch?: ReactNode
  onLeave: () => void
  onSave: () => void
  saveLabel: string
}) {
  return (
    <div className="pv2-sbar" role="region" aria-label={`Planning ${period}`}>
      <span className="pv2-st">Planning<small>{period}</small></span>
      {lookBack ? (
        <div className="pv2-steps">
          <button type="button" aria-current={step === 1 ? 'step' : undefined} onClick={() => onStep(1)}><b>1</b>Look back at {prevName}</button>
          <button type="button" aria-current={step === 2 ? 'step' : undefined} onClick={() => onStep(2)}><b>2</b>Plan {period}</button>
        </div>
      ) : <span className="flex-1" />}
      {viewSwitch}
      <button type="button" className="pv2-link pv2-quiet" onClick={onLeave}>Leave for now</button>
      <button type="button" className="pv2-btn" onClick={onSave}>{saveLabel}</button>
      <p className="pv2-sbar-why" aria-live="polite">{why}</p>
    </div>
  )
}

/** Left behind by a save until dismissed: what was saved, where it lives, and
 *  one optional next step. */
export function PlanSavedLine({ title, detail, next, onDone }: {
  title: string
  detail: string
  next?: NextStep | null
  onDone: () => void
}) {
  return (
    <div className="pv2-saved" role="status">
      <span className="pv2-seal" aria-hidden="true" />
      <span className="pv2-saved-text"><b>{title}</b> {detail}</span>
      {next && <button type="button" className="pv2-btn" onClick={next.onClick}>{next.label}</button>}
      <button type="button" className="pv2-link pv2-quiet" onClick={onDone}>Done for now</button>
    </div>
  )
}

