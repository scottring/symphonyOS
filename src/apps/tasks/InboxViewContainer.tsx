// src/apps/tasks/InboxViewContainer.tsx
//
// Parallel-path /tasks-new/inbox container. Reuses the schedule-actions
// container scaffolding from HomeViewContainer to keep the existing
// InboxView component unchanged.

import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useEventNotes } from '@/hooks/useEventNotes';
import { useContacts } from '@/hooks/useContacts';
import { useProjects } from '@/hooks/useProjects';
import { useRoutines } from '@/hooks/useRoutines';
import { useActionableInstances } from '@/hooks/useActionableInstances';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useHiddenCalendarEvents } from '@/hooks/useHiddenCalendarEvents';
import { useScheduleActions } from '@/hooks/useScheduleActions';
import { useDomain } from '@/hooks/useDomain';
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings';
import { useListsContext } from '@/contexts/ListsContext';
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext';
import { useUndo } from '@/hooks/useUndo';
import { useConvertTaskToProject } from '@/hooks/useConvertTaskToProject';
import { InboxView } from '@/components/schedule/InboxView';
import { useSelection } from '@/shell/providers/SelectionProvider';

export function InboxViewContainer() {
  const navigate = useNavigate();
  const { tasks, loading: tasksLoading, addTask, toggleTask, toggleWaiting, deleteTask, updateTask, updateTasksBulk, pushTask } = useSupabaseTasks();
  const { events } = useGoogleCalendar();
  // Event ids opt in to auto-loaded, realtime event notes (see useEventNotes)
  const visibleEventIds = useMemo(() => events.map((e) => e.google_event_id || e.id), [events]);
  const { notes: eventNotesMap, updateEventAssignment, updateEventAssignmentAll, updateEventContext, updateEventProject } = useEventNotes(visibleEventIds);
  const { contacts, contactsMap, addContact, searchContacts } = useContacts();
  const { projects, projectsMap, addProject, deleteProject } = useProjects();
  const { routines: allRoutines, updateRoutine, deleteRoutine } = useRoutines();
  const { markDone, undoDone, skip, reschedule } = useActionableInstances();
  const { members: familyMembers, getCurrentUserMember } = useFamilyMembers();
  const { hideEvent } = useHiddenCalendarEvents();
  const { getDomainForCalendar } = useCalendarDomainMappings();
  const { lists, listsByCategory } = useListsContext();
  const { currentDomain } = useDomain();
  const undo = useUndo();

  const { selection, setSelection, clearSelection } = useSelection();

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
      const dashIdx = itemId.indexOf('-');
      if (dashIdx <= 0) return;
      const kind = itemId.slice(0, dashIdx);
      const id = itemId.slice(dashIdx + 1);
      if (kind !== 'task') return;
      setSelection({ kind, id });
    },
    [setSelection, clearSelection],
  );

  // Schedule action handlers — even though InboxView mostly cares about task
  // updates, refreshDateInstances and pushAction are required by the hook.
  const viewedDate = useMemo(() => new Date(), []);
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
    refreshDateInstances: () => {},
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

  // Expand a task into a new project (subtasks absorbed, parent task deleted).
  const handleConvertTaskToProject = useConvertTaskToProject(tasks, { addProject, updateTask, deleteTask });

  const scheduleActionsValue = useMemo<ScheduleActionsValue>(
    () => ({
      onToggleTask: toggleTask,
      onToggleWaiting: toggleWaiting,
      onUpdateTask: updateTask,
      onUpdateTasksBulk: updateTasksBulk,
      onPushTask: pushTask,
      onDeleteTask: deleteTask,
      onCreateTask: onCreateTaskFromValue,
      onOpenTask: (taskId: string) => setSelection({ kind: 'task', id: taskId }),
      onOpenProject: (projectId: string) => navigate(`/projects/${projectId}`),

      onAssignTask: scheduleActions.onAssignTask,
      onAssignTaskAll: scheduleActions.onAssignTaskAll,
      onAssignEvent: scheduleActions.onAssignEvent,
      onAssignEventAll: scheduleActions.onAssignEventAll,
      onAssignRoutine: scheduleActions.onAssignRoutine,
      onAssignRoutineAll: scheduleActions.onAssignRoutineAll,

      onCompleteRoutine: scheduleActions.onCompleteRoutine,
      onSkipRoutine: scheduleActions.onSkipRoutine,
      onPushRoutine: scheduleActions.onPushRoutine,
      onDeleteRoutine: scheduleActions.onDeleteRoutine,
      onUpdateRoutine: updateRoutine,

      onCompleteEvent: scheduleActions.onCompleteEvent,
      onSkipEvent: scheduleActions.onSkipEvent,
      onPushEvent: scheduleActions.onPushEvent,
      onUpdateEventContext: updateEventContext,
      onHideEvent: hideEvent,

      contactsMap,
      projectsMap,
      projects,
      contacts,
      familyMembers,
      lists,
      listsByCategory,
      eventNotesMap,
      eventContextOverrides,

      onAddProject: addProject,
      onConvertTaskToProject: handleConvertTaskToProject,
      onDeleteProject: deleteProject,
      onSearchContacts: searchContacts,
      onAddContact: (name, details) => addContact({ name, ...details }),

      getDomainForCalendar,

      onUpdateEventProject: updateEventProject,
    }),
    [
      toggleTask, toggleWaiting, updateTask, updateTasksBulk, pushTask, deleteTask, onCreateTaskFromValue,
      setSelection, navigate,
      scheduleActions, updateRoutine, updateEventContext, hideEvent,
      contactsMap, projectsMap, projects, contacts, familyMembers, lists, listsByCategory,
      eventNotesMap, eventContextOverrides,
      addProject, handleConvertTaskToProject, deleteProject, searchContacts, addContact, getDomainForCalendar,
      updateEventProject,
    ],
  );

  return (
    <ScheduleActionsProvider value={scheduleActionsValue}>
      <InboxView
        tasks={tasks}
        projects={projects}
        selectedItemId={selectedItemId}
        onSelectItem={handleSelectItem}
        panelOpen={selection !== null}
        onClosePanel={clearSelection}
        currentUserMemberId={getCurrentUserMember()?.id}
        loading={tasksLoading}
      />
    </ScheduleActionsProvider>
  );
}
