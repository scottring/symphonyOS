import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { Routine, ActionableInstance } from '@/types/actionable'
import { computeDayLoad, type DayLoad } from '@/lib/today/dayLoad'
import { useDayLoadEvents } from '@/hooks/useDayLoadEvents'
import { DATED_WHENS } from '@/components/schedule/SchedulePicker'
import { loadKeyFor } from '@/components/schedule/RescheduleGrid'

export interface UseDayLoadsInput {
  tasks: Task[]
  routines: Routine[]
  dateInstances: ActionableInstance[]
  /** Gate the calendar fetch — pass false where the scheduler can't be opened. */
  enabled: boolean
}

/**
 * Fullness for the six dated scheduler tiles, keyed by `loadKeyFor(when)`.
 *
 * Pool tiles (this-week, this-month, someday) have no day to measure and get no
 * entry, so `RescheduleGrid` renders them bare.
 */
export function useDayLoads(input: UseDayLoadsInput): Map<string, DayLoad> {
  const { tasks, routines, dateInstances, enabled } = input
  const { events, available } = useDayLoadEvents(enabled)

  return useMemo(() => {
    const map = new Map<string, DayLoad>()
    if (!enabled) return map
    for (const tile of DATED_WHENS) {
      map.set(
        loadKeyFor(tile.when),
        computeDayLoad(tile.date(), {
          tasks,
          events,
          routines,
          dateInstances,
          eventsAvailable: available,
          window: tile.window,
        }),
      )
    }
    return map
  }, [enabled, tasks, routines, dateInstances, events, available])
}
