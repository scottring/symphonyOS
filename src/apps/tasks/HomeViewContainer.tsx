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
import { PlanningSession } from '@/components/lazy';
import { LoadingFallback } from '@/components/layout/LoadingFallback';
import { isEverydayRoutine, scheduleRoutineOnDate } from '@/lib/routineUtils';
import { PlanFromPaperFlow } from '@/components/capture/PlanFromPaperFlow';
import { planItemToAddTaskArgs, type PlanItem } from '@/lib/planParse';
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config';
import { parseRoutineTimelineId } from '@/lib/today/doseExpansion';
import { groupItems, addToGroup, removeFromGroup, ungroupTasks } from '@/lib/today/groupTasks';
import { useConvertTaskToProject } from '@/hooks/useConvertTaskToProject';
import { parseQuickInput } from '@/lib/quickInputParser';
import type { ParserContext } from '@/lib/quickInputParser';
import type { ResolverContext } from '@/lib/entityResolver';
import type { TodayCaptureResult } from '@/components/schedule/TodayAddInput';
import type { TimelineCaptureResult } from '@/components/schedule/TimelineQuickInput';
import { useEventNotes } from '@/hooks/useEventNotes';
import { useContacts } from '@/hooks/useContacts';
import { useProjects } from '@/hooks/useProjects';
import { useRoutines } from '@/hooks/useRoutines';
import { useActionableInstances } from '@/hooks/useActionableInstances';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useHiddenCalendarEvents } from '@/hooks/useHiddenCalendarEvents';
import { useScheduleFiltering } from '@/hooks/useScheduleFiltering';
import { useInstancesRealtime } from '@/hooks/useInstancesRealtime';
import { useScheduleActions } from '@/hooks/useScheduleActions';
import { useDomain } from '@/hooks/useDomain';
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings';
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible';
import { useDayRollover } from '@/hooks/useDayRollover';
import { filterTasksForDomainView, filterRoutinesForDomain, filterEventsForDomain } from '@/lib/today/domainFilter';
import { useListsContext } from '@/contexts/ListsContext';
import { supabase, getAuthUser } from '@/lib/supabase';
import { TO_BUY_LIST_TITLE, findToBuyList, buyItemText, announceToBuyChanged } from '@/lib/lists/toBuy';
import { useNotesContext } from '@/contexts/NotesContext';
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext';
import { withDefaultEventAssignees } from '@/components/home/eventAssigneeDefaults';
import { useUndo } from '@/hooks/useUndo';
import { UndoToast } from '@/components/undo/UndoToast';
import { useResolutionLearning } from '@/hooks/useResolutionLearning';
import { HomeView } from '@/components/home';
import { useSelection } from '@/shell/providers/SelectionProvider';
import { useMealEventsForDate } from '@/shell/providers/MealEventsProvider';

export function HomeViewContainer({ fixedView }: { fixedView?: 'today' | 'week' } = {}) {
  // Data hooks
  const { tasks, loading: tasksLoading, addTask, toggleTask, toggleWaiting, deleteTask, updateTask, pushTask, getLinkedTasks, refetch, updateTaskOrders } = useSupabaseTasks();
  const { isConnected, events, fetchEvents, isFetching: eventsFetching, updateEvent, createEvent, deleteEvent, removeEventLocal, restoreEventLocal } = useGoogleCalendar();
  // Passing the visible event ids opts in to auto-loading notes (context
  // overrides, assignees, shared-with-family) + realtime — without it those
  // persist to the DB but render stale on every fresh window.
  const visibleEventIds = useMemo(() => events.map((e) => e.google_event_id || e.id), [events]);
  const { notes: eventNotesMap, updateEventAssignment, updateEventAssignmentAll, updateEventContext, updateEventProject, updateEventSharedWithFamily, dismissShareNudge } = useEventNotes(visibleEventIds);
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
  const { lists, listsByCategory, addList } = useListsContext();
  const { addNote } = useNotesContext();
  const { currentDomain } = useDomain();
  const undo = useUndo();
  const { aliases, recordOutcome } = useResolutionLearning();

  // UI state local to this container
  const [viewedDate, setViewedDate] = useState<Date>(() => new Date());
  // Planning overlay. `planningOpen` drives the standalone time-block grid — a
  // Today execution feature. The guided Five-Horizons sessions that also lived
  // here (guidedHorizon / ?plan= deep link) left with the 2026-08
  // analog-planning pivot; planning happens on paper now.
  const [planningOpen, setPlanningOpen] = useState(false);
  // Plan-from-paper (analog-planning pivot): photograph the written plan page,
  // review the parsed items, commit them as placed tasks.
  const [planFromPaperOpen, setPlanFromPaperOpen] = useState(false);
  const { selection, setSelection, clearSelection } = useSelection();

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

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

  // Fetch calendar events for the viewed date.
  const refetchViewedDayEvents = useCallback(async () => {
    if (!isConnected) return;
    const startOfDay = new Date(viewedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(viewedDate);
    endOfDay.setHours(23, 59, 59, 999);
    await fetchEvents(startOfDay, endOfDay);
  }, [isConnected, viewedDate, fetchEvents]);

  useEffect(() => {
    void refetchViewedDayEvents();
  }, [refetchViewedDayEvents]);

  // Google events have no realtime channel and nothing polls them, so the fetch
  // above was the ONLY one a tab ever did — an appointment added in Google after
  // load stayed invisible until a manual reload. Refetch on return to the tab.
  useRefreshOnVisible(refetchViewedDayEvents, { enabled: isConnected });

  // Same one-shot problem on the date itself: `viewedDate` is seeded once at
  // mount, so a tab open past midnight kept rendering yesterday.
  useDayRollover(viewedDate, setViewedDate);

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

  // Schedule filtering (events/routines/instances narrowed to the VIEWED DATE
  // only — domain scoping is each consumer's job; see planningEvents below)
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

  // Completions land in actionable_instances from outside this tree too — the
  // event detail panel (mounts at the Shell level), other windows, the wall,
  // iOS. Refresh the day's instances whenever any of them writes.
  useInstancesRealtime(refreshDateInstances);

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

  // ── Domain-scoped pools for the time-block grid ──
  // useScheduleFiltering only narrows to the VIEWED DATE — HomeView applies the
  // domain scope itself, on its own copy of these props. PlanningSession has no
  // such internal filter, so the container has to hand it already-scoped pools;
  // passing the raw ones leaked e.g. a personal task and family routines into
  // the Family/Personal grid. Same helpers, same semantics as HomeView.
  const planningTasks = useMemo(
    () => filterTasksForDomainView(tasks, currentDomain, getCurrentUserMember()?.id),
    [tasks, currentDomain, getCurrentUserMember],
  );
  const planningRoutines = useMemo(
    () => filterRoutinesForDomain(filteredRoutines, currentDomain),
    [filteredRoutines, currentDomain],
  );
  const planningAllRoutines = useMemo(
    () => filterRoutinesForDomain(allRoutines, currentDomain),
    [allRoutines, currentDomain],
  );
  const planningDraggableRoutines = useMemo(
    () => filterRoutinesForDomain(
      allRoutines.filter(r => r.visibility === 'active' && !isEverydayRoutine(r.recurrence_pattern) && !r.time_of_day),
      currentDomain,
    ),
    [allRoutines, currentDomain],
  );
  const planningEvents = useMemo(
    () => filterEventsForDomain(filteredEvents, currentDomain, {
      eventContextOverrides,
      getDomainForCalendar,
      eventNotesMap: eventNotesMapWithDefaults,
    }),
    [filteredEvents, currentDomain, eventContextOverrides, getDomainForCalendar, eventNotesMapWithDefaults],
  );

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
      await refetchViewedDayEvents();
    },
    [createEvent, refetchViewedDayEvents, viewedDate],
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
      return await groupItems({ taskIds, memberRefs, groupName, date, isAllDay }, { addTask, updateTask, refetch });
    },
    [addTask, updateTask, refetch],
  );

  // Add members to a group that already exists (Today's drag-onto-a-group).
  // `existingMemberRefs` is read HERE, from the live task list, rather than
  // threaded down from the drag layer — addToGroup cannot defend itself against
  // a stale array, and a stale one silently drops every member it doesn't see
  // (Stage 2a residual 4).
  const handleAddToGroup = useCallback(
    async (
      wrapperId: string,
      taskIds: string[],
      memberRefs: import('@/types/task').GroupMemberRef[],
      date: Date,
      isAllDay: boolean,
    ) => {
      const wrapper = tasks.find((t) => t.id === wrapperId);
      await addToGroup(
        {
          wrapperId,
          taskIds,
          memberRefs,
          existingMemberRefs: wrapper?.groupMembers ?? [],
          date,
          isAllDay,
        },
        { addTask, updateTask, refetch },
      );
    },
    [tasks, addTask, updateTask, refetch],
  );

  const handleRemoveFromGroup = useCallback(
    async (taskId: string) => {
      await removeFromGroup(taskId, { updateTask, refetch });
    },
    [updateTask, refetch],
  );

  // Undo of "make a group": detach every child, then delete the wrapper, so
  // the two cards return to being loose rows.
  const handleUngroup = useCallback(
    async (wrapperId: string, childIds: string[]) => {
      await ungroupTasks(wrapperId, childIds, { updateTask, deleteTask, refetch });
    },
    [updateTask, deleteTask, refetch],
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

  // ── "To buy" conversion — task → list item, with undo ──────────────────────
  // The task is DELETED (an item lives in exactly one place — same semantics as
  // inbox send-to-calendar), so the undo path is what makes this acceptable:
  // it removes the created list item and re-inserts the task through addTask,
  // which keeps optimistic state + the local write bus honest. The list is
  // created lazily, native and family-shared — never the Apple bridge.
  const sendTaskToBuy = useCallback(async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return null;
    let list = findToBuyList(lists)
      ?? (await addList({ title: TO_BUY_LIST_TITLE, category: 'shopping', visibility: 'family' }))
      ?? undefined;
    if (!list) return null;
    const { data: { user } } = await getAuthUser();
    if (!user) return null;
    const { data: maxRows } = await supabase
      .from('list_items').select('sort_order')
      .eq('list_id', list.id).order('sort_order', { ascending: false }).limit(1);
    const nextSort = ((maxRows?.[0]?.sort_order as number | undefined) ?? 0) + 1;
    const { data: item, error } = await supabase
      .from('list_items')
      .insert({
        user_id: user.id, list_id: list.id, text: buyItemText(task.title),
        note: task.notes ?? null, sort_order: nextSort,
      })
      .select('id, text').single();
    if (error || !item) return null;
    await deleteTask(taskId);
    announceToBuyChanged();
    const snapshot = task;
    return {
      itemText: (item as { text: string }).text,
      undo: async () => {
        await supabase.from('list_items').delete().eq('id', (item as { id: string }).id);
        await addTask(snapshot.title, snapshot.contactId, snapshot.projectId, snapshot.scheduledFor ?? undefined, {
          context: snapshot.context ?? null,
          assignedTo: snapshot.assignedTo ?? null,
          assignedToAll: snapshot.assignedToAll,
          bucket: snapshot.bucket,
          weekStart: snapshot.weekStart,
          isAllDay: snapshot.isAllDay,
          phoneNumber: snapshot.phoneNumber,
          email: snapshot.email,
        });
        announceToBuyChanged();
      },
    };
  }, [tasks, lists, addList, deleteTask, addTask]);

  const onSetNeededToday = useCallback(
    (taskId: string, neededOn: Date | null) => {
      void updateTask(taskId, { neededOn: neededOn ?? undefined });
    },
    [updateTask],
  );

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
      onSetNeededToday,
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
      onAddToGroup: handleAddToGroup,
      onRemoveFromGroup: handleRemoveFromGroup,
      onRegisterUndo: undo.pushAction,
      onUngroup: handleUngroup,
      onReorderTasks: updateTaskOrders,
      onOpenTask: (taskId: string) => setSelection({ kind: 'task', id: taskId }),
      onSendTaskToBuy: sendTaskToBuy,
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
      toggleTask, toggleWaiting, updateTask, pushTask, deleteTask, onSetNeededToday, onCreateTaskFromValue, onCreateTaskParsed, parserContext, currentDomain, resolverContext, getRecentTaskForContact, onCreateTaskAt, onCreateEventAt, onCreateRoutineAt, handleCreateFollowUp, handleGroupItems, handleAddToGroup, handleRemoveFromGroup, handleUngroup, undo.pushAction, updateTaskOrders,
      setSelection, navigate,
      scheduleActions, updateRoutine, updateEventContext, updateEventSharedWithFamily, dismissShareNudge, hideEvent, handleDeleteEvent, sendTaskToBuy,
      contactsMap, projectsMap, projects, contacts, familyMembers, lists, listsByCategory,
      eventNotesMapWithDefaults, eventContextOverrides,
      addProject, handleConvertTaskToProject, searchContacts, addContact, getDomainForCalendar,
      refreshDateInstances, updateEventProject,
    ],
  );

  // Commit the review sheet's confirmed items: ONE addTask INSERT each, with
  // the placement riding the insert (bucket/weekStart/scheduledFor) — never a
  // follow-up update. Unassigned lines default to the planner.
  const handleCommitPlanItems = useCallback(async (items: PlanItem[]) => {
    const commitCtx = {
      currentWeekStart: weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn),
      context: currentDomain === 'universal' ? null : currentDomain,
    };
    const defaultAssigneeId = getCurrentUserMember()?.id;
    for (const item of items) {
      const args = planItemToAddTaskArgs(item, commitCtx);
      await addTask(args.title, undefined, undefined, args.scheduledFor, {
        ...args.options,
        defaultAssigneeId,
      });
    }
    showToast(`Added ${items.length} task${items.length === 1 ? '' : 's'} from your plan`, 'success', 4000);
  }, [addTask, currentDomain, getCurrentUserMember]);

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
        onOpenPlanFromPaper={() => setPlanFromPaperOpen(true)}
        fixedView={fixedView}
      />

      {planFromPaperOpen && (
        <PlanFromPaperFlow
          members={familyMembers}
          onCommit={handleCommitPlanItems}
          onClose={() => setPlanFromPaperOpen(false)}
        />
      )}

      {planningOpen && (
        <Suspense fallback={<LoadingFallback />}>
          <PlanningSession
            // The time-block grid is Today with a clock on it — it must scope to
            // the chosen domain exactly as Today does. Passing the raw pool here
            // leaked e.g. a personal task into the Family grid.
            tasks={planningTasks}
            events={planningEvents}
            routines={planningRoutines}
            // Untimed, non-daily routines become draggable chips in the drawer.
            draggableRoutines={planningDraggableRoutines}
            // The grid places a dropped routine from its instance's one-day
            // time override, so it needs the instances for the viewed date.
            dateInstances={dateInstances}
            // Only used to resolve a routine DEFERRED INTO a visible day (it
            // doesn't recur there, so the day's own list can't name it). That
            // lookup draws on the grid, so it has to be domain-scoped too —
            // otherwise a family routine deferred to today reappears on the
            // Personal grid through the back door.
            allRoutines={planningAllRoutines}
            onScheduleRoutine={(routineId, date, time) => {
              const routine = allRoutines.find(r => r.id === routineId);
              if (routine) updateRoutine(routineId, scheduleRoutineOnDate(routine, date, time));
            }}
            // This mount is time grain (Today), so a routine drop must write a
            // one-day override rather than rewriting recurrence_pattern — one
            // drag should not move every future occurrence.
            onScheduleRoutineToday={(routineId, when) => {
              void scheduleActions.onPushRoutine?.(routineId, when);
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

      {/* Every action here already registered an undo — this container just
          never rendered the toast, so skipping a routine on Today silently
          offered no way back. Reported after an accidental skip. */}
      <UndoToast
        action={undo.currentAction}
        onUndo={undo.executeUndo}
        onDismiss={undo.dismiss}
      />
    </ScheduleActionsProvider>
  );
}
