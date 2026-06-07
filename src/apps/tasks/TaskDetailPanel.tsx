// src/apps/tasks/TaskDetailPanel.tsx
//
// Renders the panel-optimized surface panel (TapContextPanel) inside a fixed
// side panel, driven by the URL ?detail=task:<id> selection.
//
// This is the same panel the app used before the Shell. The full-page editor
// (TaskViewRedesign via TaskViewContainer) is NOT used here — it's a multi-column
// page layout that collapses/overlaps at ~480px panel width. The full-page route
// at /tasks-new/task/:taskId still uses TaskViewContainer.
//
// Vault integration is intentionally NOT wired: onSaveNoteToVault is omitted so
// the "Save to vault" affordance stays hidden (vault is being removed).

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelection } from '@/shell/providers/SelectionProvider';
import type { SelectionRef } from '@/shell/types';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useContacts } from '@/hooks/useContacts';
import { useProjects } from '@/hooks/useProjects';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { usePinnedItems } from '@/hooks/usePinnedItems';
import { useMealEventsForDate } from '@/shell/providers/MealEventsProvider';
import { removeFromGroup, ungroupTasks, deleteTaskGroup } from '@/lib/today/groupTasks';
import { TapContextPanel } from '@/components/surface/TapContextPanel';
import type { Task, TaskLink } from '@/types/task';

/** Find a task by id, searching one level of nested subtasks (group children). */
function findTask(tasks: Task[], id: string): Task | null {
  for (const t of tasks) {
    if (t.id === id) return t;
    const child = t.subtasks?.find((s) => s.id === id);
    if (child) return child;
  }
  return null;
}

const panelClassName =
  'fixed right-0 top-0 z-30 h-screen w-full md:w-[480px] border-l border-neutral-200 bg-bg-elevated overflow-y-auto shadow-xl';

export function TaskDetailPanel({ selection }: { selection: SelectionRef }) {
  const { clearSelection } = useSelection();
  const navigate = useNavigate();

  const { tasks, addSubtask, deleteTask, toggleTask, updateTask, refetch } = useSupabaseTasks();
  const { contacts, addContact, searchContacts } = useContacts();
  const { projects } = useProjects();
  const { events } = useGoogleCalendar();
  const { members: familyMembers } = useFamilyMembers();
  const pinnedItems = usePinnedItems();

  // Meal-plan entries synthesized as CalendarEvent objects, for linked-event
  // resolution (mirrors the legacy `eventsWithMeals`).
  const today = useMemo(() => new Date(), []);
  const mealEvents = useMealEventsForDate(today);
  const eventsWithMeals = useMemo(() => [...events, ...mealEvents], [events, mealEvents]);

  const task = useMemo(() => findTask(tasks, selection.id), [tasks, selection.id]);

  const handleClose = useCallback(() => clearSelection(), [clearSelection]);

  // Click-outside to close. Clicking another task card still switches: the card's
  // click fires setSelection after this clears, so it lands on the new task.
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        clearSelection();
      }
    }
    const id = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onDown);
    };
  }, [clearSelection]);

  if (!task) {
    // Still loading (or gone) — render the chrome with a small loading state so
    // the panel doesn't flash/crash. SelectionProvider keys a fresh mount per id.
    return (
      <aside ref={panelRef} data-testid="task-detail-panel" className={panelClassName}>
        <div className="p-8 text-center text-neutral-500">Loading…</div>
      </aside>
    );
  }

  const childIds = (task.subtasks ?? []).map((s) => s.id);

  return (
    <aside ref={panelRef} data-testid="task-detail-panel" className={panelClassName}>
      <TapContextPanel
        task={task}
        contacts={contacts}
        projects={projects}
        events={eventsWithMeals}
        familyMembers={familyMembers}
        siblingTaskCandidates={tasks}
        allTasks={tasks}
        // createdByName not tracked in current data model
        onClose={handleClose}
        onTitleChange={(t) => updateTask(task.id, { title: t })}
        onNotesChange={(n) => updateTask(task.id, { notes: n })}
        // onSaveNoteToVault intentionally omitted (vault integration removed)
        onToggleComplete={() => toggleTask(task.id)}
        onSchedule={(date, isAllDay) =>
          updateTask(task.id, { bucket: 'timed', scheduledFor: date, isAllDay })
        }
        onClearSchedule={() =>
          updateTask(task.id, { bucket: 'inbox', scheduledFor: undefined, isAllDay: undefined })
        }
        isPinned={pinnedItems.isPinned('task', task.id)}
        onTogglePin={() => {
          if (pinnedItems.isPinned('task', task.id)) pinnedItems.unpin('task', task.id);
          else pinnedItems.pin('task', task.id);
        }}
        onDelete={() => {
          deleteTask(task.id);
          handleClose();
        }}
        onOpenContact={(id) => navigate(`/contacts/${id}`)}
        onOpenMember={(id) => navigate(`/family/${id}`)}
        onOpenProject={(id) => navigate(`/projects/${id}`)}
        onOpenEvent={(id) => navigate(`/today?detail=event:${id}`)}
        onOpenTask={(id) => navigate(`/today?detail=task:${id}`)}
        onOpenRelated={(kind, id) => {
          if (kind === 'task') navigate(`/today?detail=task:${id}`);
          // other kinds: no-op for now
        }}
        onToggleSubtask={(id) => toggleTask(id)}
        onAddSubtask={(title) => addSubtask(task.id, title)}
        onRemoveSubtask={(id) => {
          void removeFromGroup(id, { updateTask, refetch });
        }}
        onUngroup={() => {
          void ungroupTasks(task.id, childIds, { updateTask, deleteTask, refetch });
          handleClose();
        }}
        onDeleteGroup={() => {
          void deleteTaskGroup(task.id, childIds, { deleteTask, refetch });
          handleClose();
        }}
        onAddLink={(url) => {
          const next: TaskLink[] = [...(task.links ?? []), { url }];
          updateTask(task.id, { links: next });
        }}
        onUpdateLocation={(location, placeId) =>
          updateTask(task.id, { location, locationPlaceId: placeId })
        }
        onClearLocation={() =>
          updateTask(task.id, { location: undefined, locationPlaceId: undefined })
        }
        onContextChange={(ctx) => updateTask(task.id, { context: ctx ?? null })}
        onScopeChange={(scope) => updateTask(task.id, { scope })}
        onAssigneesChange={(ids) =>
          updateTask(task.id, { assignedToAll: ids.length > 0 ? ids : undefined })
        }
        onContactChange={(id) => updateTask(task.id, { contactId: id })}
        onSearchContacts={searchContacts}
        onAddContact={(name, details) => addContact({ name, ...details })}
      />
    </aside>
  );
}
