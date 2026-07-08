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
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useGoogleCalendar, CalendarReconnectError } from '@/hooks/useGoogleCalendar';
import { showToast } from '@/hooks/useToast';
import { useVaultWrite } from '@/hooks/useVaultWrite';
import { useGoalsContext } from '@/contexts/GoalsContext';
import { PlanningSession, WeeklyPlanningSession, PlanTodaySession, MonthlyPlanningSession, SeasonalPlanningSession, AnnualPlanningSession } from '@/components/lazy';
import { LoadingFallback } from '@/components/layout/LoadingFallback';
import { isEverydayRoutine, scheduleRoutineOnDate } from '@/lib/routineUtils';
import { parseRoutineTimelineId } from '@/lib/today/doseExpansion';
import { groupItems } from '@/lib/today/groupTasks';
import { useConvertTaskToProject } from '@/hooks/useConvertTaskToProject';
import { parseQuickInput } from '@/lib/quickInputParser';
import type { ParserContext } from '@/lib/quickInputParser';
import type { ResolverContext } from '@/lib/entityResolver';
import type { TodayCaptureResult } from '@/components/schedule/TodayAddInput';
import type { GoalAction } from '@/types/goal';
import type { Task } from '@/types/task';
import type { TimelineCaptureResult } from '@/components/schedule/TimelineQuickInput';
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
import { useNotesContext } from '@/contexts/NotesContext';
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext';
import { withDefaultEventAssignees } from '@/components/home/eventAssigneeDefaults';
import { useUndo } from '@/hooks/useUndo';
import { useResolutionLearning } from '@/hooks/useResolutionLearning';
import { HomeView } from '@/components/home';
import { useSelection } from '@/shell/providers/SelectionProvider';
import { useMealEventsForDate } from '@/shell/providers/MealEventsProvider';

export function HomeViewContainer() {
  // Data hooks
  const { tasks, loading: tasksLoading, addTask, toggleTask, toggleWaiting, deleteTask, updateTask, pushTask, setBucket, getLinkedTasks, refetch } = useSupabaseTasks();
  const { isConnected, events, fetchEvents, isFetching: eventsFetching, updateEvent, createEvent, deleteEvent, removeEventLocal, restoreEventLocal } = useGoogleCalendar();
  const { notes: eventNotesMap, updateEventAssignment, updateEventAssignmentAll, updateEventContext, updateEventProject, updateEventSharedWithFamily, dismissShareNudge } = useEventNotes();
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
  const { addNote } = useNotesContext();
  const { currentDomain } = useDomain();
  const { goals, getCurrentQuarter } = useGoalsContext();
  const vaultWrite = useVaultWrite();
  const undo = useUndo();
  const { aliases, recordOutcome } = useResolutionLearning();

  // UI state local to this container
  const [viewedDate, setViewedDate] = useState<Date>(() => new Date());
  // Planning overlays. In the Shell these are booleans (the legacy app drove the
  // weekly session off a `weekly-planning` stateView; the Shell uses local state).
  const [planningOpen, setPlanningOpen] = useState(false);
  const [weeklyPlanningOpen, setWeeklyPlanningOpen] = useState(false);
  const [planTodayOpen, setPlanTodayOpen] = useState(false);
  // Time-block opened from inside Plan-today: Done should return to the wizard,
  // not strand you on Today with the ritual half-finished.
  const [planningFromWizard, setPlanningFromWizard] = useState(false);
  const [monthlyPlanningOpen, setMonthlyPlanningOpen] = useState(false);
  const [seasonalPlanningOpen, setSeasonalPlanningOpen] = useState(false);
  const [annualPlanningOpen, setAnnualPlanningOpen] = useState(false);
  const { selection, setSelection, clearSelection } = useSelection();

  // "Plan the …" from a horizon rung (or the rhythm nudge) routes here with
  // ?plan=week|month|season|year — open the matching session, then strip the
  // param so a refresh doesn't re-open it.
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    const plan = searchParams.get('plan');
    if (!plan) return;
    if (plan === 'week') setWeeklyPlanningOpen(true);
    else if (plan === 'month') setMonthlyPlanningOpen(true);
    else if (plan === 'season') setSeasonalPlanningOpen(true);
    else if (plan === 'year') setAnnualPlanningOpen(true);
    else if (plan === 'today') setPlanTodayOpen(true);
    else return;
    const next = new URLSearchParams(searchParams);
    next.delete('plan');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // ?date=YYYY-MM-DD (e.g. from search → "jump to this task's day") sets the
  // viewed day, then strips the param (keeps ?detail so the panel stays open).
  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (!dateParam) return;
    const [y, m, d] = dateParam.split('-').map(Number);
    if (y && m && d) setViewedDate(new Date(y, m - 1, d));
    const next = new URLSearchParams(searchParams);
    next.delete('date');
    setSearchParams(next, { replace: true });
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
      // Collection headers ("routine-collection-<uuid>") open the PARENT
      // routine's panel — the generic parse below would mangle the id.
      if (itemId.startsWith('routine-collection-')) {
        setSelection({ kind: 'routine', id: itemId.slice('routine-collection-'.length) });
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
      // For routines, strip any dose slot so the panel looks up the routine row
      // by its real UUID. (e.g. "rx#0" → "rx"). Completion stays slotted.
      const resolvedId = kind === 'routine' ? parseRoutineTimelineId(itemId).routineId : id;
      setSelection({ kind, id: resolvedId });
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

  // Synced calendar events carry no Symphony assignee, and the schedule views
  // (Today/Day/Week/Month) hide events whose assignee isn't selected — so a
  // freshly-synced event vanishes for everyone until manually assigned. Each
  // member only syncs their OWN Google calendars, so default an unassigned
  // event's assignee to the current member. Feeding this into the shared
  // ScheduleActions context covers every view at once. See eventAssigneeDefaults.
  const eventNotesMapWithDefaults = useMemo(
    () => withDefaultEventAssignees(eventNotesMap, events, getCurrentUserMember()?.id),
    [eventNotesMap, events, getCurrentUserMember],
  );

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
    async (raw: string) => {
      // Natural-language parse the quick-add text: pull out date/time, project,
      // contact, assignees, and category, leaving a clean title. e.g.
      // "call macmillan guitars at 930am" → title "call macmillan guitars",
      // scheduled today 9:30am. An explicit time/date wins over the default
      // "today, all-day"; with no date we keep the original add-to-today behavior.
      const parsed = parseQuickInput(raw, { projects, contacts, familyMembers });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const scheduledFor = parsed.dueDate ?? today;
      await addTask(parsed.title || raw, parsed.contactId, parsed.projectId, scheduledFor, {
        assignedTo: parsed.assignedMemberIds?.[0] ?? getCurrentUserMember()?.id,
        assignedToAll: parsed.assignedMemberIds,
        context: currentDomain !== 'universal' ? currentDomain : undefined,
        category: parsed.category,
        // A parsed time means a specific time-of-day → not all-day.
        isAllDay: parsed.dueDate ? false : true,
      });
    },
    [addTask, getCurrentUserMember, currentDomain, projects, contacts, familyMembers],
  );

  const parserContext = useMemo<ParserContext>(
    () => ({ projects, contacts, familyMembers }),
    [projects, contacts, familyMembers],
  );

  const resolverContext = useMemo<ResolverContext>(
    () => ({
      contacts: contacts.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? undefined })),
      aliases,
    }),
    [contacts, aliases],
  );

  const getRecentTaskForContact = useCallback(
    (contactId: string) => {
      const recent = tasks
        .filter((t) => t.contactId === contactId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return recent ? { title: recent.title, date: recent.createdAt } : null;
    },
    [tasks],
  );

  const onCreateTaskParsed = useCallback(
    async (r: TodayCaptureResult) => {
      // Destination routing: one visible input handles all captures.
      if (r.destination === 'note') {
        const note = await addNote({
          content: r.title,
          context: currentDomain !== 'universal' ? currentDomain : undefined,
        });
        showToast(note ? 'Note saved' : 'Could not save the note', note ? 'success' : 'error');
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const toInbox = r.destination === 'inbox' && !r.scheduledFor;
      const taskId = await addTask(
        r.title,
        r.contactId,
        r.projectId,
        // Inbox destination = unscheduled; an explicit parsed date always wins.
        toInbox ? undefined : (r.scheduledFor ?? today),
        {
          assignedTo: r.assignedMemberIds?.[0] ?? getCurrentUserMember()?.id,
          assignedToAll: r.assignedMemberIds,
          context: currentDomain !== 'universal' ? currentDomain : undefined,
          category: r.category,
          isAllDay: toInbox ? undefined : r.scheduledFor ? false : true,
          phoneNumber: r.phoneNumber,
        },
      );
      if (toInbox && taskId) showToast('Added to Inbox', 'success');
      if (r.resolution) {
        recordOutcome({
          inputText: r.resolution.inputText,
          suggestion: r.resolution.suggestion,
          action: r.resolution.action,
          taskId,
        });
      }
    },
    [addTask, addNote, getCurrentUserMember, currentDomain, recordOutcome],
  );

  // Inline timeline "+" create: the TimelineInsertPoint quick-input captures a
  // title + anchor time. Create a real task at that time (addTask buckets it as
  // 'timed' whenever scheduledFor is set, so it lands on the timeline rather
  // than vanishing). Without this handler wired through context the inline add
  // was a silent no-op.
  const onCreateTaskAt = useCallback(
    async (r: TimelineCaptureResult) => {
      await addTask(r.title, r.contactId, r.projectId, r.scheduledFor ?? undefined, {
        assignedTo: getCurrentUserMember()?.id,
        assignedToAll: r.assignedMemberIds,
        context: currentDomain !== 'universal' ? currentDomain : undefined,
        // A timed anchor means a specific time-of-day, so it is not all-day.
        isAllDay: r.scheduledFor ? false : undefined,
      });
    },
    [addTask, getCurrentUserMember, currentDomain],
  );

  // Inline timeline "+" create for the EVENT kind: make a real calendar event
  // at the captured anchor time (default 1h duration), then refetch the day so
  // it shows immediately. Without this the inline event create was a no-op.
  const onCreateEventAt = useCallback(
    async (r: TimelineCaptureResult) => {
      const start = r.scheduledFor ?? viewedDate;
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      await createEvent({
        title: r.title,
        startTime: start,
        endTime: end,
        allDay: !r.scheduledFor,
      });
      // Refresh the viewed day's events so the new one appears right away.
      const startOfDay = new Date(viewedDate); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(viewedDate); endOfDay.setHours(23, 59, 59, 999);
      await fetchEvents(startOfDay, endOfDay);
    },
    [createEvent, fetchEvents, viewedDate],
  );

  // Inline timeline "+" create for the ROUTINE kind: a routine needs a
  // recurrence pattern that doesn't fit a one-line input, so (mirroring
  // WeekViewV2) build a natural-language string from the title + anchor and
  // hand off to the routine builder, which parses recurrence.
  const onCreateRoutineAt = useCallback(
    (r: TimelineCaptureResult) => {
      const anchor = r.scheduledFor ?? viewedDate;
      const weekday = anchor.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const timeStr = anchor
        .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        .toLowerCase()
        .replace(/\s/g, '');
      const initialNl = `${r.title} every ${weekday} at ${timeStr}`;
      navigate(`/routines/new?initial=${encodeURIComponent(initialNl)}`);
    },
    [navigate, viewedDate],
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
  const currentQuarterGoalActions = useMemo<GoalAction[]>(() => {
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

  // Break a quarterly goal action into a horizon: create a LINKED task (carries
  // the action's projectId so the why-chain Task → Project → Goal resolves). The
  // action persists — it's an umbrella that can spawn several chunks over the
  // quarter, so completing one chunk must NOT complete the action.
  const pullGoalActionToBucket = useCallback(async (action: GoalAction, bucket: 'week' | 'month' | 'quarter') => {
    // Bucket rides the INSERT — a follow-up setBucket can race tasksRef and drop.
    await addTask(action.description, undefined, action.projectId, undefined, { bucket });
  }, [addTask]);

  const handleAddGoalActionToWeek = useCallback(
    (action: GoalAction) => pullGoalActionToBucket(action, 'week'),
    [pullGoalActionToBucket],
  );

  // Mid-session capture: create a task straight into a cadence session's bucket
  // (the notebook moment — commitments born during the ritual, not pulled down).
  const createTaskInBucket = useCallback(
    async (title: string, bucket: 'month' | 'quarter') => {
      await addTask(title, undefined, undefined, undefined, {
        assignedTo: getCurrentUserMember()?.id,
        context: currentDomain !== 'universal' ? currentDomain : undefined,
        bucket,
      });
    },
    [addTask, getCurrentUserMember, currentDomain],
  );

  // Bulk-select grouping (Today): wrap a mix of tasks/events/routines into a new
  // wrapper task. Tasks reparent via parentTaskId; events/routines ride as
  // group_members refs (grouping.ts relocates them under the wrapper card).
  const handleGroupItems = useCallback(
    async (
      taskIds: string[],
      memberRefs: import('@/types/task').GroupMemberRef[],
      groupName: string,
      date: Date,
      isAllDay: boolean,
    ) => {
      await groupItems({ taskIds, memberRefs, groupName, date, isAllDay }, { addTask, updateTask, refetch });
    },
    [addTask, updateTask, refetch],
  );

  // Optimistic event delete: drop from the local cache immediately, restore
  // on failure. Google keeps deleted events in calendar trash (~30 days), so
  // a confirmed delete is still recoverable from the Calendar web UI.
  const handleDeleteEvent = useCallback(
    (event: import('@/hooks/useGoogleCalendar').CalendarEvent) => {
      // google_event_id is the reliable key: events from the edge function
      // carry no db `id` (undefined), and removing by undefined wiped the
      // whole local cache (2026-06-12 incident).
      const eventId = event.google_event_id ?? event.id;
      if (!eventId) return;
      // calendar_id (snake_case) comes from the events edge function, but some
      // runtime paths surface it camelCased as calendarId. Without this fallback
      // the delete defaults to 'primary' and Google rejects it (404) for any
      // event on a secondary calendar — the .catch then restores it, so the
      // event "pops right back up". (The legacy App.tsx handler has this fallback;
      // the Shell rewrite dropped it.)
      const calendarId = event.calendar_id ?? event.calendarId;
      removeEventLocal(eventId);
      deleteEvent({ eventId, calendarId }).catch((err) => {
        // Surface the failure — silently restoring looks like the event came
        // back for no reason. showToast is a stable module-level singleton.
        if (err instanceof CalendarReconnectError) {
          showToast('Calendar connection expired. Please reconnect.', 'warning');
        } else {
          console.error('Failed to delete event:', err);
          showToast(err instanceof Error ? err.message : 'Failed to delete event', 'warning');
        }
        restoreEventLocal(event);
      });
    },
    [deleteEvent, removeEventLocal, restoreEventLocal],
  );

  // Expand a task into a new project (subtasks absorbed, parent task deleted).
  const handleConvertTaskToProject = useConvertTaskToProject(tasks, { addProject, updateTask, deleteTask });

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
      onCreateTaskParsed,
      parserContext,
      currentDomain,
      resolverContext,
      getRecentTaskForContact,
      onCreateTaskAt,
      onCreateEventAt,
      onCreateRoutineAt,
      onCreateFollowUp: handleCreateFollowUp,
      onGroupItems: handleGroupItems,
      onOpenTask: (taskId: string) => setSelection({ kind: 'task', id: taskId }),
      onOpenProject: (projectId: string) => navigate(`/projects/${projectId}`),

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
      onShareEventWithFamily: (id: string) => updateEventSharedWithFamily(id, true),
      onDismissShareNudge: (id: string) => dismissShareNudge(id),
      onHideEvent: hideEvent,
      onDeleteEvent: handleDeleteEvent,

      // Reference data
      contactsMap,
      projectsMap,
      projects,
      contacts,
      familyMembers,
      lists,
      listsByCategory,
      eventNotesMap: eventNotesMapWithDefaults,
      eventContextOverrides,

      // List/contact actions
      onAddProject: addProject,
      onConvertTaskToProject: handleConvertTaskToProject,
      onSearchContacts: searchContacts,
      onAddContact: (name, details) => addContact({ name, ...details }),

      // Calendar domain mapping
      getDomainForCalendar,

      // Navigation
      onRefreshInstances: refreshDateInstances,
      onUpdateEventProject: updateEventProject,
    }),
    [
      toggleTask, toggleWaiting, updateTask, pushTask, deleteTask, onCreateTaskFromValue, onCreateTaskParsed, parserContext, currentDomain, resolverContext, getRecentTaskForContact, onCreateTaskAt, onCreateEventAt, onCreateRoutineAt, handleCreateFollowUp, handleGroupItems,
      setSelection, navigate,
      scheduleActions, updateRoutine, updateEventContext, updateEventSharedWithFamily, dismissShareNudge, hideEvent, handleDeleteEvent,
      contactsMap, projectsMap, projects, contacts, familyMembers, lists, listsByCategory,
      eventNotesMapWithDefaults, eventContextOverrides,
      addProject, handleConvertTaskToProject, searchContacts, addContact, getDomainForCalendar,
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
            onClose={() => {
              setPlanningOpen(false);
              if (planningFromWizard) {
                setPlanningFromWizard(false);
                setPlanTodayOpen(true);
              }
            }}
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
            goalActions={currentQuarterGoalActions}
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
            onSetBucket={setBucket}
            onOpenTimeBlock={() => { setPlanTodayOpen(false); setPlanningFromWizard(true); setPlanningOpen(true); }}
            onFlagDiscussion={(taskId, note) => updateTask(taskId, { needsDiscussion: true, discussionNote: note })}
            onRefetchTasks={refetch}
            contacts={contacts}
            routines={allRoutines}
            onUpdateRoutine={(id, input) => updateRoutine(id, input)}
            onCompleteRoutine={(id) => scheduleActions.onCompleteRoutine(id, true)}
          />
        </Suspense>
      )}

      {/* Cadence sessions (Phase 3). Hand-down chains the descent:
          annual → seasonal → monthly → weekly. */}
      {monthlyPlanningOpen && (
        <Suspense fallback={<LoadingFallback />}>
          <MonthlyPlanningSession
            tasks={tasks}
            tasksLoading={tasksLoading}
            onPushTask={pushTask}
            onClose={() => setMonthlyPlanningOpen(false)}
            onHandDown={() => { setMonthlyPlanningOpen(false); setWeeklyPlanningOpen(true); }}
            onSetBucket={setBucket}
            onCompleteTask={toggleTask}
            onCreateTask={(title) => createTaskInBucket(title, 'month')}
            goalActions={currentQuarterGoalActions}
            onPullGoalAction={(a) => pullGoalActionToBucket(a, 'month')}
            links={[
              { label: 'Review routines & delegation', onClick: () => { setMonthlyPlanningOpen(false); navigate('/routines'); } },
              { label: 'Review shopping lists', onClick: () => { setMonthlyPlanningOpen(false); navigate('/lists'); } },
            ]}
          />
        </Suspense>
      )}
      {seasonalPlanningOpen && (
        <Suspense fallback={<LoadingFallback />}>
          <SeasonalPlanningSession
            tasks={tasks}
            tasksLoading={tasksLoading}
            onPushTask={pushTask}
            onClose={() => setSeasonalPlanningOpen(false)}
            onHandDown={() => { setSeasonalPlanningOpen(false); setMonthlyPlanningOpen(true); }}
            onSetBucket={setBucket}
            onCompleteTask={toggleTask}
            onCreateTask={(title) => createTaskInBucket(title, 'quarter')}
            goalActions={currentQuarterGoalActions}
            onPullGoalAction={(a) => pullGoalActionToBucket(a, 'quarter')}
          />
        </Suspense>
      )}
      {annualPlanningOpen && (
        <Suspense fallback={<LoadingFallback />}>
          <AnnualPlanningSession
            tasks={tasks}
            onPushTask={pushTask}
            onClose={() => setAnnualPlanningOpen(false)}
            onHandDown={() => { setAnnualPlanningOpen(false); setSeasonalPlanningOpen(true); }}
            onOpenGoals={() => { setAnnualPlanningOpen(false); navigate('/goals'); }}
          />
        </Suspense>
      )}
    </ScheduleActionsProvider>
  );
}
