import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSupabaseTasks } from './useSupabaseTasks'
import { useGoogleCalendar } from './useGoogleCalendar'
import { useRoutines } from './useRoutines'
import { useActionableInstances } from './useActionableInstances'
import { useHiddenCalendarEvents } from './useHiddenCalendarEvents'
import { useFamilyMembers } from './useFamilyMembers'
import { useEventNotes } from './useEventNotes'
import { useProjects } from './useProjects'
import { useScheduleFiltering } from './useScheduleFiltering'
import { useTodayData } from './useTodayData'
import { composeThread } from '@/lib/thread/compose'
import { EMPTY_COMPOSITION, type Moment, type ThreadComposition } from '@/lib/thread/types'
import type { Project } from '@/types/project'

/** How often the clock advances for banding purposes. Coarse enough to be
 *  cheap, fine enough that "starts in 12 min" is never a lie by more than a
 *  rounding error. */
const TICK_MS = 30_000

export interface ThreadData {
  composition: ThreadComposition
  projectsMap: Map<string, Project>
  loading: boolean
  now: Date
  complete: (moment: Moment) => Promise<void>
  push: (moment: Moment) => Promise<void>
  capture: (title: string) => Promise<void>
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/**
 * Wires the existing day pipeline into the thread.
 *
 * Deliberately additive: this re-uses `computeTodayData` — the same merge of
 * tasks, calendar events, routine instances and med doses that Today runs on —
 * and only changes what happens after. The thread is a new composition over
 * existing material, not a new data layer.
 */
export function useThreadData(): ThreadData {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  // `now` moves every 30s; the viewed *day* must not, or every tick would
  // refetch the day's instances.
  const dayStamp = now.toDateString()
  const viewedDate = useMemo(() => startOfDay(new Date(dayStamp)), [dayStamp])

  const {
    tasks,
    loading: tasksLoading,
    addTask,
    toggleTask,
    pushTask,
    getLinkedTasks,
  } = useSupabaseTasks()
  const { isConnected, events, fetchEvents } = useGoogleCalendar()
  const {
    routines: allRoutines,
    loading: routinesLoading,
    getRoutinesForDate,
  } = useRoutines()
  const { getInstancesForDate, markDone } = useActionableInstances()
  const { isHidden: isEventHidden } = useHiddenCalendarEvents()
  const { getCurrentUserMember } = useFamilyMembers()
  const { projectsMap } = useProjects()

  useEffect(() => {
    if (!isConnected) return
    const start = startOfDay(viewedDate)
    const end = new Date(start)
    end.setHours(23, 59, 59, 999)
    void fetchEvents(start, end)
  }, [isConnected, viewedDate, fetchEvents])

  const visibleEventIds = useMemo(
    () => events.map((e) => e.google_event_id || e.id),
    [events],
  )
  const { notes: eventNotesMap } = useEventNotes(visibleEventIds)

  const { filteredEvents, filteredRoutines, dateInstances, refreshDateInstances } =
    useScheduleFiltering({
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
    })

  const todayInput = useMemo(
    () => ({
      tasks,
      events: filteredEvents,
      routines: filteredRoutines,
      dateInstances,
      viewedDate,
      selectedAssignee: null,
      hideRoutines: false,
      eventNotesMap,
      projectsMap,
    }),
    [tasks, filteredEvents, filteredRoutines, dateInstances, viewedDate, eventNotesMap, projectsMap],
  )

  const data = useTodayData(todayInput)

  const composition = useMemo(() => {
    if (tasksLoading && tasks.length === 0) return EMPTY_COMPOSITION
    return composeThread({ data, now })
  }, [data, now, tasksLoading, tasks.length])

  const complete = useCallback(
    async (moment: Moment) => {
      const { item } = moment
      if (item.originalTask) {
        await toggleTask(item.originalTask.id)
        return
      }
      if (item.originalRoutine) {
        await markDone('routine', item.originalRoutine.id, viewedDate)
        await refreshDateInstances()
      }
    },
    [toggleTask, markDone, viewedDate, refreshDateInstances],
  )

  const push = useCallback(
    async (moment: Moment) => {
      const task = moment.item.originalTask
      if (!task) return
      const tomorrow = startOfDay(viewedDate)
      tomorrow.setDate(tomorrow.getDate() + 1)
      await pushTask(task.id, tomorrow)
    },
    [pushTask, viewedDate],
  )

  const capture = useCallback(
    async (title: string) => {
      const trimmed = title.trim()
      if (!trimmed) return
      await addTask(trimmed)
    },
    [addTask],
  )

  return {
    composition,
    projectsMap,
    loading: tasksLoading || routinesLoading,
    now,
    complete,
    push,
    capture,
  }
}
