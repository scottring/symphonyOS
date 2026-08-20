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
