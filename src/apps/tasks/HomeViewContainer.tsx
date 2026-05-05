// src/apps/tasks/HomeViewContainer.tsx
//
// During P4 the legacy /today path keeps using App.tsx -> ViewRouter -> HomeView
// with prop-drilled state. The new /tasks-new/today path uses this container,
// which fetches the same data via context-based hooks and renders the same
// HomeView component. The two parallel mounts share zero state during the
// parallel-path phase (P4-A) and will be unified at cutover (P4.8).
//
// NOTE: The meal-events synthesis is duplicated from App.tsx. P4.5 lifts that
// into a MealEventsProvider so both paths share one implementation; until then
// the duplication is intentional.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useGoogleCalendar, type CalendarEvent } from '@/hooks/useGoogleCalendar';
import { useEventNotes } from '@/hooks/useEventNotes';
import { useContacts } from '@/hooks/useContacts';
import { useProjects } from '@/hooks/useProjects';
import { useRoutines } from '@/hooks/useRoutines';
import { useActionableInstances } from '@/hooks/useActionableInstances';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useHiddenCalendarEvents } from '@/hooks/useHiddenCalendarEvents';
import { useMealPlan } from '@/hooks/useMealPlan';
import { useRecipes } from '@/hooks/useRecipes';
import { useScheduleFiltering } from '@/hooks/useScheduleFiltering';
import { useScheduleActions } from '@/hooks/useScheduleActions';
import { useDomain } from '@/hooks/useDomain';
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings';
import { useListsContext } from '@/contexts/ListsContext';
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext';
import { useUndo } from '@/hooks/useUndo';
import { sundayOfWeek } from '@/lib/weekHelpers';
import { HomeView } from '@/components/home';
import { useSelection } from '@/shell/providers/SelectionProvider';

export function HomeViewContainer() {
  // Data hooks
  const { tasks, loading: tasksLoading, addTask, toggleTask, toggleWaiting, deleteTask, updateTask, pushTask, getLinkedTasks } = useSupabaseTasks();
  const { isConnected, events, fetchEvents, isFetching: eventsFetching } = useGoogleCalendar();
  const { notes: eventNotesMap, updateEventAssignment, updateEventAssignmentAll, updateEventContext, updateEventProject } = useEventNotes();
  const { contacts, contactsMap, addContact, searchContacts } = useContacts();
  const { projects, projectsMap, addProject } = useProjects();
  const {
    routines: allRoutines,
    getRoutinesForDate,
    loading: routinesLoading,
    updateRoutine,
  } = useRoutines();
  const { getInstancesForDate, markDone, undoDone, skip, reschedule } = useActionableInstances();
  const { members: familyMembers, getCurrentUserMember } = useFamilyMembers();
  const { isHidden: isEventHidden, hideEvent } = useHiddenCalendarEvents();
  const { getDomainForCalendar } = useCalendarDomainMappings();
  const { lists, listsByCategory } = useListsContext();
  const { currentDomain } = useDomain();
  const undo = useUndo({ duration: 5000 });

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
  // Duplicated from App.tsx until P4.5 lifts to MealEventsProvider.
  const mealWeekStart = useMemo(() => sundayOfWeek(viewedDate), [viewedDate]);
  const { plan: mealPlanForEvents } = useMealPlan(mealWeekStart);
  const { recipes: mealRecipesForEvents } = useRecipes();
  const mealEvents = useMemo<CalendarEvent[]>(() => {
    if (!mealPlanForEvents) return [];
    const SLOT_TIMES: Record<string, [number, number]> = {
      breakfast: [7, 30], lunch: [12, 30], snack: [15, 30], dinner: [18, 30], prep: [16, 0],
      lunch_iris: [12, 30], lunch_scott: [12, 30], kid_alternate: [18, 30],
    };
    const dow = viewedDate.getDay();
    const currentMemberId = getCurrentUserMember()?.id ?? null;
    const memberById = new Map(familyMembers.map(m => [m.id, m]));
    const recipeTitleById = new Map(mealRecipesForEvents.map(r => [r.id, r.title]));
    const groups = new Map<string, { slot: string; title: string; entryIds: string[] }>();
    for (const e of mealPlanForEvents.entries) {
      if (e.dayOfWeek !== dow) continue;
      if (!SLOT_TIMES[e.slot]) continue;
      if (e.familyMemberId != null) {
        const isCurrent = e.familyMemberId === currentMemberId;
        const target = memberById.get(e.familyMemberId);
        const isKid = target ? !target.auth_user_id : false;
        if (!isCurrent && !isKid) continue;
      }
      const title = e.recipeId ? (recipeTitleById.get(e.recipeId) ?? '(unnamed)') : (e.adHocTitle ?? '(unnamed)');
      const key = `${e.slot}|${title}`;
      const existing = groups.get(key);
      if (existing) existing.entryIds.push(e.id);
      else groups.set(key, { slot: e.slot, title, entryIds: [e.id] });
    }
    const out: CalendarEvent[] = [];
    for (const [, { slot, title, entryIds }] of groups) {
      const [hh, mm] = SLOT_TIMES[slot]!;
      const start = new Date(viewedDate); start.setHours(hh, mm, 0, 0);
      const end = new Date(start.getTime() + 45 * 60 * 1000);
      const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
      out.push({
        id: `meal:${entryIds[0]}`,
        title: `${slotLabel} · ${title}`,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        all_day: false,
        calendar_name: 'Meals',
        calendar_color: '#0F8A4A',
      });
    }
    return out;
  }, [mealPlanForEvents, mealRecipesForEvents, viewedDate, familyMembers, getCurrentUserMember]);
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
