import type { ActionableInstance, Routine } from '@/types/actionable'

/**
 * The routines a day holds before any visibility rule runs: those whose
 * pattern lands on the day, plus those deferred ONTO it from another day,
 * minus those skipped or deferred AWAY. Extracted from useScheduleFiltering so
 * the Today pin (useDayPlan) reads the very list Today reads — that hook also
 * generates prep tasks as a side effect, which a second caller must never run.
 */
export function routinesForViewedDate(
  routinesForDate: Routine[],
  allRoutines: Routine[],
  dateInstances: ActionableInstance[],
  viewedDate: Date,
): Routine[] {
  // Build a map of routine_id -> instance for quick lookup
  const instanceMap = new Map<string, ActionableInstance>()
  for (const instance of dateInstances) {
    if (instance.entity_type === 'routine') {
      instanceMap.set(instance.entity_id, instance)
    }
  }

  // Find routines that were deferred TO this date (any status — includes
  // completed/skipped). Cross-day deferrals AND same-day placements: "Give it
  // a day" puts a routine with no day of its own here as a pending instance
  // dated today, and its pattern (which names no day) must not veto the day
  // the user chose.
  const deferredToThisDate = new Set<string>()
  const viewedDateStr = viewedDate.toISOString().split('T')[0]
  for (const instance of dateInstances) {
    if (instance.entity_type === 'routine' && instance.deferred_to) {
      const deferredToDateStr = new Date(instance.deferred_to).toISOString().split('T')[0]
      if (deferredToDateStr === viewedDateStr) {
        deferredToThisDate.add(instance.entity_id)
      }
    }
  }

  // Get additional routines that were deferred to this date but don't normally occur today
  const additionalRoutines: Routine[] = []
  for (const routineId of deferredToThisDate) {
    // If this routine isn't already in routinesForDate, add it
    if (!routinesForDate.some(r => r.id === routineId)) {
      const routine = allRoutines.find(r => r.id === routineId)
      if (routine) {
        additionalRoutines.push(routine)
      }
    }
  }

  // Filter out skipped routines and routines deferred AWAY (but not TO this date)
  const filteredNormalRoutines = routinesForDate.filter((routine) => {
    const instance = instanceMap.get(routine.id)
    if (!instance) return true // No instance = pending
    if (instance.status === 'skipped') return false
    // If deferred, only hide if NOT deferred to this specific date
    if (instance.status === 'deferred') {
      return deferredToThisDate.has(routine.id)
    }
    return true
  })

  // Combine normal routines with deferred-to routines
  return [...filteredNormalRoutines, ...additionalRoutines]
}
