// src/shell/useShellChrome.ts
//
// Sources the data + handlers the Shell's app chrome (ShellLayout) needs:
// QuickCapture (inbox / rich / note), pinned items, and reference lists for
// the natural-language parser. This mirrors the wiring App.tsx feeds into the
// legacy <AppShell>, but pulls everything from the shared data hooks directly
// (not from props) so the chrome works on every Shell route — including mobile,
// which previously rendered no chrome at all.
//
// Must be used inside <NotesProvider> + <ListsProvider> (ShellLayout wraps its
// tree in both) and the global <DomainProvider> (mounted in main.tsx).

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ConfirmationToastMessage } from '@/components/toast';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import type { TaskCategory } from '@/types/task';
import type { RecurrencePattern } from '@/types/actionable';
import { recurrenceToRRule } from '@/lib/quickRecurrence';
import { useProjects } from '@/hooks/useProjects';
import { useContacts } from '@/hooks/useContacts';
import { useRoutines } from '@/hooks/useRoutines';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings';
import { usePinsContext } from '@/contexts/PinsContext';
import { useNotesContext } from '@/contexts/NotesContext';
import { useListsContext } from '@/contexts/ListsContext';
import { useToast } from '@/hooks/useToast';
import { useSelection } from './providers/SelectionProvider';
import { useNavigate } from 'react-router-dom';
import { useDomain } from '@/hooks/useDomain';
import { layerOf } from '@/lib/domains';
import { audienceLabel, contextLabel, hiddenByView } from '@/lib/capture/destination';
import type { TaskContext } from '@/types/task';
import { useDesktopBridge } from '@/desktop/useDesktopBridge';
import type { PinnableEntityType } from '@/types/pin';

interface QuickAddRichData {
  title: string;
  projectId?: string;
  contactId?: string;
  scheduledFor?: Date;
  /** A date with no time (chrono was uncertain of the hour) lands all-day. */
  isAllDay?: boolean;
  durationMinutes?: number;
  category?: TaskCategory;
  context?: 'work' | 'family' | 'personal';
  assignedMemberIds?: string[];
  /** "every tuesday and thurs" — a calendar series for an event, a routine otherwise. */
  recurrence?: RecurrencePattern;
}

interface QuickAddNoteData {
  content: string;
  topicName?: string;
}

export function useShellChrome() {
  const { tasks, addTask, pushTask } = useSupabaseTasks();
  // Mac shell (desktop/): native menu nav, ⌘N capture, tray feed. No-op in browsers.
  useDesktopBridge(tasks);
  const { projects } = useProjects();
  const { contacts } = useContacts();
  const { routines: allRoutines, addRoutine } = useRoutines();
  const { members: familyMembers, getCurrentUserMember } = useFamilyMembers();
  const { isConnected, createEvent, fetchEvents, defaultCalendarId } = useGoogleCalendar();
  const { getCalendarForDomain, getDomainForCalendar } = useCalendarDomainMappings();
  // The shell-wide instance, shared with whatever app is routed below —
  // a private copy here would not see a pin made from /lists.
  const pinnedItems = usePinsContext();
  const { addNote, activeTopics, addTopic } = useNotesContext();
  const { lists } = useListsContext();
  const { toast, showToast, dismissToast } = useToast();
  const { setSelection } = useSelection();
  const navigate = useNavigate();
  const { layers, toggle: toggleLayer } = useDomain();

  // ── Capture confirmation: an inbox capture is otherwise silent, which reads
  // as "did that even save?". Confirm it landed and offer one-tap scheduling
  // so the common capture→triage roundtrip collapses into the toast. ──
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmationToast, setConfirmationToast] = useState<ConfirmationToastMessage | null>(null);

  const dismissConfirmationToast = useCallback(() => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = null;
    setConfirmationToast(null);
  }, []);

  // The confirmation says WHERE it went and WHO will see it, offers "View",
  // and — when the current tag filter would hide it — says so and offers an
  // explicit "Show" that widens the filter. Never a silent filter or privacy
  // change (Scott + outside review, 2026-09-20).
  const showCaptureConfirmation = useCallback(
    (taskId: string, context: TaskContext | null | undefined) => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      const scheduleFor = (daysFromNow: number) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + daysFromNow);
        void pushTask(taskId, d);
        showToast(daysFromNow === 0 ? 'Scheduled for today' : 'Scheduled for tomorrow', 'success');
      };
      const hidden = hiddenByView(context, layers);
      const layer = layerOf(context);
      setConfirmationToast({
        id: taskId,
        message: `Added to Inbox · ${contextLabel(context)} · ${audienceLabel(context)}`,
        hint: hidden ? `Hidden by your current view (${contextLabel(context)} is unchecked).` : 'All set — or schedule it now:',
        actions: [
          { label: 'View', onClick: () => { dismissConfirmationToast(); navigate(`/task/${taskId}`); } },
          ...(hidden ? [{ label: `Show ${contextLabel(context)}`, onClick: () => { toggleLayer(layer); dismissConfirmationToast(); } }] : []),
          { label: 'Today', onClick: () => scheduleFor(0) },
          { label: 'Tomorrow', onClick: () => scheduleFor(1) },
        ],
      });
      confirmTimerRef.current = setTimeout(() => setConfirmationToast(null), 10000);
    },
    [pushTask, showToast, layers, toggleLayer, navigate, dismissConfirmationToast],
  );

  // ── QuickCapture handlers (mirror App.tsx) ──
  const onQuickAdd = useCallback(
    async (title: string) => {
      const taskId = await addTask(title, undefined, undefined, undefined, {
        assignedTo: getCurrentUserMember()?.id,
        context: undefined,
      });
      if (taskId) showCaptureConfirmation(taskId, null);
    },
    [addTask, getCurrentUserMember, showCaptureConfirmation],
  );

  const onQuickAddRich = useCallback(
    async (data: QuickAddRichData) => {
      // Event with a date + connected calendar → create in Google Calendar only.
      // With a recurrence it's a series: the parsed date is the first
      // occurrence, the RRULE carries the rest. A pattern the calendar can't
      // express (since-last, specific dates) falls to the routine path below.
      const rrule = data.recurrence ? recurrenceToRRule(data.recurrence) : null;
      if (data.category === 'event' && data.scheduledFor && isConnected && (!data.recurrence || rrule)) {
        try {
          const startTime = new Date(data.scheduledFor);
          const endTime = new Date(startTime.getTime() + (data.durationMinutes ?? 60) * 60000);

          const targetCalendar = getCalendarForDomain(data.context ?? null);

          await createEvent({
            title: data.title,
            startTime,
            endTime,
            // A date with no time is a day, not midnight (the parser zeroes it).
            allDay: data.isAllDay === true,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            calendarId: targetCalendar?.calendarId,
            recurrence: rrule ?? undefined,
          });

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const weekLater = new Date(today);
          weekLater.setDate(weekLater.getDate() + 7);
          await fetchEvents(today, weekLater);

          // Name the calendar, and say when the current view will not show it —
          // the event's life area is its calendar's mapping, and a Family view
          // hides a Personal calendar (Scott, 2026-09-20).
          // No chip → the default write calendar (null = Google primary), whose
          // life area is whatever it is mapped to. An unmapped primary is
          // unknown, so no warning is invented for it.
          const calendarLabel = targetCalendar?.calendarName ?? 'your primary calendar';
          const eventContext = targetCalendar ? (data.context ?? null) : getDomainForCalendar(defaultCalendarId ?? undefined);
          const hiddenEvent = (targetCalendar || defaultCalendarId) ? hiddenByView(eventContext, layers) : false;
          showToast(
            `${rrule ? 'Recurring event' : 'Event'} added to ${calendarLabel}${hiddenEvent ? ` · hidden by your current view (${contextLabel(eventContext)} is unchecked)` : ''}`,
            hiddenEvent ? 'warning' : 'success',
            hiddenEvent ? 8000 : undefined,
          );
          return;
        } catch (err) {
          console.error('Failed to sync event to Google Calendar:', err);
          showToast('Event created locally (Calendar sync failed)', 'warning');
          // Fall through to create local task as fallback.
        }
      }

      // Anything else that repeats is a routine, not a task: a task has one
      // day, and "take out trash every other monday" has a rule. The parsed
      // date's clock time is the routine's hour; a date with no time is none.
      if (data.recurrence) {
        const timeOfDay =
          data.scheduledFor && data.isAllDay !== true
            ? `${String(data.scheduledFor.getHours()).padStart(2, '0')}:${String(data.scheduledFor.getMinutes()).padStart(2, '0')}`
            : undefined;
        const routine = await addRoutine({
          name: data.title,
          recurrence_pattern: data.recurrence,
          time_of_day: timeOfDay,
          context: data.context,
          assigned_to: data.assignedMemberIds?.[0] ?? getCurrentUserMember()?.id ?? null,
          assigned_to_all: data.assignedMemberIds?.length ? data.assignedMemberIds : undefined,
        });
        if (routine) showToast('Routine created', 'success');
        return;
      }

      const explicitAssignment = data.assignedMemberIds?.length
        ? data.assignedMemberIds[0]
        : getCurrentUserMember()?.id;
      const taskId = await addTask(data.title, data.contactId, data.projectId, data.scheduledFor, {
        assignedTo: explicitAssignment,
        assignedToAll:
          data.assignedMemberIds?.length && data.assignedMemberIds.length > 1
            ? data.assignedMemberIds
            : undefined,
        category: data.category,
        context: data.context,
        isAllDay: data.isAllDay,
      });
      if (taskId) {
        if (data.scheduledFor) {
          const hidden = hiddenByView(data.context ?? null, layers);
          const when = data.scheduledFor.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          showToast(
            `Scheduled for ${when} · ${contextLabel(data.context ?? null)} · ${audienceLabel(data.context ?? null)}${hidden ? ' · hidden by your current view' : ''}`,
            hidden ? 'warning' : 'success',
            hidden ? 8000 : undefined,
          );
        } else showCaptureConfirmation(taskId, data.context ?? null);
      }
    },
    [addTask, addRoutine, isConnected, createEvent, fetchEvents, defaultCalendarId, getCalendarForDomain, getDomainForCalendar, getCurrentUserMember, showToast, showCaptureConfirmation, layers],
  );

  const onQuickAddNote = useCallback(
    async (data: QuickAddNoteData) => {
      let topicId: string | undefined;
      if (data.topicName) {
        const topic = activeTopics.find(
          (t) => t.name.toLowerCase() === data.topicName?.toLowerCase(),
        );
        topicId = topic?.id;
        if (!topicId) {
          const newTopic = await addTopic({ name: data.topicName });
          topicId = newTopic?.id;
        }
      }
      await addNote({ content: data.content, topicId });
      showToast('Note saved', 'success');
    },
    [activeTopics, addTopic, addNote, showToast],
  );

  // Reference data for the QuickCapture natural-language parser.
  const quickAddProjects = useMemo(
    () => projects.map((p) => ({ id: p.id, name: p.name })),
    [projects],
  );
  const quickAddContacts = useMemo(
    () => contacts.map((c) => ({ id: c.id, name: c.name })),
    [contacts],
  );
  // For the ⌘K destination line: which calendar an event would be written to.
  const eventCalendarName = useCallback(
    (context: TaskContext | null) => getCalendarForDomain(context)?.calendarName ?? null,
    [getCalendarForDomain],
  );

  const quickAddFamilyMembers = useMemo(
    () => familyMembers.map((m) => ({ id: m.id, name: m.name })),
    [familyMembers],
  );

  // ── Pins ──
  // Pin navigation: tasks open the global DetailPanel via selection; other
  // entity kinds route to their pages. (Lists have no dedicated route yet in
  // the Shell — best-effort navigate handled by the caller.)
  const handlePinNavigate = useCallback(
    (entityType: PinnableEntityType, entityId: string, navigate: (to: string) => void) => {
      switch (entityType) {
        case 'task':
          setSelection({ kind: 'task', id: entityId });
          break;
        case 'project':
          navigate(`/projects/${entityId}`);
          break;
        case 'contact':
          navigate(`/contacts/${entityId}`);
          break;
        case 'routine':
          navigate(`/routines/${entityId}`);
          break;
        case 'list':
          navigate('/lists');
          break;
      }
    },
    [setSelection],
  );

  const pinnedEntities = useMemo(
    () => ({
      tasks,
      projects,
      contacts,
      routines: allRoutines,
      lists: lists.map((l) => ({ id: l.id, name: l.title })),
    }),
    [tasks, projects, contacts, allRoutines, lists],
  );

  return {
    // QuickCapture
    onQuickAdd,
    onQuickAddRich,
    eventCalendarName,
    onQuickAddNote,
    quickAddProjects,
    quickAddContacts,
    quickAddFamilyMembers,
    // Pins
    pins: pinnedItems.pins,
    pinnedEntities,
    handlePinNavigate,
    markAccessed: pinnedItems.markAccessed,
    refreshStale: pinnedItems.refreshStale,
    // Toast (note creation feedback)
    toast,
    dismissToast,
    // Capture confirmation toast (inbox capture feedback + one-tap scheduling)
    confirmationToast,
    dismissConfirmationToast,
  };
}
