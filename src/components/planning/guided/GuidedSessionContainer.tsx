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
import { useUpkeepList } from '@/hooks/useUpkeepList'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useDomain, type Domain } from '@/hooks/useDomain'
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings'
import { isDraggableRoutine, resolveRoutine } from '@/lib/routineUtils'
import { filterTasksForPlanning, filterEventsForDomain, filterRoutinesForDomain } from '@/lib/today/domainFilter'
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

/** Pure opts-mapping for createTaskInBucket → addTask's AddTaskOptions. Extracted
 *  so the forwarding (bucket, projectId, sourceId, goalId, pickedAt, and the
 *  session-domain context stamp) is unit-testable without mounting the container.
 *  assignedTo is NOT here — it's an app-hook read merged at the call site. */
export function buildAddTaskOptions(
  bucket: TaskBucket,
  opts: { projectId?: string; sourceId?: string; goalId?: string; pickedAt?: Date; isFun?: boolean } | undefined,
  currentDomain: Domain,
) {
  return {
    bucket,
    projectId: opts?.projectId,
    sourceId: opts?.sourceId,
    goalId: opts?.goalId,
    pickedAt: opts?.pickedAt,
    // Fun is set when the thing is WRITTEN — "build the fun on purpose" means
    // adding one, not auditing thirty afterwards.
    isFun: opts?.isFun,
    context: currentDomain !== 'universal' ? currentDomain : undefined,
  }
}

export function GuidedSessionContainer({ horizon, onClose, onFinished, onChain, onScheduleRoutine }: Props) {
  const { tasks, loading: tasksLoading, addTask, toggleTask, updateTask, pushTask, setBucket, deleteTask } = useSupabaseTasks()
  const { isConnected, isLoading: calendarChecking, events, fetchEvents, createEvent } = useGoogleCalendar()
  const { areas, goals, addGoal, addArea, updateGoal } = useGoalsContext()
  const { projects, projectsMap } = useProjects()
  const { routines: allRoutines, getRoutinesForDate } = useRoutines()
  const { upkeepItems, upkeepLoading, ensureUpkeepList } = useUpkeepList()
  const { getCurrentUserMember } = useFamilyMembers()
  const { currentDomain } = useDomain()
  const { getDomainForCalendar } = useCalendarDomainMappings()

  // Domain scoping — the ONE place the session pool narrows. Every step reads
  // host.tasks/projects/goals/events/routines, so filtering here scopes review,
  // write-list, look-above, the grid, someday and overdue without per-step
  // changes. Universal passes everything through (the whole-life session).
  const domainTasks = useMemo(() => filterTasksForPlanning(tasks, currentDomain), [tasks, currentDomain])
  const domainProjects = useMemo(
    () => (currentDomain === 'universal' ? projects : projects.filter((p) => p.context === currentDomain)),
    [projects, currentDomain],
  )
  const domainGoals = useMemo(
    () => (currentDomain === 'universal' ? goals : goals.filter((g) => g.context === currentDomain)),
    [goals, currentDomain],
  )
  // Events scope at the calendar→domain level (this container doesn't load
  // event notes, so per-event overrides/family shares don't refine it here).
  const domainEvents = useMemo(
    () => filterEventsForDomain(events, currentDomain, { getDomainForCalendar }),
    [events, currentDomain, getDomainForCalendar],
  )
  // CalendarStep reads fetchEvents' RETURN value (not host.events), so the
  // range fetch must come back already domain-scoped too.
  const domainFetchEvents = useCallback(
    async (start: Date, end: Date) =>
      filterEventsForDomain(await fetchEvents(start, end), currentDomain, { getDomainForCalendar }),
    [fetchEvents, currentDomain, getDomainForCalendar],
  )
  // KEPT (not folded into resolveRoutine): these two feed `host.routines` /
  // `host.getRoutinesForDate`, which reach PlanningSession directly.
  // PlanningSession has no domain concept of its own — it hardcodes rung 4 to
  // 'universal' (see PlanningSession.tsx) because every caller already hands
  // it a domain-scoped pool. Deleting this pre-filter would remove domain
  // scoping from the guided week grid entirely, not replace it — the exact
  // "raw pool leaked a family routine into the Personal grid" bug HomeView-
  // Container's own comments describe. Only `draggableRoutines` below moves
  // to resolveRoutine, where the real `currentDomain` IS threaded through.
  const domainRoutines = useMemo(() => filterRoutinesForDomain(allRoutines, currentDomain), [allRoutines, currentDomain])
  const domainGetRoutinesForDate = useCallback(
    (date: Date) => filterRoutinesForDomain(getRoutinesForDate(date), currentDomain),
    [getRoutinesForDate, currentDomain],
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
    opts?: { projectId?: string; sourceId?: string; goalId?: string; pickedAt?: Date },
  ) => {
    // projectId rides positionally (addTask reads it there); the rest — bucket,
    // sourceId, goalId, pickedAt, context — ride in AddTaskOptions. assignedTo
    // is merged here (not part of the pure mapping) so the creator owns the item.
    await addTask(title, undefined, opts?.projectId, undefined, {
      ...buildAddTaskOptions(bucket, opts, currentDomain),
      assignedTo: getCurrentUserMember()?.id,
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
    events: domainEvents, calendarConnected: isConnected, calendarChecking,
    fetchEvents: domainFetchEvents, createEvent,
    onPushTask: pushTaskStamped, onSetBucket: setBucketStamped, onCompleteTask: toggleTask, onDeleteTask: deleteTask, onUpdateTask: updateTask,
    createTaskInBucket, createDatedTask,
    // projectsMap stays UNFILTERED — it's the name-lookup for task rows, and a
    // domain task may live in an untagged project.
    projects: domainProjects, projectsMap,
    goals: domainGoals, goalAreas: areas,
    addGoal: (areaId: string, name: string) => addGoal(areaId, name, currentDomain !== 'universal' ? currentDomain : undefined),
    addArea: (name: string) => addArea(name),
    updateGoalStatus: (id: string, status: GoalStatus) => updateGoal(id, { status }),
    carryGoal: (id: string) => updateGoal(id, { year: new Date().getFullYear(), status: 'active' }),
    routines: domainRoutines,
    // resolveRoutine replaces the hand-rolled visibility/everyday/timed check
    // — same rungs (resting, everyday-sweep, timed) plus the ones the old
    // predicate never asked (off-timeline, not-theirs, in-collection).
    // `allRoutines` (not domainRoutines) because rung 4 does the domain scoping
    // itself here. `hideRoutines: true` is intentional and preserves the old
    // `!isEverydayRoutine` behavior: a guided session is for placing non-routine
    // work, so ambient everyday routines are never drag candidates.
    //
    // `date: null` — this is a drag POOL, not a single day's list.
    // `ScheduleGridStep` (the only consumer) spans up to 7 days; a routine
    // that recurs only later in the week must still be offered, so rung 2
    // (recurrence) is skipped entirely rather than gated on one day's date.
    // Every other rung still applies (fix round 1: an earlier version of
    // this line passed a single `sessionDate`, which made any routine not
    // recurring on day one of the week silently vanish from the drawer).
    draggableRoutines: allRoutines.filter(
      (r) =>
        isDraggableRoutine(r) &&
        resolveRoutine(r, { date: null, prefs: { hideRoutines: true, domain: currentDomain } }).shows,
    ),
    onScheduleRoutine,
    getRoutinesForDate: domainGetRoutinesForDate,
    upkeepItems, upkeepLoading, ensureUpkeepList,
  }), [domainTasks, tasksLoading, domainEvents, isConnected, calendarChecking, domainFetchEvents, createEvent, pushTaskStamped, setBucketStamped, toggleTask, deleteTask, updateTask, createTaskInBucket, createDatedTask, domainProjects, projectsMap, domainGoals, areas, addGoal, addArea, updateGoal, domainRoutines, allRoutines, onScheduleRoutine, domainGetRoutinesForDate, currentDomain, upkeepItems, upkeepLoading, ensureUpkeepList])

  return <GuidedSession horizon={horizon} domain={currentDomain} host={host} onClose={onClose} onFinished={onFinished} onChain={onChain} />
}
