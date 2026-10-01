import type { ActionableInstance } from '@/types/actionable'
import { localYmd } from '@/lib/cadence/config'

/**
 * Chosen for this day WITHOUT a time: "Choose" (or a picker's All Day) writes
 * `planned_on` on the occurrence and no `deferred_to`. For a routine whose
 * rule names no day — a flexible weekly one — that choice is the only thing
 * putting it on the day, so it must count as placed here exactly as a time
 * override does. A skipped occurrence is not on the day (2026-09-23).
 */
export function chosenUntimedOn(instance: ActionableInstance, day: Date): boolean {
  return instance.entity_type === 'routine' && instance.status !== 'skipped'
    && !instance.deferred_to && instance.planned_on === localYmd(day)
}

/**
 * Moved to a DAY, not a time: "Move → Saturday" on an untimed routine (Wash
 * comforters has no hour) writes `deferred_to` at that day's local midnight and
 * stamps `planned_on` with the same day. The pair is the marker — a midnight
 * deferral alone would read as "at 12:00 AM", and `planned_on` alone is the
 * existing All Day choice. Readers that resolve a time must treat this as
 * untimed on that day (2026-10-01).
 */
export function isDayOnlyMove(instance: ActionableInstance | undefined): boolean {
  if (!instance?.deferred_to || !instance.planned_on) return false
  const at = new Date(instance.deferred_to)
  return at.getHours() === 0 && at.getMinutes() === 0 && localYmd(at) === instance.planned_on
}

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
    if (chosenUntimedOn(instance, viewedDate)) { ids.add(instance.entity_id); continue }
    if (instance.entity_type !== 'routine' || !instance.deferred_to) continue
    const deferredToDateStr = new Date(instance.deferred_to).toISOString().split('T')[0]
    if (deferredToDateStr === viewedDateStr) ids.add(instance.entity_id)
  }
  return ids
}
