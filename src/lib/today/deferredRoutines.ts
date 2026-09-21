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
 * Mirrors `routinesForDate.ts`'s `deferredToThisDate` derivation exactly —
 * same "any status counts" rule — so Today and the time-block grid agree on
 * what counts as "placed here."
 *
 * A same-day override counts too: "Give it a day" puts a routine with no day
 * of its own on ONE day as a pending instance dated that day, and its
 * pattern (which names no day) must not veto the day the user chose. For a
 * routine whose pattern already covers the day it changes nothing.
 */
export function deferredInRoutineIds(
  dateInstances: readonly ActionableInstance[],
  viewedDate: Date,
): Set<string> {
  const viewedDateStr = viewedDate.toISOString().split('T')[0]
  const ids = new Set<string>()
  for (const instance of dateInstances) {
    if (instance.entity_type !== 'routine' || !instance.deferred_to) continue
    const deferredToDateStr = new Date(instance.deferred_to).toISOString().split('T')[0]
    if (deferredToDateStr === viewedDateStr) ids.add(instance.entity_id)
  }
  return ids
}
