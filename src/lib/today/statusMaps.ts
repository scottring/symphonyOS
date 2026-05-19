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

/** Ports TodaySchedule.visibleRoutines (~810-814). */
export function selectVisibleRoutines(routines: Routine[], hideRoutines: boolean): Routine[] {
  const showable = routines.filter(r => r.show_on_timeline !== false)
  if (!hideRoutines) return showable
  return showable.filter(r => !isEverydayRoutine(r.recurrence_pattern))
}
