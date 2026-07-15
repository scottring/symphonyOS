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
import { filterTasksForPlanning } from '@/lib/today/domainFilter'
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
  const { isConnected, isLoading: calendarChecking, events, fetchEvents, createEvent } = useGoogleCalendar()
  const { areas, goals, addGoal, addArea, updateGoal } = useGoalsContext()
  const { projects, projectsMap } = useProjects()
  const { routines: allRoutines, getRoutinesForDate } = useRoutines()
  const { getCurrentUserMember } = useFamilyMembers()
  const { currentDomain } = useDomain()

  // Domain scoping — the ONE place the session pool narrows. Every step reads
  // host.tasks/projects/goals, so filtering here scopes review, write-list,
  // look-above, the grid, someday and overdue without per-step changes.
  // Universal passes everything through (the whole-life session).
  const domainTasks = useMemo(() => filterTasksForPlanning(tasks, currentDomain), [tasks, currentDomain])
  const domainProjects = useMemo(
    () => (currentDomain === 'universal' ? projects : projects.filter((p) => p.context === currentDomain)),
    [projects, currentDomain],
  )
  const domainGoals = useMemo(
    () => (currentDomain === 'universal' ? goals : goals.filter((g) => g.context === currentDomain)),
    [goals, currentDomain],
  )

  // Untagged inbox items stay visible in a domain session (pre-triage — see
  // filterTasksForPlanning). Routing one from here also stamps the session's
  // domain first, otherwise it would land on a list this session hides.
  // Sequential awaits: updateTask writes only the supplied columns, so the
  // stamp and the route never clobber each other.
  const stampDomain = useCallback(async (id: string) => {
    if (currentDomain === 'universal') return
    const t = tasks.find((x) => x.id === id)
    if (t && !t.context) await updateTask(id, { context: currentDomain })
  }, [currentDomain, tasks, updateTask])
  const pushTaskStamped = useCallback((id: string, target: Date | 'week' | 'month' | 'quarter') => {
    void stampDomain(id).then(() => pushTask(id, target))
  }, [stampDomain, pushTask])
  const setBucketStamped = useCallback((id: string, bucket: TaskBucket) => {
    void stampDomain(id).then(() => setBucket(id, bucket))
  }, [stampDomain, setBucket])

  const createTaskInBucket = useCallback(async (
    title: string,
    bucket: TaskBucket,
    opts?: { projectId?: string; sourceId?: string; goalId?: string },
  ) => {
    await addTask(title, undefined, opts?.projectId, undefined, {
      assignedTo: getCurrentUserMember()?.id,
      context: currentDomain !== 'universal' ? currentDomain : undefined,
      bucket,
      sourceId: opts?.sourceId,
      goalId: opts?.goalId,
    })
  }, [addTask, getCurrentUserMember, currentDomain])

  const createDatedTask = useCallback(async (title: string, date: Date) => {
    await addTask(title, undefined, undefined, date, {
      assignedTo: getCurrentUserMember()?.id,
      context: currentDomain !== 'universal' ? currentDomain : undefined,
      isAllDay: true,
    })
  }, [addTask, getCurrentUserMember, currentDomain])

  const host = useMemo<GuidedHost>(() => ({
    tasks: domainTasks, tasksLoading,
    events, calendarConnected: isConnected, calendarChecking,
    fetchEvents, createEvent,
    onPushTask: pushTaskStamped, onSetBucket: setBucketStamped, onCompleteTask: toggleTask, onUpdateTask: updateTask,
    createTaskInBucket, createDatedTask,
    // projectsMap stays UNFILTERED — it's the name-lookup for task rows, and a
    // domain task may live in an untagged project.
    projects: domainProjects, projectsMap,
    goals: domainGoals, goalAreas: areas,
    addGoal: (areaId: string, name: string) => addGoal(areaId, name, currentDomain !== 'universal' ? currentDomain : undefined),
    addArea: (name: string) => addArea(name),
    updateGoalStatus: (id: string, status: GoalStatus) => updateGoal(id, { status }),
    carryGoal: (id: string) => updateGoal(id, { year: new Date().getFullYear(), status: 'active' }),
    routines: allRoutines,
    draggableRoutines: allRoutines.filter((r) => r.visibility === 'active' && !isEverydayRoutine(r.recurrence_pattern) && !r.time_of_day),
    onScheduleRoutine,
    getRoutinesForDate,
  }), [domainTasks, tasksLoading, events, isConnected, calendarChecking, fetchEvents, createEvent, pushTaskStamped, setBucketStamped, toggleTask, updateTask, createTaskInBucket, createDatedTask, domainProjects, projectsMap, domainGoals, areas, addGoal, addArea, updateGoal, allRoutines, onScheduleRoutine, getRoutinesForDate, currentDomain])

  return <GuidedSession horizon={horizon} domain={currentDomain} host={host} onClose={onClose} onFinished={onFinished} onChain={onChain} />
}
