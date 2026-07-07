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
import { DenseInboxRow } from '@/components/schedule/DenseInboxRow';
import { TriageWhenMenu, type TriageWhen } from '@/components/schedule/TriageWhenMenu';
import { selectOverdue } from '@/lib/today/taskPools';
import { selectHorizonPool, HORIZONS, type HorizonId } from '@/lib/today/horizons';
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter';
import { useConvertTaskToProject } from '@/hooks/useConvertTaskToProject';
import { getBaseDate, getThisEvening, getNextWeekend, getWeekendAfterNext, getNextMonday } from '@/lib/dateHelpers';
import type { Task } from '@/types/task';

// First day of next month at midnight (the "Next month" triage target).
function firstOfNextMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}

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
  // Carry-over (overdue *dated* items) is a near-term concept: it belongs to
  // Today (rendered by HomeView) and to the weekly working set ("what you didn't
  // finish last week"). It must NOT bleed into Month / Season / Year / Someday —
  // those show only their own pool. (Someday is timeless; nothing is ever
  // "overdue" into it.) Showing the global overdue set on every horizon was the
  // bug where the same 5 items appeared as "carried over" everywhere.
  const showCarryOver = horizon === 'week';
  const carryOver = useMemo(
    () => (showCarryOver ? selectOverdue(tasks, true, match) : []),
    [showCarryOver, tasks, match],
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

  // ── Inline triage: route a row to a specific WHEN (reuses pushTask/setBucket).
  // Dated whens become a scheduled date (pushTask handles bucket=timed + all-day
  // inference — e.g. "Tonight" at 6pm is not all-day); pool whens set the bucket. ──
  const applyWhen = useCallback(
    (task: Task, when: TriageWhen) => {
      switch (when) {
        case 'today': pushTask(task.id, getBaseDate(0)); break;
        case 'tonight': pushTask(task.id, getThisEvening()); break;
        case 'tomorrow': pushTask(task.id, getBaseDate(1)); break;
        case 'this-week': setBucket(task.id, 'week'); break;
        case 'next-week': pushTask(task.id, getNextMonday()); break;
        case 'this-weekend': pushTask(task.id, getNextWeekend()); break;
        case 'next-weekend': pushTask(task.id, getWeekendAfterNext()); break;
        case 'this-month': setBucket(task.id, 'month'); break;
        case 'next-month': pushTask(task.id, firstOfNextMonth()); break;
        case 'someday': setBucket(task.id, 'someday'); break;
      }
    },
    [pushTask, setBucket],
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
          quickActions={[]}
          onQuickAction={() => {}}
          triageMenu={
            <TriageWhenMenu
              onPick={(when) => applyWhen(task, when)}
              onPickDate={(date) => pushTask(task.id, date)}
              onDelete={() => deleteTask(task.id)}
            />
          }
          onToggleComplete={() => toggleTask(task.id)}
          onUpdate={(updates) => updateTask(task.id, updates)}
          onSelect={() => handleSelect(task.id)}
          onAssign={(memberIds) => scheduleActions.onAssignTaskAll(task.id, memberIds)}
        />
      );
    },
    [projects, familyMembers, applyWhen, deleteTask, toggleTask, updateTask, handleSelect, scheduleActions],
  );

  // ── "Plan the [horizon]" — routes to the Today rung with a ?plan flag; the
  // HomeViewContainer opens the matching session (week/month/season/year). The
  // sessions live there so they share one task subscription. ──
  const handlePlan = useCallback(() => {
    navigate(`/today?plan=${horizon}`);
  }, [horizon, navigate]);

  // ── Year is a goals-level horizon — run the annual planning session, with a
  // door into the full Goals feature for deeper goal-setting. ──
  if (horizon === 'year') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-[940px] w-full px-4 py-4 md:pl-10 md:pr-8 md:py-8">
          <header className="mb-6">
            <h1 className="font-display text-2xl font-semibold text-neutral-800">This Year</h1>
            <p className="text-sm text-neutral-500 mt-1">The annual horizon — year in review, hopes &amp; fears, and your goals.</p>
          </header>
          <div className="card p-8 text-center">
            <CalendarRange className="w-8 h-8 text-primary-400 mx-auto mb-4" />
            <p className="font-display text-lg text-neutral-700 mb-2">Plan the year</p>
            <p className="text-neutral-500 mb-6">
              A reflective session — review the year, set macro hopes &amp; fears, and map the
              annual calendar. Goals live in the Goals library for ongoing tracking.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/today?plan=year')}
                className="btn-primary inline-flex items-center gap-2"
              >
                <CalendarRange className="w-4 h-4" /> Plan the year
              </button>
              <button
                type="button"
                onClick={() => navigate('/goals')}
                className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
              >
                <Target className="w-4 h-4" /> Open Goals
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const label = def?.label ?? 'Horizon';
  const total = pool.length + carryOver.length;
  // Someday has no planning session (it's a timeless pool); every dated horizon
  // does (week/month/season/year).
  const planDisabled = horizon === 'someday';

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
            {!planDisabled && (
              <button
                type="button"
                onClick={handlePlan}
                title={`Plan the ${label.replace(/^This /, '').toLowerCase()}`}
                className="shrink-0 inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors text-primary-700 bg-primary-50 hover:bg-primary-100"
              >
                <CalendarRange className="w-4 h-4" />
                Plan the {label.replace(/^This /, '').toLowerCase()}
              </button>
            )}
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
