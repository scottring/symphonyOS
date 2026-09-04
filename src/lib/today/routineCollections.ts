import type { Routine, RoutineWithSteps, ActionableInstance } from '@/types/actionable'
import type { TimelineItem, CollectionDose, CollectionStepGroup } from '@/types/timeline'
import { expandRoutineDoses, routineStatusKey } from './doseExpansion'
import { stepAppliesOnDate } from './stepSchedule'

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
  const collectionSteps: CollectionStepGroup[] = []
  let earliest: { time: string; stepId: string; stepName: string; doseSlot: number | null } | null = null
  let nextUp: { time: string | null; stepId: string; stepName: string; doseSlot: number | null } | null = null
  let total = 0
  let done = 0

  // One entry per exercise (step); its doses are grouped so the name shows once
  // instead of once per dose.
  let resolved = 0

  const applicableSteps = collection.steps.filter(step => stepAppliesOnDate(step, viewedDate))
  for (const step of applicableSteps) {
    const doses: CollectionDose[] = []
    let stepDone = 0
    for (const dose of expandRoutineDoses(step)) {
      total += 1
      const status = routineStatusMap.get(routineStatusKey(step.id, dose.slotIndex))?.status
      const completed = status === 'completed'
      const skipped = status === 'skipped'
      if (completed) { done += 1; stepDone += 1 }
      // Skipped doses are RESOLVED: they don't count toward "done" but they
      // release the anchor, so the block rolls on to the next real dose
      // instead of pinning at a slot you've explicitly let go of.
      if (completed || skipped) resolved += 1
      doses.push({ id: dose.slotId, time: dose.time, completed, skipped })

      if (dose.time && (!earliest || dose.time < earliest.time)) {
        earliest = { time: dose.time, stepId: step.id, stepName: step.name, doseSlot: dose.slotIndex }
      }
      if (!completed && !skipped && dose.time && (!nextUp || nextUp.time == null || dose.time < nextUp.time)) {
        nextUp = { time: dose.time, stepId: step.id, stepName: step.name, doseSlot: dose.slotIndex }
      }
    }
    collectionSteps.push({ stepId: step.id, name: step.name, progress: { done: stepDone, total: doses.length }, doses })
  }

  // The day is finished when every dose is resolved (done or skipped), even
  // if some were skipped — a skipped 7am shouldn't hold the whole block open.
  const allDone = total > 0 && resolved === total
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
    collectionSteps,
  }
}

/**
 * Count routines the way the timeline draws them, for the Today progress band.
 *
 * The scoreboard ("N of M done") is only honest if M is the number of routine
 * ROWS on screen. A flat `routines.length` is a different population entirely:
 * a collection is one row but many rows in the table, a dosed routine is many
 * rows but one row in the table, and a step whose parent isn't on today renders
 * nowhere at all. This mirrors buildGroupedSections' partition exactly — same
 * `match` filter, same groupRoutineSteps split, same per-dose expansion, same
 * collection completion rule — so the two can't drift.
 *
 * Resolved-but-not-done (skipped) units leave the pool rather than counting as
 * wins: skipping is how you take work off the day, and a skipped routine left in
 * the denominator would keep the bar from ever reaching 100%. This is the same
 * rule buildCollectionItem already applies to a collection's own doses.
 */
export function countRoutineUnits(
  routines: Routine[],
  viewedDate: Date,
  routineStatusMap: Map<string, ActionableInstance>,
  _match: (assignedTo: string | null | undefined, assignedToAll?: readonly string[] | null) => boolean,
): { actionable: number; completed: number } {
  // Assignee matching now happens upstream in selectVisibleRoutines (rung 5).
  const { collections, standalone } = groupRoutineSteps(routines)

  let actionable = 0
  let completed = 0

  for (const routine of standalone) {
    for (const dose of expandRoutineDoses(routine)) {
      const status = routineStatusMap.get(routineStatusKey(routine.id, dose.slotIndex))?.status
      if (status === 'skipped') continue // resolved — off the day, not a win
      actionable += 1
      if (status === 'completed') completed += 1
    }
  }

  for (const collection of collections) {
    const item = buildCollectionItem(collection, viewedDate, routineStatusMap)
    // A collection with no steps applicable today draws nothing.
    if ((item.collectionProgress?.total ?? 0) === 0) continue
    actionable += 1
    if (item.completed) completed += 1
  }

  return { actionable, completed }
}

/**
 * Count routine units already sitting in a rendered section's item list (e.g.
 * the Unscheduled/"Anytime" band). Reads the SAME TimelineItem[] the timeline
 * would draw if the section were expanded — one row per routine-collection
 * item, one row per standalone dose — instead of re-deriving the population
 * from raw routines a second time.
 *
 * This shares exactly two rules with countRoutineUnits above, both applied
 * here against the item rather than re-computed from the routine:
 *   1. a skipped unit is resolved and leaves the pool, not counted as a loss
 *      (item.skipped here ↔ status === 'skipped' there);
 *   2. a collection with no steps applicable today draws nothing and is
 *      excluded entirely (item.collectionProgress.total === 0 here ↔
 *      item.collectionProgress.total === 0 there — same field, same check).
 * Sharing rules by hand, not by a single shared code path, is exactly the
 * kind of thing that drifts silently — that is why
 * `countRoutineUnits agrees with countRoutineRowUnits` in
 * routineCollections.test.ts runs both functions over the same routine set
 * (including an empty-collection day) and asserts the two figures match, so
 * a future edit to one side that breaks parity fails a test, not a review.
 */
export function countRoutineRowUnits(items: TimelineItem[]): { done: number; total: number } {
  let total = 0
  let done = 0
  for (const item of items) {
    if (item.type !== 'routine' && item.type !== 'routine-collection') continue
    if (item.skipped) continue // resolved — off the day, not a loss
    // A collection with no steps applicable today draws nothing — same rule,
    // same field, as countRoutineUnits' collection branch above.
    if (item.type === 'routine-collection' && (item.collectionProgress?.total ?? 0) === 0) continue
    total += 1
    if (item.completed) done += 1
  }
  return { done, total }
}
