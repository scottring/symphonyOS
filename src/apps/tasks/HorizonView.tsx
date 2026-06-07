// src/apps/tasks/HorizonView.tsx
//
// Phase 2b — the horizon-scoped view each rhythm rung routes to.
//
// INVARIANT (critical): a horizon view shows ONLY that horizon's scoped pool
// (`selectHorizonPool`) + carry-over (`selectOverdue`) — never the full task
// list. Today keeps its rich view (HomeViewContainer); this container serves
// Week / Month / Season / Someday. Year is a goals-level horizon and renders a
// placeholder pointing at Goals (its session is Phase 3).
//
// Data + action scaffolding mirror InboxViewContainer so the existing
// DenseInboxRow + global DetailPanel (tap-to-detail) work unchanged.

import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarRange, Target } from 'lucide-react';
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
import { useSelection } from '@/shell/providers/SelectionProvider';
import { DenseInboxRow, type QuickAction } from '@/components/schedule/DenseInboxRow';
import { selectOverdue } from '@/lib/today/taskPools';
import { selectHorizonPool, HORIZONS, type HorizonId } from '@/lib/today/horizons';
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter';
import type { Task } from '@/types/task';

// Triage actions available on each horizon row (re-route into another horizon).
const HORIZON_ACTIONS: QuickAction[] = [
  { kind: 'today' }, { kind: 'week' }, { kind: 'month' }, { kind: 'someday' }, { kind: 'delete' },
];

interface HorizonViewProps {
  horizon: HorizonId;
}

export function HorizonView({ horizon }: HorizonViewProps) {
  const navigate = useNavigate();
  const def = HORIZONS.find((h) => h.id === horizon);

  const {
    tasks, addTask, toggleTask, toggleWaiting, deleteTask, updateTask, updateTasksBulk, pushTask, setBucket,
  } = useSupabaseTasks();
  const { events } = useGoogleCalendar();
  const { notes: eventNotesMap, updateEventAssignment, updateEventAssignmentAll, updateEventContext, updateEventProject } = useEventNotes();
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

  const { setSelection } = useSelection();

  // ── Scope lens (W3 minimal: "Everyone"). The lens UI (Just me / Us /
  // Everyone) is a follow-up W3 step; the matcher is already plumbed so flipping
  // it later is a one-line change. ──
  const match = useMemo(() => makeAssigneeFilter([]), []);

  // ── The scoped pool + carry-over. THE INVARIANT lives here. ──
  // Carry-over (overdue dated items) is shown on every horizon as the calm
  // "carried over" set; the pool is strictly this horizon's bucket.
  const carryOver = useMemo(
    () => selectOverdue(tasks, true, match),
    [tasks, match],
  );
  const pool = useMemo(
    () => selectHorizonPool(tasks, horizon, match),
    [tasks, horizon, match],
  );

  // ── Tap-to-detail via the global DetailPanel (SelectionProvider). ──
  const handleSelect = useCallback(
    (taskId: string) => setSelection({ kind: 'task', id: taskId }),
    [setSelection],
  );

  // ── Schedule actions (mirrors InboxViewContainer scaffolding). ──
  const viewedDate = useMemo(() => new Date(), []);
  const scheduleActions = useScheduleActions({
    tasks, events, allRoutines, familyMembers, viewedDate,
    updateTask, updateRoutine, deleteRoutine,
    updateEventAssignment, updateEventAssignmentAll,
    markDone, undoDone, skip, reschedule,
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
      onDeleteProject: deleteProject,
      onSearchContacts: searchContacts,
      onAddContact: (name, details) => addContact({ name, ...details }),

      getDomainForCalendar,
      onUpdateEventProject: updateEventProject,
    }),
    [
      toggleTask, toggleWaiting, updateTask, updateTasksBulk, pushTask, deleteTask, onCreateTaskFromValue,
      setSelection,
      scheduleActions, updateRoutine, updateEventContext, hideEvent,
      contactsMap, projectsMap, projects, contacts, familyMembers, lists, listsByCategory,
      eventNotesMap, eventContextOverrides,
      addProject, deleteProject, searchContacts, addContact, getDomainForCalendar,
      updateEventProject,
    ],
  );

  // ── Inline triage: route a row into another horizon (reuses pushTask/setBucket). ──
  const applyTriage = useCallback(
    (task: Task, action: QuickAction) => {
      if (action.kind === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        pushTask(task.id, today);
      } else if (action.kind === 'week' || action.kind === 'month') {
        setBucket(task.id, action.kind);
      } else if (action.kind === 'someday') {
        setBucket(task.id, 'someday');
      } else if (action.kind === 'delete') {
        deleteTask(task.id);
      }
    },
    [pushTask, setBucket, deleteTask],
  );

  const renderRow = useCallback(
    (task: Task) => {
      const project = projects.find((p) => p.id === task.projectId);
      return (
        <DenseInboxRow
          key={task.id}
          task={task}
          project={project}
          projects={projects}
          familyMembers={familyMembers}
          quickActions={HORIZON_ACTIONS}
          onQuickAction={(action) => applyTriage(task, action)}
          onToggleComplete={() => toggleTask(task.id)}
          onUpdate={(updates) => updateTask(task.id, updates)}
          onSelect={() => handleSelect(task.id)}
          onAssign={(memberIds) => scheduleActions.onAssignTaskAll(task.id, memberIds)}
        />
      );
    },
    [projects, familyMembers, applyTriage, toggleTask, updateTask, handleSelect, scheduleActions],
  );

  // ── "Plan the [horizon]" — Week wires to the existing WeeklyPlanningSession
  // (opened on the Today rung via its own state); others are Phase-3 stubs. ──
  const handlePlan = useCallback(() => {
    if (horizon === 'week') {
      // The wired WeeklyPlanningSession lives in HomeViewContainer (Today rung).
      // Route there with a flag so it opens the weekly session.
      navigate('/today?plan=week');
    }
    // month/season: Phase 3 — stub (no-op beyond the disabled affordance).
  }, [horizon, navigate]);

  // ── Year is a goals-level horizon — placeholder pointing at Goals. ──
  if (horizon === 'year') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-[940px] w-full px-4 py-4 md:pl-10 md:pr-8 md:py-8">
          <header className="mb-6">
            <h1 className="font-display text-2xl font-semibold text-neutral-800">This Year</h1>
            <p className="text-sm text-neutral-500 mt-1">Your annual horizon lives in Goals.</p>
          </header>
          <div className="card p-8 text-center">
            <Target className="w-8 h-8 text-primary-400 mx-auto mb-4" />
            <p className="font-display text-lg text-neutral-700 mb-2">Plan your year in Goals</p>
            <p className="text-neutral-500 mb-6">
              Annual planning is a goals-level session (coming in Phase 3). For now, set your
              yearly intentions as goals.
            </p>
            <button
              type="button"
              onClick={() => navigate('/goals')}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Target className="w-4 h-4" /> Open Goals
            </button>
          </div>
        </div>
      </div>
    );
  }

  const label = def?.label ?? 'Horizon';
  const total = pool.length + carryOver.length;
  const planDisabled = horizon !== 'week';

  return (
    <ScheduleActionsProvider value={scheduleActionsValue}>
      <div className="h-full overflow-y-auto">
        <div className="max-w-[940px] w-full px-4 py-4 md:pl-10 md:pr-8 md:py-8">
          <header className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-semibold text-neutral-800">{label}</h1>
              <p className="text-sm text-neutral-500 mt-1">
                {total === 0
                  ? 'Nothing here yet'
                  : `${pool.length} in this horizon${carryOver.length > 0 ? ` · ${carryOver.length} carried over` : ''}`}
              </p>
            </div>
            <button
              type="button"
              onClick={handlePlan}
              disabled={planDisabled}
              title={planDisabled ? 'Planning session coming in Phase 3' : `Plan the ${label.toLowerCase()}`}
              className={`shrink-0 inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                planDisabled
                  ? 'text-neutral-300 cursor-not-allowed'
                  : 'text-primary-700 bg-primary-50 hover:bg-primary-100'
              }`}
            >
              <CalendarRange className="w-4 h-4" />
              Plan the {label.replace(/^This /, '').toLowerCase()}
            </button>
          </header>

          {/* Carry-over — calm "carried over" framing, shown on every horizon. */}
          {carryOver.length > 0 && (
            <section className="mb-6">
              <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">
                Carried over ({carryOver.length})
              </h2>
              <div className="space-y-2">{carryOver.map(renderRow)}</div>
            </section>
          )}

          {/* The horizon's scoped pool. */}
          <section>
            <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">
              {label} ({pool.length})
            </h2>
            {pool.length === 0 ? (
              <div className="text-center py-12 text-neutral-400">
                <p className="font-display text-lg text-neutral-600 mb-1">Nothing in {label.toLowerCase()}</p>
                <p className="text-sm">Triage items here from your Inbox.</p>
              </div>
            ) : (
              <div className="space-y-2">{pool.map(renderRow)}</div>
            )}
          </section>
        </div>
      </div>
    </ScheduleActionsProvider>
  );
}

// Bound components so routes stay declarative (one per rung).
export const WeekView = () => <HorizonView horizon="week" />;
export const MonthView = () => <HorizonView horizon="month" />;
export const SeasonView = () => <HorizonView horizon="season" />;
export const YearView = () => <HorizonView horizon="year" />;
export const SomedayView = () => <HorizonView horizon="someday" />;
