// claritySteps — the engine behind the Clarity curtain.
//
// Given a calm read of your current state, it returns the ordered steps to get
// clear, marking which are already settled, which is the *next move*, and which
// are still ahead. A warm guide, not a gate: it never blocks anything, it just
// points at the one thing to do next. The signal set is intentionally swappable
// — these four are the starting illustration, not the final law.

export type ClarityStepId = 'inbox' | 'carried' | 'plan' | 'review'
export type ClarityStepStatus = 'done' | 'next' | 'todo'

export interface ClarityStep {
  id: ClarityStepId
  title: string
  detail: string
  actionLabel: string
  status: ClarityStepStatus
}

export interface ClaritySignals {
  /** Untriaged inbox items. */
  inboxCount: number
  /** Carried-over / overdue items not yet resolved. */
  overdueCount: number
  /** Items waiting to be placed into today (week pool + untimed routines due today). */
  placeableCount: number
  /** True in the evening, when closing the day becomes relevant. */
  isEvening: boolean
}

interface StepDef {
  id: ClarityStepId
  title: string
  actionLabel: string
  met: boolean
  detail: string
}

export interface ClarityResult {
  steps: ClarityStep[]
  /** True when nothing needs attention — the warm "you're clear" rest state. */
  allClear: boolean
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

/** Compute the ordered clarity steps + whether everything is settled. */
export function computeClaritySteps(s: ClaritySignals): ClarityResult {
  const defs: StepDef[] = [
    {
      id: 'inbox',
      title: 'Process your inbox',
      actionLabel: 'Open inbox',
      met: s.inboxCount === 0,
      detail: s.inboxCount === 0 ? 'Inbox is clear' : `${s.inboxCount} ${plural(s.inboxCount, 'item')} to triage`,
    },
    {
      id: 'carried',
      title: 'Resolve carried-over items',
      actionLabel: 'Review carried over',
      met: s.overdueCount === 0,
      detail: s.overdueCount === 0 ? 'Nothing carried over' : `${s.overdueCount} ${plural(s.overdueCount, 'item')} carried over`,
    },
    {
      id: 'plan',
      title: 'Plan your day',
      actionLabel: 'Plan your day',
      met: s.placeableCount === 0,
      detail: s.placeableCount === 0 ? 'Your day is placed' : `${s.placeableCount} ${plural(s.placeableCount, 'item')} to place`,
    },
  ]

  // Review only becomes relevant once the day is winding down.
  if (s.isEvening) {
    defs.push({
      id: 'review',
      title: 'Review & close the day',
      actionLabel: 'Review the day',
      met: false,
      detail: 'Reflect and prep for tomorrow',
    })
  }

  // First unmet step is the "next move"; remaining unmet are "todo"; met are "done".
  let nextAssigned = false
  const steps: ClarityStep[] = defs.map((d) => {
    let status: ClarityStepStatus
    if (d.met) status = 'done'
    else if (!nextAssigned) { status = 'next'; nextAssigned = true }
    else status = 'todo'
    return { id: d.id, title: d.title, detail: d.detail, actionLabel: d.actionLabel, status }
  })

  return { steps, allClear: !nextAssigned }
}
