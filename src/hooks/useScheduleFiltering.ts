import { useState, useMemo, useEffect, useCallback } from 'react'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { ActionableInstance, Routine } from '@/types/actionable'
import type { Task, LinkedActivityType } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { onInstancesChanged } from '@/lib/instancesChangedSignal'

interface UseScheduleFilteringParams {
  viewedDate: Date
  events: CalendarEvent[]
  allRoutines: Routine[]
  getRoutinesForDate: (date: Date) => Routine[]
  getInstancesForDate: (date: Date) => Promise<ActionableInstance[]>
  isEventHidden: (eventId: string) => boolean
  tasksLoading: boolean
  routinesLoading: boolean
  getLinkedTasks: (activityType: LinkedActivityType, activityId: string) => { prep: Task[], followup: Task[] }
  addTask: (
    title: string,
    contactId?: string,
    projectId?: string,
    scheduledFor?: Date,
    options?: {
      linkedTo?: { type: LinkedActivityType; id: string }
      linkType?: 'prep' | 'followup'
      assignedTo?: string
    }
  ) => Promise<string | undefined>
  getCurrentUserMember: () => FamilyMember | undefined
}

interface UseScheduleFilteringReturn {
  filteredEvents: CalendarEvent[]
  filteredRoutines: Routine[]
  dateInstances: ActionableInstance[]
  refreshDateInstances: () => Promise<void>
}

export function useScheduleFiltering({
  viewedDate,
  events,
  allRoutines,
  getRoutinesForDate,
  getInstancesForDate,
  isEventHidden,
  tasksLoading,
  routinesLoading,
  getLinkedTasks,
  addTask,
  getCurrentUserMember,
}: UseScheduleFilteringParams): UseScheduleFilteringReturn {
  const [dateInstances, setDateInstances] = useState<ActionableInstance[]>([])

  const refreshDateInstances = useCallback(async () => {
    const instances = await getInstancesForDate(viewedDate)
    setDateInstances(instances)
  }, [viewedDate, getInstancesForDate])

  useEffect(() => {
    refreshDateInstances()
    // Instance writes from outside the schedule's own handlers (e.g. checking a
    // routine step in the detail panel) announce themselves via this signal —
    // there is no realtime subscription on actionable_instances.
    return onInstancesChanged(() => void refreshDateInstances())
  }, [refreshDateInstances])

  // Filter events to exclude skipped/completed items
  const filteredEvents = useMemo(() => {
    // Build a map of entity_id -> status for quick lookup
    const statusMap = new Map<string, string>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'calendar_event') {
        statusMap.set(instance.entity_id, instance.status)
      }
    }

    // Filter out events that are skipped, deferred, or permanently hidden
    return events.filter((event) => {
      const eventId = event.google_event_id || event.id
      // Remove permanently hidden recurring events
      if (isEventHidden(eventId)) return false
      const status = statusMap.get(eventId)
      // Remove if skipped or deferred
      return status !== 'skipped' && status !== 'deferred'
    })
  }, [events, dateInstances, isEventHidden])

  // Get routines for the viewed date:
  // 1. Routines that normally occur on this date (by recurrence pattern)
  // 2. Routines that were deferred TO this date (even if not normally scheduled)
  // 3. Filter out routines that are skipped or deferred away from this date
  const filteredRoutines = useMemo(() => {
    const routinesForDate = getRoutinesForDate(viewedDate)

    // Build a map of routine_id -> instance for quick lookup
    const instanceMap = new Map<string, ActionableInstance>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'routine') {
        instanceMap.set(instance.entity_id, instance)
      }
    }

    // Find routines that were deferred TO this date (any status — includes completed/skipped)
    const deferredToThisDate = new Set<string>()
    const viewedDateStr = viewedDate.toISOString().split('T')[0]
    for (const instance of dateInstances) {
      if (
        instance.entity_type === 'routine' &&
        instance.deferred_to &&
        (instance.date as string) !== viewedDateStr // Only cross-day deferrals
      ) {
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
  }, [getRoutinesForDate, viewedDate, dateInstances, allRoutines])

  // Generate prep tasks from routine templates when routines surface for the day
  // This runs once when filteredRoutines changes for a given date
  useEffect(() => {
    if (tasksLoading || routinesLoading) return
    if (filteredRoutines.length === 0) return

    // Format date string for instance ID
    const dateStr = viewedDate.toISOString().split('T')[0]

    const generateTemplatedTasks = async () => {
      for (const routine of filteredRoutines) {
        // Skip if no prep templates
        if (!routine.prep_task_templates || routine.prep_task_templates.length === 0) {
          continue
        }

        const instanceId = `${routine.id}_${dateStr}`
        const existingLinked = getLinkedTasks('routine_instance' as LinkedActivityType, instanceId)

        for (const template of routine.prep_task_templates) {
          // Check if a task with this title already exists for this instance
          const exists = existingLinked.prep.some(t => t.title === template.title)
          if (!exists) {
            // Create prep task scheduled for today
            await addTask(
              template.title,
              undefined, // contactId
              undefined, // projectId
              viewedDate, // scheduledFor - same day as routine
              {
                linkedTo: { type: 'routine_instance' as LinkedActivityType, id: instanceId },
                linkType: 'prep',
                assignedTo: getCurrentUserMember()?.id,
              }
            )
          }
        }
      }
    }

    generateTemplatedTasks()
  }, [filteredRoutines, viewedDate, tasksLoading, routinesLoading, getLinkedTasks, addTask, getCurrentUserMember])

  return {
    filteredEvents,
    filteredRoutines,
    dateInstances,
    refreshDateInstances,
  }
}
