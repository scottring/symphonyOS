// src/lib/planCommit.ts
//
// Splitting a reviewed plan page into writes. A line the matcher recognised
// re-places the task that already exists; everything else is a new task. A
// match already sitting where the page puts it is neither — skipping it keeps
// the toast honest and avoids a pointless write.

import type { Task } from '@/types/task'
import {
  placementsEqual,
  planItemToAddTaskArgs,
  planItemToUpdateArgs,
  type PlanAddTaskArgs,
  type PlanCommitContext,
  type PlanItem,
} from '@/lib/planParse'

export interface PlanCommitPlan {
  adds: PlanAddTaskArgs[]
  moves: { taskId: string; updates: Partial<Task> }[]
  skipped: number
}

export function buildCommitPlan(items: PlanItem[], ctx: PlanCommitContext): PlanCommitPlan {
  const plan: PlanCommitPlan = { adds: [], moves: [], skipped: 0 }
  for (const item of items) {
    if (!item.existing) {
      plan.adds.push(planItemToAddTaskArgs(item, ctx))
    } else if (placementsEqual(item.existing.placement, item.placement)) {
      plan.skipped++
    } else {
      plan.moves.push({ taskId: item.existing.taskId, updates: planItemToUpdateArgs(item, ctx) })
    }
  }
  return plan
}

/**
 * How many of the attempted writes actually landed. The commit site drives
 * `addTask`/`updateTask` for every entry in a `PlanCommitPlan` and folds the
 * real per-write outcome (an `addTask` that resolved a truthy id, an
 * `updateTask` that resolved `true`) into this shape — never the attempted
 * count. Attempted-but-rejected writes (e.g. a shared task this user cannot
 * write) must not be reported as done.
 */
export interface PlanCommitOutcome {
  addsAttempted: number
  addsSucceeded: number
  movesAttempted: number
  movesSucceeded: number
  skipped: number
}

export interface PlanCommitMessage {
  /** Toast text for what landed, or null when there is nothing to report. */
  success: string | null
  /** Toast text for what a rejected write did NOT do, or null when nothing failed. */
  failure: string | null
}

/**
 * Compose the two commit toasts from real outcomes. Kept separate from the
 * component so a rejected write's count is provably reflected in the message
 * — the bug this function exists to prevent is a toast that claims a write
 * happened because it was attempted, not because it succeeded.
 */
export function describeCommitOutcome(outcome: PlanCommitOutcome): PlanCommitMessage {
  const addsFailed = outcome.addsAttempted - outcome.addsSucceeded
  const movesFailed = outcome.movesAttempted - outcome.movesSucceeded

  const successParts: string[] = []
  if (outcome.addsSucceeded > 0) {
    successParts.push(`Added ${outcome.addsSucceeded} task${outcome.addsSucceeded === 1 ? '' : 's'}`)
  }
  if (outcome.movesSucceeded > 0) successParts.push(`moved ${outcome.movesSucceeded}`)
  if (outcome.skipped > 0) successParts.push(`${outcome.skipped} already in place`)
  const success = successParts.length ? `${successParts.join(', ')} from your plan` : null

  const failureParts: string[] = []
  if (addsFailed > 0) failureParts.push(`add ${addsFailed}`)
  if (movesFailed > 0) failureParts.push(`move ${movesFailed}`)
  const totalFailed = addsFailed + movesFailed
  const failure = failureParts.length
    ? `Couldn't ${failureParts.join(' or ')} task${totalFailed === 1 ? '' : 's'} from your plan`
    : null

  return { success, failure }
}
