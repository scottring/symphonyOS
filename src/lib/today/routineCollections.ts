import type { Routine, RoutineWithSteps, ActionableInstance } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import { routineToTimelineItem } from '@/types/timeline'
import { expandRoutineDoses, routineStatusKey } from './doseExpansion'

function stepSort(a: Routine, b: Routine): number {
  const ao = a.step_order, bo = b.step_order
  if (ao != null && bo != null && ao !== bo) return ao - bo
  if (ao != null && bo == null) return -1
  if (ao == null && bo != null) return 1
  const at = a.time_of_day ?? '', bt = b.time_of_day ?? ''
  if (at !== bt) return at < bt ? -1 : 1
  return a.name.localeCompare(b.name)
}

/** Partition a flat routine list into collections (with ordered steps) + standalone routines. */
export function groupRoutineSteps(routines: Routine[]): { collections: RoutineWithSteps[]; standalone: Routine[] } {
  const stepsByParent = new Map<string, Routine[]>()
  for (const r of routines) {
    if (r.parent_routine_id) {
      const arr = stepsByParent.get(r.parent_routine_id) ?? []
      arr.push(r)
      stepsByParent.set(r.parent_routine_id, arr)
    }
  }
  const collections: RoutineWithSteps[] = []
  const standalone: Routine[] = []
  for (const r of routines) {
    if (r.parent_routine_id) continue // it's a step, lives under its parent
    const steps = stepsByParent.get(r.id)
    if (steps && steps.length > 0) {
      collections.push({ ...r, steps: [...steps].sort(stepSort) })
    } else {
      standalone.push(r)
    }
  }
  return { collections, standalone }
}

export function buildCollectionItem(
  collection: RoutineWithSteps,
  viewedDate: Date,
  routineStatusMap: Map<string, ActionableInstance>,
): TimelineItem {
  const stepItems: TimelineItem[] = []
  let earliest: { time: string; stepId: string; stepName: string; doseSlot: number | null } | null = null
  let nextUp: { time: string | null; stepId: string; stepName: string; doseSlot: number | null } | null = null
  let total = 0
  let done = 0

  for (const step of collection.steps) {
    for (const dose of expandRoutineDoses(step)) {
      total += 1
      const item = routineToTimelineItem(step, viewedDate)
      item.id = dose.slotId
      if (dose.time) {
        const [h, m] = dose.time.split(':').map(Number)
        const start = new Date(viewedDate)
        start.setHours(h, m, 0, 0)
        item.startTime = start
      }
      const completed = routineStatusMap.get(routineStatusKey(step.id, dose.slotIndex))?.status === 'completed'
      if (completed) { item.completed = true; done += 1 }
      stepItems.push(item)

      if (dose.time && (!earliest || dose.time < earliest.time)) {
        earliest = { time: dose.time, stepId: step.id, stepName: step.name, doseSlot: dose.slotIndex }
      }
      if (!completed && dose.time && (!nextUp || nextUp.time == null || dose.time < nextUp.time)) {
        nextUp = { time: dose.time, stepId: step.id, stepName: step.name, doseSlot: dose.slotIndex }
      }
    }
  }

  const allDone = total > 0 && done === total
  const anchor = nextUp?.time ?? earliest?.time ?? null
  let startTime: Date | null = null
  if (anchor) {
    const [h, m] = anchor.split(':').map(Number)
    startTime = new Date(viewedDate)
    startTime.setHours(h, m, 0, 0)
  }

  return {
    id: `routine-collection-${collection.id}`,
    type: 'routine-collection',
    title: collection.name,
    startTime,
    endTime: null,
    completed: allDone,
    context: collection.context,
    assignedTo: collection.assigned_to,
    originalRoutine: collection,
    collectionProgress: { done, total },
    collectionNextUp: nextUp
      ? { stepId: nextUp.stepId, stepName: nextUp.stepName, time: nextUp.time, doseSlot: nextUp.doseSlot }
      : undefined,
    steps: stepItems,
  }
}
