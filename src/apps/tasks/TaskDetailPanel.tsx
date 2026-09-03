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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { showToast } from '@/hooks/useToast';
import { useSelection } from '@/shell/providers/SelectionProvider';
import type { SelectionRef } from '@/shell/types';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions';
import { useContacts } from '@/hooks/useContacts';
import { useProjects } from '@/hooks/useProjects';
import { useGoogleCalendar, CalendarReconnectError, type GoogleCalendarInfo, type CalendarEvent } from '@/hooks/useGoogleCalendar';
import { useEventNotes, type EventNote } from '@/hooks/useEventNotes';
import { isEventFree, freeKeyFor, seriesKey } from '@/lib/today/eventFree';
import { useEventDiscussionFlags } from '@/hooks/useEventDiscussionFlags';
import { useActionableInstances } from '@/hooks/useActionableInstances';
import { useRoutines } from '@/hooks/useRoutines';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { usePinnedItems } from '@/hooks/usePinnedItems';
import { useMealEventsForDate } from '@/shell/providers/MealEventsProvider';
import { removeFromGroup, ungroupTasks, deleteTaskGroup } from '@/lib/today/groupTasks';
import { TapContextPanel } from '@/components/surface/TapContextPanel';
import { TapRoutinePanel } from '@/components/surface/TapRoutinePanel';
import { TapStepPanel } from '@/components/surface/TapStepPanel';
import { groupRoutineSteps } from '@/lib/today/routineCollections';
import { nextStepOrder } from '@/lib/today/stepOrdering';
import type { Routine } from '@/types/actionable';
import { TapEventPanel } from '@/components/surface/TapEventPanel';
import { TapMealPanel } from '@/components/surface/TapMealPanel';
import { applyTriageWhen, describeTriageWhen } from '@/lib/triage/applyWhen';
import { formatDateLabel } from '@/lib/dateHelpers';
import type { Task, TaskLink } from '@/types/task';
import { enrichLink } from '@/lib/enrichLink';

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

// Selectors for elements whose mousedown must NOT dismiss the open detail panel:
// interactive controls, selectable cards, and popovers that render outside the
// panel DOM (card action buttons + their portaled menus, and the panel's own
// portaled popovers). Without this, pressing a card's Reschedule/Add-Project/⋯/
// Context button while the panel is open is read as a "click away" and just
// closes the panel instead of running the action (and the panel should stay
// open through the interaction).
const PANEL_KEEPALIVE_SELECTOR =
  '[data-selectable], [data-panel-keepalive], button, a, input, textarea, select, [role="menu"], [role="menuitem"], [role="dialog"], [role="listbox"], [role="option"]';

/**
 * True when a mousedown on `target` (which is outside `panelEl`) should dismiss
 * the panel — i.e. it landed on genuinely neutral chrome, not on a card, a
 * control, or a popover. Exported for unit testing.
 */
export function shouldDismissPanel(target: HTMLElement | null, panelEl: HTMLElement | null): boolean {
  if (!target) return false;
  if (panelEl && panelEl.contains(target)) return false;
  if (target.closest(PANEL_KEEPALIVE_SELECTOR)) return false;
  return true;
}

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
      if (shouldDismissPanel(e.target as HTMLElement | null, panelRef.current)) {
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

/**
 * True when an open event panel points at an event that's no longer resolvable
 * and should be closed rather than left hanging on "Loading…".
 *
 * `events` is replaced wholesale on each day's fetch (scoped to the viewed day's
 * window — see useGoogleCalendar.fetchEvents), so an event rescheduled to another
 * day or deleted leaves the set while its id stays in ?detail=event:<id>. We only
 * close once the calendar has settled (not fetching/loading) AND the day loaded
 * at least one event — proof a fetch completed and this id genuinely isn't in it.
 * Without the `eventCount > 0` guard we'd close prematurely during the pre-fetch
 * tick on a fresh deep-link. Exported for unit testing.
 */
export function shouldCloseStaleEventPanel(opts: {
  found: boolean;
  isFetching: boolean;
  isLoading: boolean;
  eventCount: number;
}): boolean {
  const { found, isFetching, isLoading, eventCount } = opts;
  return !found && !isFetching && !isLoading && eventCount > 0;
}

// ── Task ──────────────────────────────────────────────────────────────────
function TaskPanelBody({ id }: { id: string }) {
  const autoOpenDiscussion = useAutoOpenDiscussion();
  const { clearSelection } = useSelection();
  const navigate = useNavigate();

  const { tasks, addSubtask, deleteTask, toggleTask, updateTask: rawUpdateTask, updateTasksBulk, pushTask, setBucket, refetch } = useSupabaseTasks();
  const { contacts, addContact, searchContacts } = useContacts();
  const { projects } = useProjects();
  const { events } = useGoogleCalendar();
  const { members: familyMembers } = useFamilyMembers();
  const pinnedItems = usePinnedItems();

  // Iris's rule: any process on an Unsorted item has to involve giving it a
  // domain — this panel is the other global mutation surface besides
  // Today/Inbox/the horizon pages, so it gets the same gate. `findTaskById`
  // reuses `findTask` (below) so a subtask id resolves too (onRescheduleSubtask
  // acts on children, which live one level down in `t.subtasks`, not in the
  // top-level `tasks` array). `raw` is memoized on its own stable
  // (useCallback-wrapped) members for referential stability. `updateTask` is
  // shadowed to the gated version so every existing call site below — not
  // just the four the gate was written for — goes through it uniformly.
  const findTaskById = useCallback((tid: string) => findTask(tasks, tid) ?? undefined, [tasks]);
  const gatedRaw = useMemo(
    () => ({ updateTask: rawUpdateTask, pushTask, updateTasksBulk, setBucket }),
    [rawUpdateTask, pushTask, updateTasksBulk, setBucket],
  );
  const gated = useGatedTaskActions(gatedRaw, findTaskById);
  const updateTask = gated.updateTask;

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
      // The why-chain (Task → Project → Goal) is not passed any more: Projects
      // are hidden from the product (2026-09-02 — see the note in Sidebar.tsx)
      // and WhyChain renders nothing without one. Component + test are parked.
      // createdByName not tracked in current data model
      onAssistMutate={refetch}
      autoOpenDiscussion={autoOpenDiscussion}
      onClose={handleClose}
      onTitleChange={(t) => updateTask(task.id, { title: t })}
      onNotesChange={(n) => updateTask(task.id, { notes: n })}
      onPhoneChange={(v) => updateTask(task.id, { phoneNumber: v })}
      onEmailChange={(v) => updateTask(task.id, { email: v })}
      // onSaveNoteToVault intentionally omitted (vault integration removed)
      onToggleComplete={() => toggleTask(task.id)}
      onSchedule={(date, isAllDay) => {
        void (async () => {
          const result = await updateTask(task.id, { bucket: 'timed', scheduledFor: date, isAllDay });
          // A cancelled domain gate writes nothing — no confirmation for a
          // move that didn't happen.
          if (result === false) return;
          const label = isAllDay
            ? formatDateLabel(date)
            : `${formatDateLabel(date)}, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
          showToast(`Moved to ${label}`, 'success');
        })();
      }}
      onReschedule={(when) => {
        // Gated pushTask/setBucket (not a hand-rolled bucket/scheduledFor
        // write) — same reason as horizons/shared.tsx's applyWhen: this is
        // the real hook logic (defer_count, weekStart, overdue time
        // preservation), and an Unsorted task reschedule here asks first.
        void (async () => {
          const ok = await applyTriageWhen(when, task.id, { onPushTask: gated.pushTask, onSetBucket: gated.setBucket! });
          if (ok) showToast(describeTriageWhen(when), 'success');
        })();
      }}
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
      onRescheduleSubtask={(sid, when) => {
        void (async () => {
          const ok = await applyTriageWhen(when, sid, { onPushTask: gated.pushTask, onSetBucket: gated.setBucket! });
          if (ok) showToast(describeTriageWhen(when), 'success');
        })();
      }}
      onScheduleSubtask={(sid, date, isAllDay) =>
        updateTask(sid, { bucket: 'timed', scheduledFor: date, isAllDay })
      }
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
        // Read the page now, while saving it is still the user's intent —
        // so the facts are on the card by the time the task surfaces.
        enrichLink('task', task.id, url, task.title);
      }}
      onUpdateLocation={(location, placeId) =>
        updateTask(task.id, { location, locationPlaceId: placeId })
      }
      onDirectionsChange={(directions) => updateTask(task.id, { directions })}
      onClearLocation={() =>
        updateTask(task.id, { location: undefined, locationPlaceId: undefined })
      }
      onContextChange={(ctx) => updateTask(task.id, { context: ctx ?? null })}
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
  const autoOpenDiscussion = useAutoOpenDiscussion();
  const { clearSelection, setSelection } = useSelection();
  // Search ALL routines (not just active): flipping a routine to "reference"
  // visibility removes it from the active set/timeline but the panel must stay
  // populated so it doesn't go blank (and so the user can flip it back).
  const { routines, updateRoutine, addRoutine, deleteRoutine, refetch: refetchRoutines } = useRoutines();
  const { members: familyMembers } = useFamilyMembers();

  const routine = useMemo(() => routines.find((r) => r.id === id), [routines, id]);
  // Steps of this collection, sorted the same way /routines sorts them.
  const steps = useMemo(
    () => groupRoutineSteps(routines).collections.find((c) => c.id === id)?.steps ?? [],
    [routines, id],
  );
  const parent = useMemo(
    () => (routine?.parent_routine_id ? routines.find((r) => r.id === routine.parent_routine_id) : undefined),
    [routines, routine],
  );
  const handleClose = useCallback(() => clearSelection(), [clearSelection]);

  if (!routine) return <PanelLoading />;

  // A collection STEP opens the step panel (doses, instructions, remove/delete)
  // with back-navigation to its parent — mirrors /routines.
  if (parent) {
    return (
      <TapStepPanel
        step={routine}
        parentName={parent.name}
        onClose={() => setSelection({ kind: 'routine', id: parent.id })}
        onRename={(name) => updateRoutine(routine.id, { name })}
        onDosesChange={(times) => updateRoutine(routine.id, { times_per_day: times })}
        onNotesChange={(description) => updateRoutine(routine.id, { description })}
        onScheduleChange={(pattern) => updateRoutine(routine.id, { recurrence_pattern: pattern })}
        onTargetChange={(t) => updateRoutine(routine.id, { target_amount: t?.amount ?? null, target_unit: t?.unit ?? null })}
        onPromote={() => {
          updateRoutine(routine.id, { parent_routine_id: null, step_order: null });
          setSelection({ kind: 'routine', id: parent.id });
        }}
        onDelete={() => {
          deleteRoutine(routine.id);
          setSelection({ kind: 'routine', id: parent.id });
        }}
      />
    );
  }

  return (
    <TapRoutinePanel
      routine={routine}
      familyMembers={familyMembers}
      onClose={handleClose}
      {...(steps.length > 0
        ? {
            steps,
            onSelectStep: (s: Routine) => setSelection({ kind: 'routine', id: s.id }),
            onAddStep: (name: string) =>
              addRoutine({ name, parent_routine_id: routine.id, step_order: nextStepOrder(steps) }),
            onReorderSteps: (writes: { id: string; step_order: number }[]) => {
              for (const w of writes) updateRoutine(w.id, { step_order: w.step_order });
            },
          }
        : {})}
      onRename={(name) => updateRoutine(routine.id, { name })}
      onNotesChange={(n) => updateRoutine(routine.id, { description: n })}
      onContextChange={(ctx) => updateRoutine(routine.id, { context: ctx ?? null })}
      onVisibilityChange={(v) => updateRoutine(routine.id, { visibility: v })}
      onAssignChange={(ids) => updateRoutine(routine.id, { assigned_to_all: ids })}
      onTargetChange={(t) => updateRoutine(routine.id, { target_amount: t?.amount ?? null, target_unit: t?.unit ?? null })}
      onScheduleChange={(pattern, timeOfDay) =>
        updateRoutine(routine.id, {
          recurrence_pattern: pattern,
          time_of_day: timeOfDay || null,
        })
      }
      onUpdateLocation={(location, placeId) =>
        updateRoutine(routine.id, { location, location_place_id: placeId ?? null })
      }
      onClearLocation={() =>
        updateRoutine(routine.id, { location: null, location_place_id: null })
      }
      onAssistMutate={refetchRoutines}
      autoOpenDiscussion={autoOpenDiscussion}
    />
  );
}

/** Midnight of the event's start day, for a day-scoped refetch after a move. */
function getEventDayStart(event: CalendarEvent): Date | null {
  const raw = event.start_time ?? event.startTime;
  if (!raw) return null;
  const d = new Date(raw);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Human-readable reasons a Google Calendar write can fail. 403 means the event
// lives on a calendar the user can't edit (an invite / shared / subscribed
// calendar) — say that plainly instead of a generic failure.
function eventUpdateErrorMessage(err: unknown): string {
  if (err instanceof CalendarReconnectError) return 'Calendar connection expired — reconnect in Settings';
  const msg = err instanceof Error ? err.message : String(err);
  if (/forbidden|403/i.test(msg)) {
    return "Google won't allow edits to this event — it's on a calendar you don't own (an invite or shared calendar)";
  }
  return 'Could not update the event';
}

// ── Event ─────────────────────────────────────────────────────────────────
function EventPanelBody({ id }: { id: string }) {
  const autoOpenDiscussion = useAutoOpenDiscussion();
  const { clearSelection } = useSelection();
  const navigate = useNavigate();
  const { events, updateEvent, moveEvent, fetchEvents, fetchCalendarList, isFetching, isLoading } = useGoogleCalendar();
  const { getNote, updateNote, fetchNote, addEventLink, updateEventFree } = useEventNotes();
  const { tasks, addPrepTask } = useSupabaseTasks();
  const {
    isFlagged,
    getFlag,
    flagEvent,
    unflagEvent,
    updateNote: updateDiscussionNote,
  } = useEventDiscussionFlags();

  // The calendar list tells us the event's access level (Google rejects writes
  // to view-only calendars) and which calendars it could move to.
  const [calendarList, setCalendarList] = useState<GoogleCalendarInfo[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchCalendarList().then((cals) => { if (!cancelled) setCalendarList(cals); });
    return () => { cancelled = true; };
  }, [fetchCalendarList]);

  // Event selection id is `google_event_id || id` (see CascadingRiverView).
  const event = useMemo(
    () => events.find((e) => (e.google_event_id || e.id) === id),
    [events, id],
  );
  const handleClose = useCallback(() => clearSelection(), [clearSelection]);

  // Warm the event-notes cache. getNote is cache-only and each hook instance
  // starts empty — without this fetch, saved notes/links never displayed.
  useEffect(() => {
    if (event) fetchNote(event.google_event_id || event.id);
  }, [event, fetchNote]);

  // "Free" can live on the SERIES note (recurring_event_id), not just the
  // instance note fetched above — warm that one too (fetchNote is a no-op
  // when the key is already cached, e.g. a non-recurring event) so the pill
  // reflects a flag set on a previous occurrence.
  useEffect(() => {
    if (event) fetchNote(freeKeyFor(event));
  }, [event, fetchNote]);

  // Done state lives in actionable_instances (Symphony-side, never a Google
  // write), keyed by the event's OWN start day — so completing works even when
  // the panel was opened from another day's view. Optimistic toggle; the Today
  // timeline picks the change up via its actionable_instances realtime refresh.
  const { getInstance, markDone, undoDone } = useActionableInstances();
  const [completed, setCompleted] = useState(false);
  const instanceDate = useMemo(() => (event ? getEventDayStart(event) : null), [event]);
  useEffect(() => {
    if (!event || !instanceDate) return;
    let cancelled = false;
    getInstance('calendar_event', event.google_event_id || event.id, instanceDate).then((instance) => {
      if (!cancelled) setCompleted(instance?.status === 'completed');
    });
    return () => { cancelled = true; };
  }, [event, getInstance, instanceDate]);

  const handleToggleComplete = useCallback(async () => {
    if (!event || !instanceDate) return;
    const eid = event.google_event_id || event.id;
    const next = !completed;
    setCompleted(next);
    const ok = next
      ? await markDone('calendar_event', eid, instanceDate)
      : await undoDone('calendar_event', eid, instanceDate);
    if (!ok) {
      setCompleted(!next);
      showToast('Could not update the event', 'error');
      return;
    }
    showToast(next ? 'Event completed' : 'Event marked incomplete', 'success');
  }, [event, instanceDate, completed, markDone, undoDone]);

  // Close the panel (rather than hang on "Loading…") when the selected event has
  // been rescheduled off this day or deleted — see shouldCloseStaleEventPanel.
  useEffect(() => {
    if (
      shouldCloseStaleEventPanel({
        found: !!event,
        isFetching,
        isLoading,
        eventCount: events.length,
      })
    ) {
      clearSelection();
    }
  }, [event, isFetching, isLoading, events.length, clearSelection]);

  if (!event) return <PanelLoading />;

  const eventId = event.google_event_id || event.id;

  // "Free" resolution: instance note wins, else the series note. getNote is
  // cache-only — the effects above warm both keys.
  const seriesEventKey = seriesKey(event);
  const freeNotes = new Map<string, EventNote>();
  const instanceNote = getNote(eventId);
  if (instanceNote) freeNotes.set(eventId, instanceNote);
  if (seriesEventKey) {
    const seriesNote = getNote(seriesEventKey);
    if (seriesNote) freeNotes.set(seriesEventKey, seriesNote);
  }
  const isFree = isEventFree(event, freeNotes);

  // Resolve the event's calendar in the account's calendar list. Events with
  // no calendar_id live on the primary calendar (always writable — it's ours).
  const eventCalendarId = event.calendar_id ?? event.calendarId;
  const eventCalendar = calendarList.find((c) =>
    eventCalendarId ? c.id === eventCalendarId : c.primary,
  );
  const calendarAccess = calendarList.length > 0
    ? {
        name: event.calendar_name ?? event.calendarName ?? eventCalendar?.summary ?? null,
        readOnly: eventCalendar ? eventCalendar.accessRole === 'reader' : false,
      }
    : undefined;
  const writableCalendars = calendarList
    .filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer')
    .map((c) => ({ id: c.id, summary: c.summary }));

  return (
    <TapEventPanel
      event={event}
      autoOpenDiscussion={autoOpenDiscussion}
      notes={getNote(eventId)?.notes ?? undefined}
      allTasks={tasks}
      completed={completed}
      onToggleComplete={handleToggleComplete}
      calendarAccess={calendarAccess}
      writableCalendars={writableCalendars}
      onMoveToCalendar={async (destinationCalendarId) => {
        try {
          await moveEvent({
            eventId,
            sourceCalendarId: eventCalendarId ?? 'primary',
            destinationCalendarId,
          });
          showToast('Event moved', 'success');
          // Refresh the day so the event reappears under its new calendar.
          const start = getEventDayStart(event);
          if (start) {
            const end = new Date(start); end.setHours(23, 59, 59, 999);
            await fetchEvents(start, end);
          }
        } catch (err) {
          showToast(eventUpdateErrorMessage(err), 'error', 4000);
        }
      }}
      onClose={handleClose}
      onNotesChange={(html) => updateNote(eventId, html)}
      onAddPrepTask={(title) => {
        // Prep tasks land on the event's day (a plain timed task linked to it).
        const when = getEventDayStart(event) ?? new Date();
        addPrepTask(title, eventId, when);
      }}
      links={getNote(eventId)?.links}
      onAddLink={(url) => addEventLink(eventId, url)}
      discussion={{ flagged: isFlagged(eventId), note: getFlag(eventId)?.discussionNote }}
      onToggleDiscussion={async (flagged) => {
        if (flagged) {
          await flagEvent(eventId, { title: event.title, calendarId: eventCalendarId ?? undefined });
        } else {
          await unflagEvent(eventId);
        }
      }}
      onDiscussionNoteChange={(note) => updateDiscussionNote(eventId, note)}
      free={isFree}
      freeAppliesToSeries={!!seriesEventKey}
      onToggleFree={(free) => updateEventFree(freeKeyFor(event), free)}
      onOpenTask={(tid) => navigate(`/today?detail=task:${tid}`)}
      onOpenProject={() => {}}
      onOpenRelated={() => {}}
      onUpdateEventLocation={async (eid, location, calendarId) => {
        try {
          await updateEvent({ eventId: eid, location, calendarId });
          showToast('Location updated', 'success');
        } catch (err) {
          showToast(eventUpdateErrorMessage(err), 'error', 4000);
        }
      }}
      onRenameEvent={async (nextTitle) => {
        try {
          await updateEvent({
            eventId: event.google_event_id ?? event.id,
            title: nextTitle,
            calendarId: event.calendar_id ?? event.calendarId,
          });
          showToast('Event renamed', 'success');
        } catch (err) {
          showToast(eventUpdateErrorMessage(err), 'error', 4000);
        }
      }}
      onReschedule={async (startTime, endTime) => {
        try {
          await updateEvent({
            eventId: event.google_event_id ?? event.id,
            startTime,
            endTime,
            calendarId: event.calendar_id ?? event.calendarId,
          });
          showToast('Event updated', 'success');
        } catch (err) {
          showToast(eventUpdateErrorMessage(err), 'error', 4000);
        }
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

/**
 * `?discuss=1` (the Discussions inbox deep link) opens the item's Discussion
 * as the panel mounts, then leaves the URL — a reload shouldn't reopen it.
 */
function useAutoOpenDiscussion(): boolean {
  const [searchParams, setSearchParams] = useSearchParams();
  const wanted = searchParams.get('discuss') === '1';
  const [auto] = useState(wanted);
  useEffect(() => {
    if (!wanted) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('discuss');
      return next;
    }, { replace: true });
  }, [wanted, setSearchParams]);
  return auto;
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
