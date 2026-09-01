import type { ActionableInstance, Routine } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import { routineToTimelineItem } from '@/types/timeline'
import { resolveRoutine } from '@/lib/routineUtils'
import { resolveRoutineTime } from '@/lib/today/routineTime'
import { addDays, isSameDay, toDateString } from '@/lib/dateUtils'
import type { AssigneeFilter } from '@/lib/today/types'
import type { Layer } from '@/lib/domains'

export interface BuildWeekRoutineItemsArgs {
  routines: Routine[]
  weekStart: Date
  /** Number of day columns rendered — 5 (workweek) or 7. */
  dayCount: number
  /** Every routine instance touching the visible week, from useWeekInstances. */
  instances: ActionableInstance[]
  member?: AssigneeFilter
  prefs: { hideRoutines: boolean; layers: ReadonlySet<Layer> }
}

/**
 * Expand routines into one TimelineItem per day column they occupy.
 *
 * A drag on the grid writes a ONE-DAY override to
 * `actionable_instances.deferred_to` — the recurrence rule is never rewritten,
 * so one drag cannot move every future occurrence. That makes `time_of_day`
 * the RULE, not the answer: a builder that reads it alone renders every block
 * back at its rule time and silently discards the drag. That was the bug — the
 * grid became draggable before it learned to read what the drag wrote.
 *
 * So an instance gets three chances to speak, all through the shared
 * resolvers rather than a second copy of the rules:
 *   - deferred ONTO this day  → renders here even if the pattern says no
 *     (`deferredInto`, resolveRoutine's instance-level override of rung 2)
 *   - deferred AWAY from this day → renders nowhere here, leaving no ghost
 *   - retimed within this day → renders at the new time (resolveRoutineTime)
 */
export function buildWeekRoutineItems({
  routines,
  weekStart,
  dayCount,
  instances,
  member,
  prefs,
}: BuildWeekRoutineItemsArgs): TimelineItem[] {
  const routineInstances = instances.filter((i) => i.entity_type === 'routine')
  const byRoutine = new Map<string, ActionableInstance[]>()
  for (const instance of routineInstances) {
    const list = byRoutine.get(instance.entity_id)
    if (list) list.push(instance)
    else byRoutine.set(instance.entity_id, [instance])
  }

  const items: TimelineItem[] = []

  for (let dayIdx = 0; dayIdx < dayCount; dayIdx++) {
    const day = addDays(weekStart, dayIdx)
    const dayStr = toDateString(day)

    // A deferral moves the instance without moving its `date` column, so
    // "landed here" is a deferred_to on this day from some OTHER day.
    const landedHere = (i: ActionableInstance) =>
      !!i.deferred_to && i.date !== dayStr && isSameDay(new Date(i.deferred_to), day)

    const deferredInto = new Set(routineInstances.filter(landedHere).map((i) => i.entity_id))

    for (const routine of routines) {
      const own = byRoutine.get(routine.id)
      const deferredIn = own?.find(landedHere)
      const onThisDay = own?.find((i) => i.date === dayStr)

      // Moved off this day entirely. Skipping before resolveRoutineTime keeps
      // this distinct from "untimed", which also resolves to a null start but
      // belongs in the unscheduled lane rather than nowhere at all.
      if (
        !deferredIn &&
        onThisDay?.status === 'deferred' &&
        onThisDay.deferred_to &&
        !isSameDay(new Date(onThisDay.deferred_to), day)
      ) {
        continue
      }

      if (!resolveRoutine(routine, { date: day, member, prefs, deferredInto }).shows) continue

      const instance = deferredIn ?? onThisDay
      items.push({
        ...routineToTimelineItem(routine, day),
        // routineToTimelineItem returns the same id for every day; the suffix
        // keeps React keys unique and tells a drop which day it came from.
        id: `routine-${routine.id}-day${dayIdx}`,
        startTime: resolveRoutineTime(routine, instance, day),
      })
    }
  }

  return items
}
