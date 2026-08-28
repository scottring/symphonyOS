import type { ActionableInstance, Routine } from '@/types/actionable'
import { resolveRoutine, type ResolveRoutineCtx } from '@/lib/routineUtils'

/** Ports TodaySchedule.routineStatusMap (~782-799). */
export function buildRoutineStatusMap(dateInstances: ActionableInstance[]): Map<string, ActionableInstance> {
  const statusPriority: Record<string, number> = { completed: 3, skipped: 2, deferred: 1, pending: 0 }
  const map = new Map<string, ActionableInstance>()
  for (const instance of dateInstances) {
    if (instance.entity_type === 'routine') {
      const existing = map.get(instance.entity_id)
      if (!existing || (statusPriority[instance.status] ?? 0) > (statusPriority[existing.status] ?? 0)) {
        map.set(instance.entity_id, instance)
      }
    }
  }
  return map
}

/** Ports TodaySchedule.eventStatusMap (~817-825). */
export function buildEventStatusMap(dateInstances: ActionableInstance[]): Map<string, ActionableInstance> {
  const map = new Map<string, ActionableInstance>()
  for (const instance of dateInstances) {
    if (instance.entity_type === 'calendar_event') {
      map.set(instance.entity_id, instance)
    }
  }
  return map
}

/**
 * The Today routine pool. resolveRoutine replaces what used to be five
 * filters spread across useRoutines, useScheduleFiltering, HomeView, this
 * file, and grouping.ts — with two additions layered on top, both needed to
 * keep a routine collection (e.g. a PT-exercise checklist) intact:
 *
 * 1. A Step never independently "shows" — resolveRoutine's rung 6 always
 *    calls it 'in-collection', because the collection renders it, not the
 *    step standing alone. But grouping.ts/routineCollections.ts still need
 *    the raw Step rows in this pool to reconstruct the collection, so a Step
 *    is kept whenever it clears every OTHER rung (i.e. its reason is exactly
 *    'in-collection', not an earlier one like 'not-theirs' or 'off').
 * 2. The "hide daily routines" sweep (rung 7) is a per-row question for a
 *    standalone routine. It also has to handle the case where a collection's
 *    parent row is itself active and an ordinary everyday routine with no
 *    pin/dose of its own — the markers that earn an exemption ("PT
 *    exercises" dosed at 8am+6pm) usually live on its Steps, not on the
 *    organizational parent row. So a row that resolveRoutine would sweep as
 *    'everyday' is kept anyway when it is currently the parent of a Step
 *    that survived (1).
 *
 *    This rescue is narrow, and does NOT cover the more common collection
 *    shape: a parent that is resting (`visibility: 'reference'` — see
 *    routineUtils.ts's `effectiveTimeOfDay` docstring and its "Camp
 *    Mornings" example, which is the real shape, per useWallData.ts's own
 *    comment that a collection parent "is typically 'reference'"). A
 *    resting parent is hidden at rung 1, long before rung 7's sweep ever
 *    runs, and this retention layer only ever rescues an 'everyday' reason
 *    — never 'resting'. So a resting-parent collection is NOT rescued:
 *    groupRoutineSteps never finds the parent row, its Steps are orphaned,
 *    and the whole collection renders nothing on Today. That matches the
 *    legacy pipeline (todayParity.test.ts's "before" recording also
 *    filtered to only-active routines first) and is pinned by
 *    computeTodayData.test.ts's orphan-step case — it is not a regression
 *    from this refactor.
 */
export function selectVisibleRoutines(routines: Routine[], ctx: ResolveRoutineCtx): Routine[] {
  const resolved = routines.map((r) => ({ r, res: resolveRoutine(r, ctx) }))

  const keptDirectly = resolved.filter(({ res }) => res.shows || res.reason === 'in-collection')
  const parentIdsWithKeptSteps = new Set(
    keptDirectly
      .map(({ r }) => r.parent_routine_id)
      .filter((id): id is string => id != null),
  )

  return resolved
    .filter(
      ({ r, res }) =>
        res.shows || res.reason === 'in-collection' || (res.reason === 'everyday' && parentIdsWithKeptSteps.has(r.id)),
    )
    .map(({ r }) => r)
}
