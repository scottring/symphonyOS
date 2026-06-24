import type { ActionableInstance, Routine } from '@/types/actionable'
import { isEverydayRoutine } from '@/lib/routineUtils'

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
 * A routine that is always kept on Today even when "hide daily routines" is on.
 * Pinned routines (an explicit per-routine override) and dosed routines (those
 * with an N-times-per-day schedule, which are tracked obligations like PT
 * exercises, not ambient habits) escape the everyday-hide sweep.
 */
function isPinnedToTimeline(r: Routine): boolean {
  return r.pin_to_timeline === true || (r.times_per_day?.length ?? 0) > 0
}

/** Ports TodaySchedule.visibleRoutines (~810-814). */
export function selectVisibleRoutines(routines: Routine[], hideRoutines: boolean): Routine[] {
  const showable = routines.filter(r => r.show_on_timeline !== false)
  if (!hideRoutines) return showable
  const parentIds = new Set(showable.filter(r => r.parent_routine_id).map(r => r.parent_routine_id))
  return showable.filter(r =>
    r.parent_routine_id != null ||           // a Step — the collection decides visibility
    parentIds.has(r.id) ||                   // a collection parent — keep so its steps group
    isPinnedToTimeline(r) ||
    !isEverydayRoutine(r.recurrence_pattern),
  )
}
