// src/components/plan/PlanNextLine.tsx
//
// One "Plan <next> →" line, shared by the four save banners (month, season,
// year and week). Guidance only: the link navigates, it never writes — the
// same rule as `PlanningNudge` — and it is always paired with a muted
// "optional" so nobody reads it as a step they owe.

import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'

export interface PlanNextLineProps {
  /** What just saved, e.g. "September" or "The week" — used in the sentence. */
  planned: string
  /** Copy sentence after "{planned} is planned." — the week's own reminder. */
  message: string
  /** The rung being offered, e.g. "the week" or "today" — for the link text. */
  nextLabel: string
  /** The link text, when it differs from `Plan {nextLabel} →` (the week keeps "Go to Today →"). */
  cta?: string
  to: string
  onDismiss?: () => void
}

export function PlanNextLine({ planned, message, nextLabel, cta, to, onDismiss }: PlanNextLineProps) {
  return (
    <div role="status" className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-sage-50 px-3 py-2 text-sm text-neutral-700">
      <span className="min-w-0 flex-1">
        <Check className="mb-0.5 mr-1 inline h-4 w-4 text-sage-600" />
        {planned} is planned. {message}{' '}
        <Link to={to} className="font-semibold text-primary-700">{cta ?? `Plan ${nextLabel} →`}</Link>{' '}
        <span className="text-neutral-400">optional</span>
      </span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 text-neutral-400 transition-colors hover:text-neutral-600">
          Not now
        </button>
      )}
    </div>
  )
}
