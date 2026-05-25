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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
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
  const { tasks, loading: tasksLoading, addTask, toggleTask, toggleWaiting, deleteTask, updateTask, pushTask, getLinkedTasks } = useSupabaseTasks();
  const { isConnected, events, fetchEvents, isFetching: eventsFetching } = useGoogleCalendar();
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
  const undo = useUndo();

  // UI state local to this container
  const [viewedDate, setViewedDate] = useState<Date>(() => new Date());
  const { selection, setSelection, clearSelection } = useSelection();

  // Map URL selection back to the legacy `selectedItemId` shape HomeView expects
  // (`task-<id>`, `routine-<id>`, etc.). For tasks-new only `task` selections
  // exist via the URL; clicking a task in HomeView routes through onSelectItem
  // which we map to setSelection({kind: 'task', id}).
  const selectedItemId = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === 'task') return `task-${selection.id}`;
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
      // We only own 'task' selections in TasksApp; ignore other kinds for now.
      if (kind !== 'task') return;
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

  const scheduleActionsValue = useMemo<ScheduleActionsValue>(
    () => ({
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
      />
    </ScheduleActionsProvider>
  );
}
