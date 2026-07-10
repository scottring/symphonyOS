// src/components/planning/guided/GuidedSessionContainer.tsx
//
// Builds the GuidedHost adapter from app hooks. This is the ONLY file in
// guided/ that touches app-level hooks, so the shell and steps stay testable.
import { useMemo, useCallback } from 'react'
import './stepTypes' // register all step components (side effect)
import { GuidedSession } from './GuidedSession'
import type { GuidedHost } from './GuidedContext'
import type { PlanningHorizon } from '@/hooks/usePlanningSession'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { useGoalsContext } from '@/contexts/GoalsContext'
import { useProjects } from '@/hooks/useProjects'
import { useRoutines } from '@/hooks/useRoutines'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useDomain } from '@/hooks/useDomain'
import { isEverydayRoutine } from '@/lib/routineUtils'
import type { TaskBucket } from '@/types/task'
import type { GoalStatus } from '@/types/goal'

interface Props {
  horizon: PlanningHorizon
  onClose: () => void
  onFinished?: () => void
  onChain?: (next: PlanningHorizon) => void
  /** Reuse the host page's routine-scheduling handler (drag onto the grid). */
  onScheduleRoutine: (routineId: string, date: Date, time: string) => void
}

export function GuidedSessionContainer({ horizon, onClose, onFinished, onChain, onScheduleRoutine }: Props) {
  const { tasks, loading: tasksLoading, addTask, toggleTask, updateTask, pushTask, setBucket } = useSupabaseTasks()
  const { isConnected, events, fetchEvents, createEvent } = useGoogleCalendar()
  const { areas, goals, addGoal, addArea, updateGoal } = useGoalsContext()
  const { projects, projectsMap } = useProjects()
  const { routines: allRoutines, getRoutinesForDate } = useRoutines()
  const { getCurrentUserMember } = useFamilyMembers()
  const { currentDomain } = useDomain()

  const createTaskInBucket = useCallback(async (title: string, bucket: TaskBucket, projectId?: string) => {
    await addTask(title, undefined, projectId, undefined, {
      assignedTo: getCurrentUserMember()?.id,
      context: currentDomain !== 'universal' ? currentDomain : undefined,
      bucket,
    })
  }, [addTask, getCurrentUserMember, currentDomain])

  const createDatedTask = useCallback(async (title: string, date: Date) => {
    await addTask(title, undefined, undefined, date, {
      assignedTo: getCurrentUserMember()?.id,
      isAllDay: true,
    })
  }, [addTask, getCurrentUserMember])

  const host = useMemo<GuidedHost>(() => ({
    tasks, tasksLoading,
    events, calendarConnected: isConnected,
    fetchEvents, createEvent,
    onPushTask: pushTask, onSetBucket: setBucket, onCompleteTask: toggleTask, onUpdateTask: updateTask,
    createTaskInBucket, createDatedTask,
    projects, projectsMap,
    goals, goalAreas: areas,
    addGoal: (areaId: string, name: string) => addGoal(areaId, name, currentDomain !== 'universal' ? currentDomain : undefined),
    addArea: (name: string) => addArea(name),
    updateGoalStatus: (id: string, status: GoalStatus) => updateGoal(id, { status }),
    routines: allRoutines,
    draggableRoutines: allRoutines.filter((r) => r.visibility === 'active' && !isEverydayRoutine(r.recurrence_pattern) && !r.time_of_day),
    onScheduleRoutine,
    getRoutinesForDate,
  }), [tasks, tasksLoading, events, isConnected, fetchEvents, createEvent, pushTask, setBucket, toggleTask, updateTask, createTaskInBucket, createDatedTask, projects, projectsMap, goals, areas, addGoal, addArea, updateGoal, allRoutines, onScheduleRoutine, getRoutinesForDate, currentDomain])

  return <GuidedSession horizon={horizon} host={host} onClose={onClose} onFinished={onFinished} onChain={onChain} />
}
