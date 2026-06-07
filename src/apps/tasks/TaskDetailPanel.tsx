// src/apps/tasks/TaskDetailPanel.tsx
//
// The Shell's global detail panel for the Tasks app. Driven by the URL
// ?detail=<kind>:<id> selection (SelectionProvider). Branches on selection.kind
// and renders the matching panel-optimized surface panel inside a fixed
// side-panel chrome:
//
//   task    -> TapContextPanel   (full task surface — unchanged from pre-Shell)
//   routine -> TapRoutinePanel
//   event   -> TapEventPanel
//   meal    -> TapMealPanel       (event id `meal:<entryId>`)
//
// All kinds share the same fixed right-side aside + click-outside-to-close
// behavior (PanelChrome). The full-page task editor (TaskViewRedesign via
// TaskViewContainer) is NOT used here — it's a multi-column page layout that
// collapses/overlaps at ~480px panel width; that lives at the full-page route.
//
// The exact prop wiring for routine/event/meal mirrors the pre-Shell App.tsx
// (the panels themselves are reused verbatim — see src/components/surface/).
// Vault integration is intentionally NOT wired (vault is being removed):
// onSaveNoteToVault is omitted so the "Save to vault" affordance stays hidden.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelection } from '@/shell/providers/SelectionProvider';
import type { SelectionRef } from '@/shell/types';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useContacts } from '@/hooks/useContacts';
import { useProjects } from '@/hooks/useProjects';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useEventNotes } from '@/hooks/useEventNotes';
import { useRoutines } from '@/hooks/useRoutines';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { usePinnedItems } from '@/hooks/usePinnedItems';
import { useMealEventsForDate } from '@/shell/providers/MealEventsProvider';
import { removeFromGroup, ungroupTasks, deleteTaskGroup } from '@/lib/today/groupTasks';
import { TapContextPanel } from '@/components/surface/TapContextPanel';
import { TapRoutinePanel } from '@/components/surface/TapRoutinePanel';
import { TapEventPanel } from '@/components/surface/TapEventPanel';
import { TapMealPanel } from '@/components/surface/TapMealPanel';
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

/**
 * Shared side-panel chrome: the fixed right-side aside + click-outside-to-close.
 * Every kind renders through this so the close behavior is identical (and so
 * clicking another card still switches selection — the card's click fires
 * setSelection after this clears, landing on the new item).
 */
function PanelChrome({ children }: { children: React.ReactNode }) {
  const { clearSelection } = useSelection();
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
  return (
    <aside ref={panelRef} data-testid="task-detail-panel" className={panelClassName}>
      {children}
    </aside>
  );
}

function PanelLoading() {
  return <div className="p-8 text-center text-neutral-500">Loading…</div>;
}

// ── Task ──────────────────────────────────────────────────────────────────
function TaskPanelBody({ id }: { id: string }) {
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

  const task = useMemo(() => findTask(tasks, id), [tasks, id]);

  const handleClose = useCallback(() => clearSelection(), [clearSelection]);

  if (!task) return <PanelLoading />;

  const childIds = (task.subtasks ?? []).map((s) => s.id);

  return (
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
      onOpenContact={(cid) => navigate(`/contacts/${cid}`)}
      onOpenMember={(mid) => navigate(`/family/${mid}`)}
      onOpenProject={(pid) => navigate(`/projects/${pid}`)}
      onOpenEvent={(eid) => navigate(`/today?detail=event:${eid}`)}
      onOpenTask={(tid) => navigate(`/today?detail=task:${tid}`)}
      onOpenRelated={(kind, rid) => {
        if (kind === 'task') navigate(`/today?detail=task:${rid}`);
        // other kinds: no-op for now
      }}
      onToggleSubtask={(sid) => toggleTask(sid)}
      onAddSubtask={(title) => addSubtask(task.id, title)}
      onRemoveSubtask={(sid) => {
        void removeFromGroup(sid, { updateTask, refetch });
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
      onContactChange={(cid) => updateTask(task.id, { contactId: cid })}
      onSearchContacts={searchContacts}
      onAddContact={(name, details) => addContact({ name, ...details })}
    />
  );
}

// ── Routine ─────────────────────────────────────────────────────────────────
function RoutinePanelBody({ id }: { id: string }) {
  const { clearSelection } = useSelection();
  // Search ALL routines (not just active): flipping a routine to "reference"
  // visibility removes it from the active set/timeline but the panel must stay
  // populated so it doesn't go blank (and so the user can flip it back).
  const { routines, updateRoutine } = useRoutines();
  const { members: familyMembers } = useFamilyMembers();

  const routine = useMemo(() => routines.find((r) => r.id === id), [routines, id]);
  const handleClose = useCallback(() => clearSelection(), [clearSelection]);

  if (!routine) return <PanelLoading />;

  return (
    <TapRoutinePanel
      routine={routine}
      familyMembers={familyMembers}
      onClose={handleClose}
      onRename={(name) => updateRoutine(routine.id, { name })}
      onNotesChange={(n) => updateRoutine(routine.id, { description: n })}
      onContextChange={(ctx) => updateRoutine(routine.id, { context: ctx ?? null })}
      onVisibilityChange={(v) => updateRoutine(routine.id, { visibility: v })}
      onAssignChange={(ids) => updateRoutine(routine.id, { assigned_to_all: ids })}
      onScheduleChange={(pattern, timeOfDay) =>
        updateRoutine(routine.id, {
          recurrence_pattern: pattern,
          time_of_day: timeOfDay || null,
        })
      }
    />
  );
}

// ── Event ─────────────────────────────────────────────────────────────────
function EventPanelBody({ id }: { id: string }) {
  const { clearSelection } = useSelection();
  const navigate = useNavigate();
  const { events, updateEvent } = useGoogleCalendar();
  const { getNote, updateNote } = useEventNotes();
  const { tasks } = useSupabaseTasks();

  // Event selection id is `google_event_id || id` (see CascadingRiverView).
  const event = useMemo(
    () => events.find((e) => (e.google_event_id || e.id) === id),
    [events, id],
  );
  const handleClose = useCallback(() => clearSelection(), [clearSelection]);

  if (!event) return <PanelLoading />;

  const eventId = event.google_event_id || event.id;

  return (
    <TapEventPanel
      event={event}
      notes={getNote(eventId)?.notes ?? undefined}
      allTasks={tasks}
      onClose={handleClose}
      onNotesChange={(html) => updateNote(eventId, html)}
      onAddPrepTask={() => { /* TODO: integrate addPrepTask */ }}
      onMore={() => {}}
      onAddLink={() => {}}
      onOpenTask={(tid) => navigate(`/today?detail=task:${tid}`)}
      onOpenProject={() => {}}
      onOpenRelated={() => {}}
      onUpdateEventLocation={async (eid, location, calendarId) => {
        await updateEvent({ eventId: eid, location, calendarId });
      }}
      onReschedule={async (startTime, endTime) => {
        await updateEvent({
          eventId: event.google_event_id ?? event.id,
          startTime,
          endTime,
          calendarId: event.calendar_id ?? event.calendarId,
        });
      }}
    />
  );
}

// ── Meal ─────────────────────────────────────────────────────────────────
function MealPanelBody({ id }: { id: string }) {
  const { clearSelection } = useSelection();
  // Meal selection id is `meal:<entryId>`; the synthesized event for it is
  // produced by MealEventsProvider for a given date. Meals tapped from a
  // horizon are for the viewed day, so resolve against today's set.
  const today = useMemo(() => new Date(), []);
  const mealEvents = useMealEventsForDate(today);

  const event = useMemo(() => mealEvents.find((e) => e.id === id), [mealEvents, id]);
  const handleClose = useCallback(() => clearSelection(), [clearSelection]);

  if (!event) return <PanelLoading />;

  return <TapMealPanel event={event} onClose={handleClose} />;
}

export function TaskDetailPanel({ selection }: { selection: SelectionRef }) {
  return (
    <PanelChrome>
      {selection.kind === 'task' ? (
        <TaskPanelBody id={selection.id} />
      ) : selection.kind === 'routine' ? (
        <RoutinePanelBody id={selection.id} />
      ) : selection.kind === 'event' ? (
        <EventPanelBody id={selection.id} />
      ) : selection.kind === 'meal' ? (
        <MealPanelBody id={selection.id} />
      ) : (
        <PanelLoading />
      )}
    </PanelChrome>
  );
}
