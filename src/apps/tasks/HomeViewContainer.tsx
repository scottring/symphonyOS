// src/apps/tasks/HomeViewContainer.tsx
//
// During P4 the legacy /today path keeps using App.tsx -> ViewRouter -> HomeView
// with prop-drilled state. The new /tasks-new/today path uses this container,
// which fetches the same data via context-based hooks and renders the same
// HomeView component. The two parallel mounts share zero state during the
// parallel-path phase (P4-A) and will be unified at cutover (P4.8).
//
// P4.5 lifted meal-events synthesis to MealEventsProvider; this container now
// consumes useMealEventsForDate(viewedDate). The legacy App.tsx still has its
// own copy until full cutover (then the legacy synthesis becomes dead code).

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useVaultWrite } from '@/hooks/useVaultWrite';
import { useGoalsContext } from '@/contexts/GoalsContext';
import { PlanningSession, WeeklyPlanningSession, PlanTodaySession } from '@/components/lazy';
import { LoadingFallback } from '@/components/layout/LoadingFallback';
import { isEverydayRoutine, scheduleRoutineOnDate } from '@/lib/routineUtils';
import type { GoalAction } from '@/types/goal';
import type { Task } from '@/types/task';
import { useEventNotes } from '@/hooks/useEventNotes';
import { useContacts } from '@/hooks/useContacts';
import { useProjects } from '@/hooks/useProjects';
import { useRoutines } from '@/hooks/useRoutines';
import { useActionableInstances } from '@/hooks/useActionableInstances';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useHiddenCalendarEvents } from '@/hooks/useHiddenCalendarEvents';
import { useScheduleFiltering } from '@/hooks/useScheduleFiltering';
import { useScheduleActions } from '@/hooks/useScheduleActions';
import { useDomain } from '@/hooks/useDomain';
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings';
import { useListsContext } from '@/contexts/ListsContext';
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext';
import { useUndo } from '@/hooks/useUndo';
import { HomeView } from '@/components/home';
import { useSelection } from '@/shell/providers/SelectionProvider';
import { useMealEventsForDate } from '@/shell/providers/MealEventsProvider';

export function HomeViewContainer() {
  // Data hooks
  const { tasks, loading: tasksLoading, addTask, toggleTask, toggleWaiting, deleteTask, updateTask, pushTask, setBucket, getLinkedTasks } = useSupabaseTasks();
  const { isConnected, events, fetchEvents, isFetching: eventsFetching, updateEvent } = useGoogleCalendar();
  const { notes: eventNotesMap, updateEventAssignment, updateEventAssignmentAll, updateEventContext, updateEventProject } = useEventNotes();
  const { contacts, contactsMap, addContact, searchContacts } = useContacts();
  const { projects, projectsMap, addProject } = useProjects();
  const {
    routines: allRoutines,
    activeRoutines,
    getRoutinesForDate,
    loading: routinesLoading,
    updateRoutine,
    deleteRoutine,
  } = useRoutines();
  const { getInstancesForDate, markDone, undoDone, skip, reschedule } = useActionableInstances();
  const { members: familyMembers, getCurrentUserMember } = useFamilyMembers();
  const { isHidden: isEventHidden, hideEvent } = useHiddenCalendarEvents();
  const { getDomainForCalendar } = useCalendarDomainMappings();
  const { lists, listsByCategory } = useListsContext();
  const { currentDomain } = useDomain();
  const { goals, getCurrentQuarter } = useGoalsContext();
  const vaultWrite = useVaultWrite();
  const undo = useUndo();

  // UI state local to this container
  const [viewedDate, setViewedDate] = useState<Date>(() => new Date());
  // Planning overlays. In the Shell these are booleans (the legacy app drove the
  // weekly session off a `weekly-planning` stateView; the Shell uses local state).
  const [planningOpen, setPlanningOpen] = useState(false);
  const [weeklyPlanningOpen, setWeeklyPlanningOpen] = useState(false);
  const [planTodayOpen, setPlanTodayOpen] = useState(false);
  const { selection, setSelection, clearSelection } = useSelection();

  // "Plan the week" from the This Week rung routes here with ?plan=week —
  // open the wired WeeklyPlanningSession, then strip the param so a refresh
  // doesn't re-open it.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('plan') === 'week') {
      setWeeklyPlanningOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('plan');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Map URL selection back to the legacy `selectedItemId` shape HomeView expects
  // (`task-<id>`, `routine-<id>`, `event-<id>`). The TimelineCard uses this to
  // highlight the selected row. Meal selections highlight as their underlying
  // `event-<meal:id>` row (HomeView emits meals as event-prefixed ids).
  const selectedItemId = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === 'meal') return `event-${selection.id}`;
    if (selection.kind === 'task' || selection.kind === 'routine' || selection.kind === 'event') {
      return `${selection.kind}-${selection.id}`;
    }
    return null;
  }, [selection]);

  const handleSelectItem = useCallback(
    (itemId: string | null) => {
      if (!itemId) {
        clearSelection();
        return;
      }
      // legacy itemId is "<kind>-<id>" — translate to selection ref
      const dashIdx = itemId.indexOf('-');
      if (dashIdx <= 0) return;
      const kind = itemId.slice(0, dashIdx);
      const id = itemId.slice(dashIdx + 1);
      // Meals ride on the `event-` prefix with an id of `meal:<entryId>`;
      // promote them to their own `meal` kind so the meal panel opens.
      if (kind === 'event' && id.startsWith('meal:')) {
        setSelection({ kind: 'meal', id });
        return;
      }
      // TasksApp owns task/routine/event/meal; ignore anything else.
      if (kind !== 'task' && kind !== 'routine' && kind !== 'event') return;
      setSelection({ kind, id });
    },
    [setSelection, clearSelection],
  );

  // Fetch calendar events for the viewed date
  useEffect(() => {
    if (!isConnected) return;
    const startOfDay = new Date(viewedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(viewedDate);
    endOfDay.setHours(23, 59, 59, 999);
    fetchEvents(startOfDay, endOfDay);
  }, [isConnected, viewedDate, fetchEvents]);

  // ── Meal-plan entries synthesized as CalendarEvent objects ──
  // Sourced from <MealEventsProvider> mounted in Shell. Legacy App.tsx still
  // has its own copy of this synthesis; that becomes dead code post-cutover.
  const mealEvents = useMealEventsForDate(viewedDate);
  const eventsWithMeals = useMemo(() => [...events, ...mealEvents], [events, mealEvents]);

  // Schedule filtering (events/routines/instances filtered to viewed date + domain)
  const { filteredEvents, filteredRoutines, dateInstances, refreshDateInstances } = useScheduleFiltering({
    viewedDate,
    events: eventsWithMeals,
    allRoutines,
    getRoutinesForDate,
    getInstancesForDate,
    isEventHidden,
    tasksLoading,
    routinesLoading,
    getLinkedTasks,
    addTask,
    getCurrentUserMember,
  });

  // Schedule action handlers
  const scheduleActions = useScheduleActions({
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
    pushAction: undo.pushAction,
  });

  const eventContextOverrides = useMemo(() => {
    const overrides = new Map<string, import('@/types/task').TaskContext>();
    for (const [eventId, note] of eventNotesMap) {
      if (note.context) overrides.set(eventId, note.context);
    }
    return overrides;
  }, [eventNotesMap]);

  const onCreateTaskFromValue = useCallback(
    async (title: string) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await addTask(title, undefined, undefined, today, {
        assignedTo: getCurrentUserMember()?.id,
        context: currentDomain !== 'universal' ? currentDomain : undefined,
        isAllDay: true,
      });
    },
    [addTask, getCurrentUserMember, currentDomain],
  );

  const handleCreateFollowUp = useCallback(
    async (title: string, sourceTaskId: string) => {
      const sourceTask = tasks.find(t => t.id === sourceTaskId);
      if (!sourceTask) return;
      const fullTitle = `${sourceTask.title}: ${title}`;
      await addTask(
        fullTitle,
        sourceTask.contactId,
        sourceTask.projectId,
        viewedDate,
        {
          assignedTo: sourceTask.assignedTo ?? getCurrentUserMember()?.id,
          context: sourceTask.context,
          category: sourceTask.category,
          parentTaskId: sourceTask.id,
        },
      );
    },
    [tasks, addTask, viewedDate, getCurrentUserMember],
  );

  // ── Weekly-planning support (reconstructed from App.tsx) ──
  // Current-quarter incomplete goal actions, surfaced in the weekly session so
  // quarterly intentions can be pulled into the week.
  const weeklyGoalActions = useMemo<GoalAction[]>(() => {
    const q = getCurrentQuarter();
    return goals.flatMap(g => g.actions).filter(a => a.quarter === q && !a.completed);
  }, [goals, getCurrentQuarter]);

  // Persist a completed weekly planning session as a vault note.
  const saveWeeklyPlanToVault = useCallback(
    async ({ weekId, priorities, concerns }: { weekId: string; priorities: Task[]; concerns: string }): Promise<{ ok: boolean }> => {
      const { formatWeeklyNote } = await import('@/components/planning/weekly/weeklyPlanning');
      const scheduleSummary = priorities
        .filter(t => t.scheduledFor)
        .map(t => `- ${t.title} (${new Date(t.scheduledFor as Date).toLocaleDateString()})`)
        .join('\n');
      const note = formatWeeklyNote({ weekId, priorities, scheduleSummary, concerns });
      const result = await vaultWrite.createVaultNote(
        { title: note.title, content: note.content, path: note.path },
        `Weekly plan: ${weekId}`,
      );
      return { ok: !!result?.success };
    },
    [vaultWrite],
  );

  // Pull a quarterly goal action into the week as a new 'week'-bucket task.
  const handleAddGoalActionToWeek = useCallback(async (action: GoalAction) => {
    const id = await addTask(action.description);
    if (id) await setBucket(id, 'week');
  }, [addTask, setBucket]);

  const scheduleActionsValue = useMemo<ScheduleActionsValue>(
    () => ({
      // Planning
      onOpenPlanning: () => setPlanningOpen(true),

      // Task actions
      onToggleTask: toggleTask,
      onToggleWaiting: toggleWaiting,
      onUpdateTask: updateTask,
      onPushTask: pushTask,
      onDeleteTask: deleteTask,
      onCreateTask: onCreateTaskFromValue,
      onCreateFollowUp: handleCreateFollowUp,
      onOpenTask: (taskId: string) => setSelection({ kind: 'task', id: taskId }),

      // Assignment actions
      onAssignTask: scheduleActions.onAssignTask,
      onAssignTaskAll: scheduleActions.onAssignTaskAll,
      onAssignEvent: scheduleActions.onAssignEvent,
      onAssignEventAll: scheduleActions.onAssignEventAll,
      onAssignRoutine: scheduleActions.onAssignRoutine,
      onAssignRoutineAll: scheduleActions.onAssignRoutineAll,

      // Routine actions
      onCompleteRoutine: scheduleActions.onCompleteRoutine,
      onSkipRoutine: scheduleActions.onSkipRoutine,
      onPushRoutine: scheduleActions.onPushRoutine,
      onDeleteRoutine: scheduleActions.onDeleteRoutine,
      onUpdateRoutine: updateRoutine,

      // Event actions
      onCompleteEvent: scheduleActions.onCompleteEvent,
      onSkipEvent: scheduleActions.onSkipEvent,
      onPushEvent: scheduleActions.onPushEvent,
      onUpdateEventContext: updateEventContext,
      onHideEvent: hideEvent,

      // Reference data
      contactsMap,
      projectsMap,
      projects,
      contacts,
      familyMembers,
      lists,
      listsByCategory,
      eventNotesMap,
      eventContextOverrides,

      // List/contact actions
      onAddProject: addProject,
      onSearchContacts: searchContacts,
      onAddContact: (name, details) => addContact({ name, ...details }),

      // Calendar domain mapping
      getDomainForCalendar,

      // Navigation
      onRefreshInstances: refreshDateInstances,
      onUpdateEventProject: updateEventProject,
    }),
    [
      toggleTask, toggleWaiting, updateTask, pushTask, deleteTask, onCreateTaskFromValue, handleCreateFollowUp,
      setSelection,
      scheduleActions, updateRoutine, updateEventContext, hideEvent,
      contactsMap, projectsMap, projects, contacts, familyMembers, lists, listsByCategory,
      eventNotesMap, eventContextOverrides,
      addProject, searchContacts, addContact, getDomainForCalendar,
      refreshDateInstances, updateEventProject,
    ],
  );

  return (
    <ScheduleActionsProvider value={scheduleActionsValue}>
      <HomeView
        tasks={tasks}
        events={filteredEvents}
        routines={filteredRoutines}
        allActiveRoutines={activeRoutines}
        projects={projects}
        dateInstances={dateInstances}
        selectedItemId={selectedItemId}
        onSelectItem={handleSelectItem}
        loading={tasksLoading || eventsFetching || routinesLoading}
        viewedDate={viewedDate}
        onDateChange={setViewedDate}
        currentUserMemberId={getCurrentUserMember()?.id}
        onOpenWeeklyPlanning={() => setWeeklyPlanningOpen(true)}
        onOpenPlanToday={() => setPlanTodayOpen(true)}
      />

      {planningOpen && (
        <Suspense fallback={<LoadingFallback />}>
          <PlanningSession
            tasks={tasks}
            events={filteredEvents}
            routines={filteredRoutines}
            // Untimed, non-daily routines become draggable chips in the drawer.
            draggableRoutines={allRoutines.filter(r => r.visibility === 'active' && !isEverydayRoutine(r.recurrence_pattern) && !r.time_of_day)}
            onScheduleRoutine={(routineId, date, time) => {
              const routine = allRoutines.find(r => r.id === routineId);
              if (routine) updateRoutine(routineId, scheduleRoutineOnDate(routine, date, time));
            }}
            onRescheduleEvent={(event, startTime, endTime) =>
              updateEvent({
                eventId: event.google_event_id || event.id,
                startTime,
                endTime,
                calendarId: event.calendar_id || event.calendarId,
              })
            }
            initialDate={viewedDate}
            onClose={() => setPlanningOpen(false)}
            onUpdateTask={updateTask}
            onPushTask={pushTask}
            familyMembers={familyMembers}
            eventNotesMap={eventNotesMap}
          />
        </Suspense>
      )}

      {weeklyPlanningOpen && (
        <Suspense fallback={<LoadingFallback />}>
          <WeeklyPlanningSession
            tasks={tasks}
            events={filteredEvents}
            routines={filteredRoutines}
            initialDate={viewedDate}
            onClose={() => setWeeklyPlanningOpen(false)}
            onUpdateTask={updateTask}
            onPushTask={pushTask}
            onSavePlanToVault={saveWeeklyPlanToVault}
            goalActions={weeklyGoalActions}
            onAddGoalAction={handleAddGoalActionToWeek}
            onSelectDay={(date) => { setViewedDate(date); setWeeklyPlanningOpen(false); }}
            allRoutines={allRoutines}
            onUpdateRoutine={updateRoutine}
            onCompleteTask={toggleTask}
            onDeleteTask={deleteTask}
          />
        </Suspense>
      )}

      {planTodayOpen && (
        <Suspense fallback={<LoadingFallback />}>
          <PlanTodaySession
            tasks={tasks}
            events={filteredEvents}
            viewedDate={viewedDate}
            onClose={() => setPlanTodayOpen(false)}
            onPushTask={pushTask}
            onCompleteTask={toggleTask}
            onOpenTimeBlock={() => { setPlanTodayOpen(false); setPlanningOpen(true); }}
          />
        </Suspense>
      )}
    </ScheduleActionsProvider>
  );
}
