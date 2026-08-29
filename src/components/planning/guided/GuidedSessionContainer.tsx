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
import { useDomain } from '@/hooks/useDomain'
import type { DomainId } from '@/lib/domains'
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings'
import { isDraggableRoutine, resolveRoutineEligible } from '@/lib/routineUtils'
import { filterTasksForLayers, filterEventsForLayers, filterRoutinesForLayers, filterByLayers } from '@/lib/today/domainFilter'
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
  soleDomain: DomainId | null,
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
    context: soleDomain ?? undefined,
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
  const { layers, soleDomain } = useDomain()
  const { getDomainForCalendar } = useCalendarDomainMappings()

  // Layer scoping — the ONE place the session pool narrows. Every step reads
  // host.tasks/projects/goals/events/routines, so filtering here scopes review,
  // write-list, look-above, the grid, someday and overdue without per-step
  // changes. An item shows iff the layer its context maps to is checked;
  // untagged items are the Unsorted layer — visible whenever Unsorted is
  // checked, same as the whole-life session used to show them.
  const domainTasks = useMemo(() => filterTasksForLayers(tasks, layers), [tasks, layers])
  const domainProjects = useMemo(() => filterByLayers(projects, layers), [projects, layers])
  const domainGoals = useMemo(() => filterByLayers(goals, layers), [goals, layers])
  // Events scope at the calendar→domain level (this container doesn't load
  // event notes, so per-event overrides/family shares don't refine it here).
  const domainEvents = useMemo(
    () => filterEventsForLayers(events, layers, { getDomainForCalendar }),
    [events, layers, getDomainForCalendar],
  )
  // CalendarStep reads fetchEvents' RETURN value (not host.events), so the
  // range fetch must come back already layer-scoped too.
  const domainFetchEvents = useCallback(
    async (start: Date, end: Date) =>
      filterEventsForLayers(await fetchEvents(start, end), layers, { getDomainForCalendar }),
    [fetchEvents, layers, getDomainForCalendar],
  )
  // KEPT (not folded into resolveRoutine): these two feed `host.routines` /
  // `host.getRoutinesForDate`, which reach PlanningSession directly.
  // PlanningSession has no layer concept of its own — it hardcodes rung 4 to
  // "show everything" (see PlanningSession.tsx) because every caller already
  // hands it a layer-scoped pool. Deleting this pre-filter would remove layer
  // scoping from the guided week grid entirely, not replace it — the exact
  // "raw pool leaked a family routine into the Personal grid" bug HomeView-
  // Container's own comments describe. Only `draggableRoutines` below moves
  // to resolveRoutine, where the real `layers` IS threaded through.
  const domainRoutines = useMemo(() => filterRoutinesForLayers(allRoutines, layers), [allRoutines, layers])
  const domainGetRoutinesForDate = useCallback(
    (date: Date) => filterRoutinesForLayers(getRoutinesForDate(date), layers),
    [getRoutinesForDate, layers],
  )
  // Untagged inbox items stay visible whenever Unsorted is checked — pre-triage,
  // tagging IS the work. Routing one from here also stamps the session's sole
  // domain first (when the session IS a single domain), otherwise it would land
  // on a list this session hides. Sequential awaits: updateTask writes only the
  // supplied columns, so the stamp and the route never clobber each other.
  const stampDomain = useCallback(async (id: string) => {
    if (!soleDomain) return
    const t = tasks.find((x) => x.id === id)
    if (t && !t.context) await updateTask(id, { context: soleDomain })
  }, [soleDomain, tasks, updateTask])
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
      ...buildAddTaskOptions(bucket, opts, soleDomain),
      assignedTo: getCurrentUserMember()?.id,
    })
  }, [addTask, getCurrentUserMember, soleDomain])

  const createDatedTask = useCallback(async (title: string, date: Date) => {
    await addTask(title, undefined, undefined, date, {
      assignedTo: getCurrentUserMember()?.id,
      context: soleDomain ?? undefined,
      isAllDay: true,
    })
  }, [addTask, getCurrentUserMember, soleDomain])

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
    addGoal: (areaId: string, name: string) => addGoal(areaId, name, soleDomain ?? undefined),
    addArea: (name: string) => addArea(name),
    updateGoalStatus: (id: string, status: GoalStatus) => updateGoal(id, { status }),
    carryGoal: (id: string) => updateGoal(id, { year: new Date().getFullYear(), status: 'active' }),
    routines: domainRoutines,
    // resolveRoutine replaces the hand-rolled visibility/everyday/timed check
    // — same rungs (resting, everyday-sweep, timed) plus the ones the old
    // predicate never asked (off-timeline, not-theirs, in-collection).
    // `allRoutines` (not domainRoutines) because rung 4 does the domain scoping
    // itself here. `hideRoutines: true` is intentional and preserves the old
    // everyday-sweep exclusion: a guided session is for placing non-routine
    // work, so ambient everyday routines are never drag candidates.
    //
    // resolveRoutineEligible (not resolveRoutine + date: null) — this is a
    // drag POOL, not a single day's list. `ScheduleGridStep` (the only
    // consumer) spans up to 7 days; a routine that recurs only later in the
    // week must still be offered, so rung 2 (recurrence) is skipped
    // entirely rather than gated on one day's date. Every other rung still
    // applies (fix round 1: an earlier version of this line passed a
    // single `sessionDate`, which made any routine not recurring on day one
    // of the week silently vanish from the drawer; fix round 2 named the
    // date-agnostic question so this call site can't accidentally pass a
    // real date and get the wrong rung-2 behavior with no type error).
    draggableRoutines: allRoutines.filter(
      (r) => isDraggableRoutine(r) && resolveRoutineEligible(r, { prefs: { hideRoutines: true, layers } }).shows,
    ),
    onScheduleRoutine,
    getRoutinesForDate: domainGetRoutinesForDate,
    upkeepItems, upkeepLoading, ensureUpkeepList,
  }), [domainTasks, tasksLoading, domainEvents, isConnected, calendarChecking, domainFetchEvents, createEvent, pushTaskStamped, setBucketStamped, toggleTask, deleteTask, updateTask, createTaskInBucket, createDatedTask, domainProjects, projectsMap, domainGoals, areas, addGoal, addArea, updateGoal, domainRoutines, allRoutines, onScheduleRoutine, domainGetRoutinesForDate, soleDomain, layers, upkeepItems, upkeepLoading, ensureUpkeepList])

  return <GuidedSession horizon={horizon} domain={soleDomain} host={host} onClose={onClose} onFinished={onFinished} onChain={onChain} />
}
