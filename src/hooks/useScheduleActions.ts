import { useCallback } from 'react'
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'

interface UseScheduleActionsDeps {
  tasks: Task[]
  events: CalendarEvent[]
  allRoutines: Routine[]
  familyMembers: FamilyMember[]
  viewedDate: Date
  updateTask: (id: string, updates: Partial<Task>) => void
  updateRoutine: (id: string, updates: Partial<Routine>) => void
  deleteRoutine: (id: string) => Promise<unknown>
  updateEventAssignment: (eventId: string, memberId: string | null) => void
  updateEventAssignmentAll: (eventId: string, memberIds: string[]) => void
  markDone: (entityType: 'routine' | 'calendar_event', entityId: string, date: Date, completedAt?: Date) => Promise<boolean>
  undoDone: (entityType: 'routine' | 'calendar_event', entityId: string, date: Date) => Promise<boolean>
  skip: (entityType: 'routine' | 'calendar_event', entityId: string, date: Date) => Promise<boolean>
  reschedule: (entityType: 'routine' | 'calendar_event', entityId: string, fromDate: Date, toDate: Date) => Promise<boolean>
  refreshDateInstances: () => void
  pushAction: (message: string, undoFn: () => void) => void
}

export function useScheduleActions({
  tasks,
  events,
  allRoutines,
  familyMembers,
  viewedDate,
  updateTask,
  updateRoutine,
  deleteRoutine,
  updateEventAssignment,
  updateEventAssignmentAll,
  markDone,
  undoDone,
  skip,
  reschedule,
  refreshDateInstances,
  pushAction,
}: UseScheduleActionsDeps) {

  const onAssignTask = useCallback((taskId: string, memberId: string | null) => {
    const task = tasks.find(t => t.id === taskId)
    const prevAssignedTo = task?.assignedTo
    const taskTitle = task?.title || 'Task'
    updateTask(taskId, { assignedTo: memberId ?? undefined })

    const memberName = memberId ? familyMembers.find(m => m.id === memberId)?.name : null
    const message = memberName ? `Assigned "${taskTitle}" to ${memberName}` : `Unassigned "${taskTitle}"`
    pushAction(message, () => {
      updateTask(taskId, { assignedTo: prevAssignedTo ?? undefined })
    })
  }, [tasks, familyMembers, updateTask, pushAction])

  const onAssignTaskAll = useCallback((taskId: string, memberIds: string[]) => {
    const task = tasks.find(t => t.id === taskId)
    const prevAssignedToAll = task?.assignedToAll || []
    const prevAssignedTo = task?.assignedTo
    const taskTitle = task?.title || 'Task'
    updateTask(taskId, { assignedToAll: memberIds, assignedTo: memberIds[0] ?? undefined })

    const memberNames = memberIds.map(id => familyMembers.find(m => m.id === id)?.name).filter(Boolean)
    const message = memberIds.length > 0
      ? `Assigned "${taskTitle}" to ${memberNames.join(', ')}`
      : `Unassigned "${taskTitle}"`
    pushAction(message, () => {
      updateTask(taskId, { assignedToAll: prevAssignedToAll, assignedTo: prevAssignedTo ?? undefined })
    })
  }, [tasks, familyMembers, updateTask, pushAction])

  const onAssignEvent = useCallback((eventId: string, memberId: string | null) => {
    updateEventAssignment(eventId, memberId)
  }, [updateEventAssignment])

  const onAssignEventAll = useCallback((eventId: string, memberIds: string[]) => {
    updateEventAssignmentAll(eventId, memberIds)
  }, [updateEventAssignmentAll])

  const onAssignRoutine = useCallback((routineId: string, memberId: string | null) => {
    updateRoutine(routineId, { assigned_to: memberId })
  }, [updateRoutine])

  const onAssignRoutineAll = useCallback((routineId: string, memberIds: string[]) => {
    updateRoutine(routineId, { assigned_to_all: memberIds, assigned_to: memberIds[0] ?? null })
  }, [updateRoutine])

  const onCompleteRoutine = useCallback(async (routineId: string, completed: boolean, completedAt?: Date) => {
    const bareId = routineId.split('#')[0]
    const routine = allRoutines.find(r => r.id === bareId)
    const routineName = routine?.name || 'Routine'

    if (completed) {
      await markDone('routine', routineId, viewedDate, completedAt)
      pushAction(`Completed "${routineName}"`, async () => {
        await undoDone('routine', routineId, viewedDate)
        refreshDateInstances()
      })
    } else {
      await undoDone('routine', routineId, viewedDate)
    }
    refreshDateInstances()
  }, [allRoutines, viewedDate, markDone, undoDone, refreshDateInstances, pushAction])

  const onSkipRoutine = useCallback(async (routineId: string) => {
    const bareId = routineId.split('#')[0]
    const routine = allRoutines.find(r => r.id === bareId)
    const routineName = routine?.name || 'Routine'

    await skip('routine', routineId, viewedDate)
    pushAction(`Skipped "${routineName}"`, async () => {
      await undoDone('routine', routineId, viewedDate)
      refreshDateInstances()
    })
    refreshDateInstances()
  }, [allRoutines, viewedDate, skip, undoDone, refreshDateInstances, pushAction])

  const onPushRoutine = useCallback(async (routineId: string, date: Date) => {
    const routine = allRoutines.find(r => r.id === routineId)
    const routineName = routine?.name || 'Routine'

    await reschedule('routine', routineId, viewedDate, date)
    pushAction(`Rescheduled "${routineName}"`, async () => {
      await undoDone('routine', routineId, viewedDate)
      refreshDateInstances()
    })
    refreshDateInstances()
  }, [allRoutines, viewedDate, reschedule, undoDone, refreshDateInstances, pushAction])

  const onDeleteRoutine = useCallback(async (routineId: string) => {
    await deleteRoutine(routineId)
  }, [deleteRoutine])

  const onCompleteEvent = useCallback(async (eventId: string, completed: boolean) => {
    const event = events.find(e => (e.google_event_id || e.id) === eventId)
    const eventName = event?.title || 'Event'

    if (completed) {
      await markDone('calendar_event', eventId, viewedDate)
      pushAction(`Completed "${eventName}"`, async () => {
        await undoDone('calendar_event', eventId, viewedDate)
        refreshDateInstances()
      })
    } else {
      await undoDone('calendar_event', eventId, viewedDate)
    }
    refreshDateInstances()
  }, [events, viewedDate, markDone, undoDone, refreshDateInstances, pushAction])

  const onSkipEvent = useCallback(async (eventId: string) => {
    const event = events.find(e => (e.google_event_id || e.id) === eventId)
    const eventName = event?.title || 'Event'

    await skip('calendar_event', eventId, viewedDate)
    pushAction(`Skipped "${eventName}"`, async () => {
      await undoDone('calendar_event', eventId, viewedDate)
      refreshDateInstances()
    })
    refreshDateInstances()
  }, [events, viewedDate, skip, undoDone, refreshDateInstances, pushAction])

  const onPushEvent = useCallback(async (eventId: string, date: Date) => {
    const event = events.find(e => (e.google_event_id || e.id) === eventId)
    const eventName = event?.title || 'Event'

    await reschedule('calendar_event', eventId, viewedDate, date)
    pushAction(`Rescheduled "${eventName}"`, async () => {
      await undoDone('calendar_event', eventId, viewedDate)
      refreshDateInstances()
    })
    refreshDateInstances()
  }, [events, viewedDate, reschedule, undoDone, refreshDateInstances, pushAction])

  return {
    onAssignTask,
    onAssignTaskAll,
    onAssignEvent,
    onAssignEventAll,
    onAssignRoutine,
    onAssignRoutineAll,
    onCompleteRoutine,
    onSkipRoutine,
    onPushRoutine,
    onDeleteRoutine,
    onCompleteEvent,
    onSkipEvent,
    onPushEvent,
  }
}
