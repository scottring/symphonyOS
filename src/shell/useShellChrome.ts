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
import { useProjects } from '@/hooks/useProjects';
import { useContacts } from '@/hooks/useContacts';
import { useRoutines } from '@/hooks/useRoutines';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings';
import { useDomain } from '@/hooks/useDomain';
import { usePinsContext } from '@/contexts/PinsContext';
import { useNotesContext } from '@/contexts/NotesContext';
import { useListsContext } from '@/contexts/ListsContext';
import { useToast } from '@/hooks/useToast';
import { useSelection } from './providers/SelectionProvider';
import { useDesktopBridge } from '@/desktop/useDesktopBridge';
import type { PinnableEntityType } from '@/types/pin';

interface QuickAddRichData {
  title: string;
  projectId?: string;
  contactId?: string;
  scheduledFor?: Date;
  durationMinutes?: number;
  category?: 'task' | 'chore' | 'errand' | 'event' | 'activity';
  context?: 'work' | 'family' | 'personal';
  assignedMemberIds?: string[];
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
  const { routines: allRoutines } = useRoutines();
  const { members: familyMembers, getCurrentUserMember } = useFamilyMembers();
  const { isConnected, createEvent, fetchEvents } = useGoogleCalendar();
  const { getCalendarForDomain } = useCalendarDomainMappings();
  const { currentDomain } = useDomain();
  // The shell-wide instance, shared with whatever app is routed below —
  // a private copy here would not see a pin made from /lists.
  const pinnedItems = usePinsContext();
  const { addNote, activeTopics, addTopic } = useNotesContext();
  const { lists } = useListsContext();
  const { toast, showToast, dismissToast } = useToast();
  const { setSelection } = useSelection();

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

  const showCaptureConfirmation = useCallback(
    (taskId: string) => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      const scheduleFor = (daysFromNow: number) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + daysFromNow);
        void pushTask(taskId, d);
        showToast(daysFromNow === 0 ? 'Scheduled for today' : 'Scheduled for tomorrow', 'success');
      };
      setConfirmationToast({
        id: taskId,
        message: 'Added to Inbox',
        hint: 'All set — or schedule it now:',
        actions: [
          { label: 'Today', onClick: () => scheduleFor(0) },
          { label: 'Tomorrow', onClick: () => scheduleFor(1) },
        ],
      });
      confirmTimerRef.current = setTimeout(() => setConfirmationToast(null), 8000);
    },
    [pushTask, showToast],
  );

  // ── QuickCapture handlers (mirror App.tsx) ──
  const onQuickAdd = useCallback(
    async (title: string) => {
      const taskId = await addTask(title, undefined, undefined, undefined, {
        assignedTo: getCurrentUserMember()?.id,
        context: currentDomain !== 'universal' ? currentDomain : undefined,
      });
      if (taskId) showCaptureConfirmation(taskId);
    },
    [addTask, getCurrentUserMember, currentDomain, showCaptureConfirmation],
  );

  const onQuickAddRich = useCallback(
    async (data: QuickAddRichData) => {
      // Event with a date + connected calendar → create in Google Calendar only.
      if (data.category === 'event' && data.scheduledFor && isConnected) {
        try {
          const startTime = new Date(data.scheduledFor);
          const endTime = new Date(startTime.getTime() + (data.durationMinutes ?? 60) * 60000);

          const explicitContext =
            data.context ?? (currentDomain !== 'universal' ? currentDomain : undefined);
          const targetCalendar = getCalendarForDomain(explicitContext ?? null);

          await createEvent({
            title: data.title,
            startTime,
            endTime,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            calendarId: targetCalendar?.calendarId,
          });

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const weekLater = new Date(today);
          weekLater.setDate(weekLater.getDate() + 7);
          await fetchEvents(today, weekLater);

          showToast('Event added to Google Calendar', 'success');
          return;
        } catch (err) {
          console.error('Failed to sync event to Google Calendar:', err);
          showToast('Event created locally (Calendar sync failed)', 'warning');
          // Fall through to create local task as fallback.
        }
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
      });
      if (taskId) {
        if (data.scheduledFor) showToast('Task scheduled', 'success');
        else showCaptureConfirmation(taskId);
      }
    },
    [addTask, isConnected, createEvent, fetchEvents, getCalendarForDomain, getCurrentUserMember, currentDomain, showToast, showCaptureConfirmation],
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
