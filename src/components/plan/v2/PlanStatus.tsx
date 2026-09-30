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

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase())

export function PlanToolbar({ period, saved, loading, error, agreedBy, reviewDue, onPlan, onRetry, viewSwitch, tools, justSaved }: {
  /** "week 40", "October", "Fall", "2026" */
  period: string
  saved: { at: Date } | null
  loading: boolean
  /** The plan record could not be read: don't claim "not planned", and
   *  don't offer a save that could overwrite what is there. */
  error: boolean
  agreedBy: string | null
  reviewDue: boolean
  onPlan: () => void
  onRetry: () => void
  viewSwitch?: ReactNode
  tools?: ReactNode
  /** Just marked planned: the same row says what it holds and offers the
   *  next step in place of the Plan button (Scott, 2026-09-30: the saved
   *  card and the status row said one thing twice). */
  justSaved?: { detail: string; next?: NextStep | null; onDone: () => void } | null
}) {
  const day = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const prominent = !error && !loading && (!saved || reviewDue)
  return (
    <div className="pv2-toolbar" role={justSaved ? 'status' : undefined}>
      <div className="pv2-status">
        {error
          ? <span className="pv2-noplan"><span className="pv2-hint">Couldn’t check whether {period} is planned.</span>
            <button type="button" className="pv2-link" onClick={onRetry}>Try again</button></span>
          : saved
            ? <><span className="pv2-seal" aria-hidden="true" /><span><b>{cap(period)} planned</b> · {day(saved.at)} · {agreedBy}{justSaved?.detail ? <> · {justSaved.detail}</> : null}</span></>
            : loading ? null : <span className="pv2-hint">{`${cap(period)} isn’t planned yet`}</span>}
      </div>
      {tools}
      {viewSwitch}
      {justSaved
        ? <>
            {justSaved.next && <button type="button" className="pv2-btn" onClick={justSaved.next.onClick}>{justSaved.next.label}</button>}
            <button type="button" className="pv2-link pv2-quiet" onClick={justSaved.onDone}>Done for now</button>
          </>
        : <button type="button" className={prominent ? 'pv2-btn' : 'pv2-qbtn'} onClick={onPlan} disabled={error}>Plan {period}</button>}
    </div>
  )
}

export function PlanMeetingBar({ period, prevName, step, lookBack, why, onStep, viewSwitch, tools, onLeave, onSave, saveLabel }: {
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
      {tools}
      {viewSwitch}
      <button type="button" className="pv2-link pv2-quiet" onClick={onLeave}>Leave for now</button>
      <button type="button" className="pv2-btn" onClick={onSave}>{saveLabel}</button>
      <p className="pv2-sbar-why" aria-live="polite">{why}{step === 2 ? ` Your changes are already saved; “${saveLabel}” records that ${period} is planned.` : ''}</p>
    </div>
  )
}
