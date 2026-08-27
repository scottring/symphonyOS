import type { ActionableInstance } from '@/types/actionable'

/**
 * Routine ids that were placed onto `viewedDate` by a cross-day deferral.
 *
 * Dragging a routine onto another day writes a one-day `deferred_to`
 * override on its instance rather than rewriting `recurrence_pattern` — one
 * drag must not move every future occurrence (see routineTime.ts). That
 * means a deferred-in routine's own pattern still says "not today," and
 * `resolveRoutine`'s rung 2 needs this set to know when to let the deferral
 * win instead.
 *
 * Mirrors `useScheduleFiltering.ts`'s `deferredToThisDate` derivation
 * exactly — same cross-day-only guard, same "any status counts" rule — so
 * Today and the time-block grid (Task 6) agree on what counts as "placed
 * here by a deferral."
 */
export function deferredInRoutineIds(
  dateInstances: readonly ActionableInstance[],
  viewedDate: Date,
): Set<string> {
  const viewedDateStr = viewedDate.toISOString().split('T')[0]
  const ids = new Set<string>()
  for (const instance of dateInstances) {
    if (instance.entity_type !== 'routine' || !instance.deferred_to) continue
    if (instance.date === viewedDateStr) continue // same-day retime, not a cross-day deferral
    const deferredToDateStr = new Date(instance.deferred_to).toISOString().split('T')[0]
    if (deferredToDateStr === viewedDateStr) ids.add(instance.entity_id)
  }
  return ids
}
