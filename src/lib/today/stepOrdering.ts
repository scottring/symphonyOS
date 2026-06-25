import type { Routine } from '@/types/actionable'
import { arrayMove } from '@dnd-kit/sortable'

/** The step_order to assign a newly added step in this collection. */
export function nextStepOrder(steps: Routine[]): number {
  const orders = steps.map(s => s.step_order).filter((o): o is number => o != null)
  if (orders.length === 0) return steps.length
  return Math.max(...orders) + 1
}

/** Assign gap-free 0..n-1 step_order in the given id order. */
export function normalizeStepOrders(orderedIds: string[]): { id: string; step_order: number }[] {
  return orderedIds.map((id, i) => ({ id, step_order: i }))
}

/** Move activeId into overId's position (arrayMove) and return normalized writes for all steps. */
export function reorderByDrag(
  orderedSteps: Routine[],
  activeId: string,
  overId: string,
): { id: string; step_order: number }[] {
  const ids = orderedSteps.map(s => s.id)
  const from = ids.indexOf(activeId)
  const to = ids.indexOf(overId)
  if (from === -1 || to === -1) return normalizeStepOrders(ids)
  return normalizeStepOrders(arrayMove(ids, from, to))
}
